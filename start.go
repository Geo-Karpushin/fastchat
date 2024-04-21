package main

//=================IMPORT================\\

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gocql/gocql"
	"github.com/gorilla/websocket"
)

//=================TYPES==================\\

type user struct {
	c             *websocket.Conn
	i             string
	endConnection *func()
	mux           sync.Mutex
}

type DBConnection struct {
	cluster *gocql.ClusterConfig
	session *gocql.Session
	mux     sync.Mutex
}

type Users struct {
	u   map[string][](*user)
	mux sync.Mutex
}

type Message struct {
	Code int    `json:"code"`
	Text string `json:"text"`
	Tag  string `json:"tag"`
	Time string `json:"time"`
}

type Question struct {
	Question string `json:"question"`
}

//=================CONFIG=================\\

const version string = "v0.4.4"
const updateDay string = "31.12.2023"
const maxIDlen int = 11
const minIDlen int = 4
const generateIDlen = 5
const HTTPSport string = "443"
const HTTPport string = "80"
const maxSizeInBytes = 10485760
const timeLayout = "2006-01-02T15:04:05.999-0700"

var db DBConnection
var ctx context.Context
var users Users
var IsLetter = regexp.MustCompile(`^[a-z0-9]+$`).MatchString
var runesForID = []rune("abcdefghijklmnopqrstuvwxyz0123456789")
var questionFile *os.File

/*
Запросы от клиента:
0 - установка подключения
1 - сообщение
2 - файл
3 - новый пароль
4 - старые сообщения
5 - проверить пароль
6 - запрос файла
7 - смена темы

Запросы от сервера:
0 - установка подключения (сменить ID с перезагрузкой)
1 - сообщение
2 - файл
3 - сменить ID без перезагрузки страницы
5 - проверить пароль (запрос)
6 - отправка имени файла
7 - назначение темы
*/

//=================CODE===================\\

func main() {
	f, err := os.OpenFile("logs", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("Ошибка логов: %v", err)
	}
	defer f.Close()
	log.SetOutput(f)
	log.Println(version + "---------==== FASTCHAT ====---------" + updateDay)
	log.Println("Запуск сервера...")
	defer log.Println("Завершение работы...")

	users.u = make(map[string][](*user))
	ctx = context.Background()

	log.Println("Подключение к БД...")

	setDBconnection()

	log.Println("Успешное подключение к БД")

	log.Println("Регистрация файлов и путей сайта...")

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		var locIsFile bool
		fileInfo, err := os.Stat("./public" + r.URL.Path)
		if err != nil {
			locIsFile = false
		} else {
			locIsFile = !fileInfo.IsDir()
		}
		if !locIsFile {
			fileInfo, err = os.Stat("./public" + r.URL.Path + "/index.html")
			if err != nil {
				locIsFile = false
			} else {
				locIsFile = !fileInfo.IsDir()
			}
			if locIsFile {
				http.FileServer(http.Dir("./public")).ServeHTTP(w, r)
			} else {
				http.Error(w, "Кажется, такой  страницы нету :(", 404)
			}
		} else {
			http.FileServer(http.Dir("./public")).ServeHTTP(w, r)
		}
	})
	http.HandleFunc("/speaker", speaker)
	http.HandleFunc("/questions", questionSaver)

	log.Println("Файлы и пути зарегестрированы")

	newQuestionFile, err := os.OpenFile("newquestions", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)

	if err != nil {
		log.Panic(err)
	}

	questionFile = newQuestionFile

	log.Println("Сервер запущен. Прослушиваются порты", HTTPport, HTTPSport)
	go func() {
		if err := http.ListenAndServe(":"+HTTPport, http.HandlerFunc(redirectToHTTPS)); err != nil {
			log.Printf("Ошибка ListenAndServe: %v", err)
		}
	}()
	// log.Fatal(http.ListenAndServe(":3003", nil))
	log.Fatal(http.ListenAndServeTLS(":"+HTTPSport, "/etc/letsencrypt/live/fastchat.space-0003/cert.pem", "/etc/letsencrypt/live/fastchat.space-0003/privkey.pem", nil))
}

func speaker(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Upgrade(w, r, nil, maxSizeInBytes, maxSizeInBytes)
	if err != nil {
		http.Error(w, "Ошибка перехода к WebSocket соединению", 500)
		log.Panic("Ошибка перехода к WebSocket соединению:", err)
	}
	c.SetReadLimit(maxSizeInBytes)
	if err != nil {
		log.Panic(err)
	}
	var chatID string
	var rop bool
	var cuser user
	var mess Message
	endConnection := func() {
		c.Close()
		log.Println("Клиент:", r.RemoteAddr+". Отключен.")
		DEL(chatID, r.RemoteAddr)
	}
	log.Println("Клиент:", r.RemoteAddr+". Подключен.")
	for {
		messType, inBin, err := c.ReadMessage()
		if err != nil || messType == 8 {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseTLSHandshake) {
				endConnection()
				log.Panic(err)
			}
			break
		}
		if messType == 1 {
			err = json.Unmarshal(inBin, &mess)
			if err != nil {
				endConnection()
				log.Panic(err)
			}
			switch mess.Code {
			case 0:
				mess.Text = strings.ToLower(mess.Text)
				lenMessText := len(mess.Text)
				if mess.Text != "" && IsLetter(mess.Text) && lenMessText > minIDlen && lenMessText < maxIDlen {
					exist, setPassword, lrop, theme := checkChat(mess.Text)
					rop = lrop
					if exist {
						out, err := json.Marshal(Message{7, strconv.Itoa(theme), "", time.Now().Format(timeLayout)})
						if err != nil {
							endConnection()
							log.Panic(err)
						}
						c.WriteMessage(1, out)
						if setPassword != "" && !rop {
							mess = Message{5, "", "false", time.Now().Format(timeLayout)}
						} else {
							chatID = mess.Text
							trop := "false"
							if rop {
								trop = "true"
							}
							mess = Message{3, chatID, trop, time.Now().Format(timeLayout)}
							log.Println("Клиент:", r.RemoteAddr+", подключен к чату:", chatID+".")
							cuser.c = c
							cuser.i = r.RemoteAddr
							cuser.endConnection = &endConnection
							ADD(chatID, &cuser)
							messes := checkMessages(chatID, time.Now())
							for i := 0; i < len(messes); i++ {
								out, err := json.Marshal(messes[i])
								if err != nil {
									endConnection()
									log.Panic(err)
								}
								c.WriteMessage(1, out)
							}
						}
					} else {
						chatID = makeChat(mess.Text)
						mess = Message{3, chatID, "false", time.Now().Format(timeLayout)}
						log.Println("Клиент:", r.RemoteAddr+", создал чат с заданым идентификатором:", chatID+".")
						cuser.c = c
						cuser.i = r.RemoteAddr
						cuser.endConnection = &endConnection
						ADD(chatID, &cuser)
					}
				} else if mess.Text == "" {
					chatID = makeChat("")
					mess = Message{3, chatID, "false", time.Now().Format(timeLayout)}
					log.Println("Клиент:", r.RemoteAddr+", создал чат:", chatID+".")
					cuser.c = c
					cuser.i = r.RemoteAddr
					cuser.endConnection = &endConnection
					ADD(chatID, &cuser)
				} else {
					mess = Message{3, "EOF", "true", time.Now().Format(timeLayout)}
				}
			case 1:
				if chatID != "" && !rop {
					save(chatID, mess, nil)
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Получено сообщение:", mess.Text)
				}
				mess = Message{}
				continue
			case 2:
				if chatID != "" && !rop {
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Получено название файла:", mess.Text)
					continue
				}
				mess = Message{}
				continue
			case 3:
				if chatID != "" && !rop {
					var readOnlyPass bool
					if mess.Tag == "false" {
						readOnlyPass = true
					}
					if mess.Text != "" {
						log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Пароль изменён, хэш:", mess.Text)
						newPassword(chatID, mess.Text, readOnlyPass)
						mess = Message{0, chatID, "", time.Now().Format(timeLayout)}
						out, err := json.Marshal(mess)
						if err != nil {
							endConnection()
							log.Panic(err)
						}
						_, ok := users.u[chatID]
						for ok {
							users.u[chatID][0].c.WriteMessage(1, out)
							(*users.u[chatID][0].endConnection)()
							_, ok = users.u[chatID]
						}
					} else {
						log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Пароль снят.")
						newPassword(chatID, "", readOnlyPass)
						mess = Message{1, "Пароль снят.", "", time.Now().Format(timeLayout)}
						out, err := json.Marshal(mess)
						if err != nil {
							endConnection()
							log.Panic(err)
						}
						WriteMessageToAll(chatID, out)
						err = ExecuteQuery("UPDATE chats SET password = ?, readonlypass = ? WHERE id = ?", nil, nil, chatID)
						if err != nil {
							log.Panic(err)
						}
					}
				}
				mess = Message{}
				continue
			case 4:
				if chatID != "" {
					log.Println("Клиент:", r.RemoteAddr+", запросил сообщения от", mess.Time, "в чате:", chatID+".")
					oldestime, err := time.Parse(timeLayout, mess.Time)
					if err != nil {
						endConnection()
						log.Panic(err)
					}
					messes := checkMessages(chatID, oldestime)
					for i := 0; i < len(messes); i++ {
						out, err := json.Marshal(messes[i])
						if err != nil {
							endConnection()
							log.Panic(err)
						}
						err = c.WriteMessage(1, out)
						if err != nil {
							endConnection()
							log.Panic(err)
						}
					}
				}
				mess = Message{}
				continue
			case 5:
				exist, setPassword, _, _ := checkChat(mess.Text)
				if exist && setPassword != "" {
					if getHash([]byte(mess.Time+setPassword)) == mess.Tag {
						if rop {
							log.Println("Клиент:", r.RemoteAddr+", ввёл правильный пароль и получил доступ к отправке информации в чат", chatID+".")
							rop = false
							mess = Message{3, chatID, "false", time.Now().Format(timeLayout)}
						} else {
							chatID = mess.Text
							log.Println("Клиент:", r.RemoteAddr+", ввёл правильный пароль и подключился к чату:", chatID+".")
							cuser.c = c
							cuser.i = r.RemoteAddr
							cuser.endConnection = &endConnection
							ADD(chatID, &cuser)
							messes := checkMessages(chatID, time.Now())
							for i := 0; i < len(messes); i++ {
								out, err := json.Marshal(messes[i])
								if err != nil {
									endConnection()
									log.Panic(err)
								}
								c.WriteMessage(1, out)
							}
							mess = Message{3, chatID, "false", time.Now().Format(timeLayout)}
						}
					} else {
						trop := "false"
						if rop {
							trop = "true"
						}
						mess = Message{5, "", trop, time.Now().Format(timeLayout)}
					}
				} else {
					mess = Message{1, "Неправильное обращение, повторите попытку (400)", "", time.Now().Format(timeLayout)}
				}
			case 6:
				if chatID != "" {
					sendtime, err := time.Parse(timeLayout, mess.Time)
					if err != nil {
						endConnection()
						log.Panic(err)
					}
					getFile(chatID, &cuser, mess.Text, sendtime, mess.Tag)
				}
				mess = Message{}
				continue
			case 7:
				if chatID != "" && !rop {
					num, err := strconv.Atoi(mess.Text)
					if err != nil {
						endConnection()
						log.Panic(err)
					}
					err = setTheme(chatID, num)
					if err != nil {
						endConnection()
						log.Panic(err)
					}
				}
				mess = Message{}
				continue
			default:
				mess = Message{1, "Неправильное обращение, повторите попытку (400)", "", time.Now().Format(timeLayout)}
			}
		} else if messType == 2 && chatID != "" && !rop && mess.Code == 2 {
			save(chatID, mess, inBin)
			mess = Message{}
			continue
		} else {
			mess = Message{1, "Неправильное обращение, повторите попытку (400)", "", time.Now().Format(timeLayout)}
		}
		out, err := json.Marshal(mess)
		if err != nil {
			endConnection()
			log.Panic(err)
		}
		c.WriteMessage(1, out)
		mess = Message{}
	}
	endConnection()
	return
}

func questionSaver(w http.ResponseWriter, r *http.Request) {
	var question Question
	buf, err := io.ReadAll(r.Body)
	if err != nil {
		log.Panic(err)
	}
	err = json.Unmarshal(buf, &question)
	if err != nil {
		log.Panic(err)
	}
	log.Println("Клиент:", r.RemoteAddr+", задан новый вопрос:", question.Question)
	_, err = questionFile.WriteString(question.Question + "\n")
	if err != nil {
		log.Panic(err)
	}
}

func getHash(in []byte) string {
	hasher := sha256.New()
	hasher.Write(in)
	sha := base64.URLEncoding.EncodeToString(hasher.Sum(nil))
	return sha
}

func redirectToHTTPS(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "https://"+r.Host+":"+HTTPSport+r.RequestURI, http.StatusMovedPermanently)
}

func setDBconnection() {
	db.mux.Lock()
	var err error
	db.cluster = gocql.NewCluster("localhost")
	db.cluster.Keyspace = "fastchat"
	db.cluster.Consistency = gocql.Quorum
	db.session, err = db.cluster.CreateSession()
	db.mux.Unlock()
	if err != nil {
		setDBconnection()
	}
}

func ADD(chatID string, cuser *user) {
	users.mux.Lock()
	users.u[chatID] = append(users.u[chatID], cuser)
	users.mux.Unlock()
}

func DEL(chatID string, ip string) {
	users.mux.Lock()
	for i := 0; i < len(users.u[chatID]); i++ {
		users.u[chatID][i].mux.Lock()
		isneeded := users.u[chatID][i].i == ip
		users.u[chatID][i].mux.Unlock()
		if isneeded {
			users.u[chatID] = append(users.u[chatID][:i], users.u[chatID][i+1:]...)
			break
		}
	}
	if len(users.u[chatID]) == 0 {
		delete(users.u, chatID)
	}
	users.mux.Unlock()
}

func newPassword(chatID string, newPasswordstr string, readOnlyPass bool) {
	err := ExecuteQuery("UPDATE chats SET password = ?, readonlypass = ? WHERE id = ?;", newPasswordstr, readOnlyPass, chatID)
	if err != nil {
		log.Panic(err)
	}
}

func checkChat(chatID string) (exist bool, pass string, rop bool, theme int) {
	db.mux.Lock()
	err := db.session.Query("SELECT password, readonlypass, theme FROM chats WHERE id=?", chatID).Consistency(gocql.One).Scan(&pass, &rop, &theme)
	db.mux.Unlock()
	if err != nil {
		return false, "", false, 0
	}
	return true, pass, rop, theme
}

func checkMessages(chatID string, oldesttime time.Time) []Message {
	db.mux.Lock()
	res := db.session.Query("SELECT type, mess, tag, date FROM messes WHERE chatid = ? AND date < ? LIMIT 50;", chatID, oldesttime).Iter().Scanner()
	db.mux.Unlock()
	var masmess []Message
	for res.Next() {
		var mess, tag string
		var ctime time.Time
		var codeBool bool
		if err := res.Scan(&codeBool, &mess, &tag, &ctime); err != nil {
			log.Println(err)
			return []Message{{1, "Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку.", "", time.Now().Format(timeLayout)}}
		}
		code := 1
		if codeBool {
			code = 2
		}
		masmess = append(masmess, Message{code, mess, tag, ctime.Format(timeLayout)})
	}
	return masmess
}

func ExecuteQuery(query string, values ...interface{}) error {
	db.mux.Lock()
	err := db.session.Query(query).Bind(values...).Exec()
	db.mux.Unlock()
	return err
}

func save(chatID string, mess Message, seconddata []byte) {
	mtype := false
	if mess.Code == 2 {
		mtype = true
	}
	thetime, err := time.Parse(timeLayout, mess.Time)
	if err != nil {
		log.Panic(err)
		return
	}
	err = ExecuteQuery("INSERT INTO messes (chatID, type, mess, tag, date, seconddata) VALUES (?,?,?,?,?,?)", chatID, mtype, mess.Text, mess.Tag, thetime, seconddata)
	if err != nil {
		log.Panic(err)
		return
	}
	byteMess, err := json.Marshal(mess)
	if err != nil {
		log.Panic(err)
		return
	}
	WriteMessageToAll(chatID, byteMess)
}

func getFile(chatID string, cuser *user, name string, sendtime time.Time, tag string) {
	db.mux.Lock()
	res := db.session.Query("SELECT seconddata FROM messes WHERE chatid = ? AND type = ? AND mess = ? AND date = ? LIMIT 50 ALLOW FILTERING;", chatID, true, name, sendtime).Iter().Scanner()
	db.mux.Unlock()
	if res.Next() {
		var seconddata []byte
		if err := res.Scan(&seconddata); err != nil {
			log.Println(err)
			out, err := json.Marshal(Message{1, "Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку.", "", time.Now().Format(timeLayout)})
			if err != nil {
				log.Panic(err)
				return
			}
			cuser.mux.Lock()
			err = cuser.c.WriteMessage(1, out)
			if err != nil {
				cuser.mux.Unlock()
				(*cuser.endConnection)()
				log.Panic(err)
				return
			}
			cuser.mux.Unlock()
		}
		cuser.mux.Lock()
		out, err := json.Marshal(Message{6, name, tag, time.Now().Format(timeLayout)})
		if err != nil {
			cuser.mux.Unlock()
			log.Panic(err)
			return
		}
		err = cuser.c.WriteMessage(1, out)
		if err != nil {
			cuser.mux.Unlock()
			(*cuser.endConnection)()
			log.Panic(err)
		}
		err = cuser.c.WriteMessage(2, seconddata)
		if err != nil {
			cuser.mux.Unlock()
			(*cuser.endConnection)()
			log.Panic(err)
		}
		cuser.mux.Unlock()
	} else {
		out, err := json.Marshal(Message{1, "Файла не существует.", "", time.Now().Format(timeLayout)})
		if err != nil {
			log.Panic(err)
			return
		}
		cuser.mux.Lock()
		err = cuser.c.WriteMessage(1, out)
		if err != nil {
			cuser.mux.Unlock()
			(*cuser.endConnection)()
			log.Panic(err)
		}
		cuser.mux.Unlock()
	}
}

func WriteMessageToAll(chatID string, mess []byte) {
	users.mux.Lock()
	for i := 0; i < len(users.u[chatID]); i++ {
		users.u[chatID][i].mux.Lock()
		err := users.u[chatID][i].c.WriteMessage(1, mess)
		users.u[chatID][i].mux.Unlock()
		if err != nil {
			(*users.u[chatID][i].endConnection)()
			log.Panic(err)
		}
	}
	if len(users.u[chatID]) == 0 {
		delete(users.u, chatID)
	}
	users.mux.Unlock()
}

func setTheme(chatID string, num int) (err error) {
	ExecuteQuery("UPDATE chats SET theme = ? WHERE id = ?;", num, chatID)
	out, err := json.Marshal(Message{7, strconv.Itoa(num), "", time.Now().Format(timeLayout)})
	if err != nil {
		return err
	}
	WriteMessageToAll(chatID, out)
	return nil
}

func makeRandID() string {
	rand.Seed(time.Now().UnixNano())
	b := make([]rune, generateIDlen)
	for i := range b {
		b[i] = runesForID[rand.Intn(36)]
	}
	if exist, _, _, _ := checkChat(string(b)); exist {
		return makeRandID()
	}
	return string(b)
}

func makeChat(id string) string {
	if id == "" {
		id = makeRandID()
	}
	err := ExecuteQuery("INSERT INTO chats (id) VALUES (?)", id)
	if err != nil {
		log.Panic(err)
		return "EOF"
	}
	return id
}

/*
func writeError(err error) {
	buf := make([]byte, 1024)
	runtime.Stack(buf, false)
	fmt.Printf("Error: %v\nStack trace:\n%s\n", err, buf)
}
*/
