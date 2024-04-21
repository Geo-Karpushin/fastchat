package main

//=================IMPORT================\\

import (
	"context"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gocql/gocql"
	"github.com/gorilla/websocket"
)

//=================TYPES==================\\

type user struct {
	c   *websocket.Conn
	i   string
	mux sync.Mutex
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
	Time string `json:"time"`
}

//=================CONFIG=================\\

const version string = "v0.4.0"
const updateDay string = "18.05.2023 00:00"
const maxIDlen int = 11
const minIDlen int = 4
const generateIDlen = 5
const HTTPSport string = "443"
const HTTPport string = "80"
const maxSizeInBytes = 10485760
const timeLayout = "2006-01-02T15:04:05.999-0700"
const runesForIDLen = 36

var db DBConnection
var ctx context.Context
var users Users
var IsLetter = regexp.MustCompile(`^[a-z0-9]+$`).MatchString
var runesForID = []rune("abcdefghijklmnopqrstuvwxyz0123456789")

/*
Запросы от клиента:
0 - установка подключения
1 - сообщение
2 - файл
3 - новый пароль
4 - старые сообщения
5 - проверить пароль
6 - запрос файла

Запросы от сервера:
0 - установка подключения (сменить ID с перезагрузкой)
1 - сообщение
2 - файл
3 - сменить ID без перезагрузки страницы
5 - проверить пароль (запрос)
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

	http.Handle("/", http.FileServer(http.Dir("./public")))
	http.HandleFunc("/speaker", speaker)

	log.Println("Файлы и пути зарегестрированы")

	log.Println("Сервер запущен. Прослушиваются порты", HTTPport, HTTPSport)
	go func() {
		if err := http.ListenAndServe(":"+HTTPport, http.HandlerFunc(redirectToHTTPS)); err != nil {
			log.Printf("Ошибка ListenAndServe: %v", err)
		}
	}()
	//log.Fatal(http.ListenAndServe(":3000", nil))
	http.ListenAndServeTLS(":"+HTTPSport, "/etc/ssl/certificate.crt", "/etc/ssl/private/private.key", nil)
}

func redirectToHTTPS(w http.ResponseWriter, r *http.Request) {
	log.Println("Redirecting", r.RemoteAddr, "to", "https://"+r.Host+":"+HTTPSport+r.RequestURI)
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
	cuser.mux.Lock()
	users.mux.Lock()
	users.u[chatID] = append(users.u[chatID], cuser)
	users.mux.Unlock()
	cuser.mux.Unlock()
}

func DEL(chatID string, ip string) {
	users.mux.Lock()
	for i := 0; i < len(users.u[chatID]); i++ {
		users.u[chatID][i].mux.Lock()
		if users.u[chatID][i].i == ip {
			users.u[chatID] = append(users.u[chatID][:i], users.u[chatID][i+1:]...)
		}
		users.u[chatID][i].mux.Unlock()
	}
	if len(users.u[chatID]) == 0 {
		delete(users.u, chatID)
	}
	users.mux.Unlock()
}

func speaker(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Upgrade(w, r, nil, maxSizeInBytes, maxSizeInBytes)
	c.SetReadLimit(maxSizeInBytes)
	if err != nil {
		log.Print("Upgrade error:", err)
		return
	}
	var chatID string
	var cuser user
	var mess Message
	defer c.Close()
	defer log.Println("Клиент:", r.RemoteAddr, "отключен.")
	defer DEL(chatID, r.RemoteAddr)
	log.Println("Клиент:", r.RemoteAddr+". Подключен.")
	for {
		messType, inBin, err := c.ReadMessage()
		if err != nil {
			log.Panic(err)
			break
		}
		if messType == 8 {
			break
		} else if messType == 1 {
			err = json.Unmarshal(inBin, &mess)
			if err != nil {
				log.Panic(err)
			}
			switch mess.Code {
			case 0:
				mess.Text = strings.ToLower(mess.Text)
				lenMessText := len(mess.Text)
				if mess.Text != "" && IsLetter(mess.Text) && lenMessText > minIDlen && lenMessText < maxIDlen {
					exist, setPassword := checkChat(mess.Text)
					if setPassword != "" {
						mess = Message{5, "", time.Now().Format(timeLayout)}
					} else if exist {
						chatID = mess.Text
						mess = Message{3, chatID, time.Now().Format(timeLayout)}
						log.Println("Клиент:", r.RemoteAddr+", подключен к чату:", chatID+".")
						cuser.c = c
						cuser.i = r.RemoteAddr
						ADD(chatID, &cuser)
						messes := checkMessages(chatID, time.Now())
						for i := 0; i < len(messes); i++ {
							out, err := json.Marshal(messes[i])
							if err != nil {
								log.Panic(err)
							}
							c.WriteMessage(1, out)
						}
					} else {
						chatID = makeChat(mess.Text)
						mess = Message{3, chatID, time.Now().Format(timeLayout)}
						log.Println("Клиент:", r.RemoteAddr+", создал чат с заданым идентификатором:", chatID+".")
						cuser.c = c
						cuser.i = r.RemoteAddr
						ADD(chatID, &cuser)
					}
				} else if mess.Text == "" {
					chatID = makeChat("")
					mess = Message{3, chatID, time.Now().Format(timeLayout)}
					log.Println("Клиент:", r.RemoteAddr+", создал чат:", chatID+".")
					cuser.c = c
					cuser.i = r.RemoteAddr
					ADD(chatID, &cuser)
				} else {
					mess = Message{3, "EOF", time.Now().Format(timeLayout)}
				}
			case 1:
				if chatID != "" {
					save(chatID, mess, nil)
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Получено сообщение:", mess.Text)
				}
				mess = Message{}
				continue
			case 2:
				if chatID != "" {
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Получено название файла:", mess.Text)
				}
				continue
			case 3:
				if chatID != "" {
					newPassword(chatID, mess.Text)
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Смена пароля на:", mess.Text)
					mess = Message{0, chatID, time.Now().Format(timeLayout)}
					out, err := json.Marshal(mess)
					if err != nil {
						log.Panic(err)
					}
					users.mux.Lock()
					for i := 0; i < len(users.u[chatID]); i++ {
						users.u[chatID][i].mux.Lock()
						err := users.u[chatID][i].c.WriteMessage(1, out)
						if err != nil {
							log.Panic(err)
						}
						users.u[chatID][i].c.Close()
						users.u[chatID][i].mux.Unlock()
					}
					delete(users.u, chatID)
					users.mux.Unlock()
				}
				mess = Message{}
				continue
			case 4:
				if chatID != "" {
					log.Println("Клиент:", r.RemoteAddr+", запросил сообщения от", mess.Time, "в чате:", chatID+".")
					oldestime, err := time.Parse(timeLayout, mess.Time)
					if err != nil {
						log.Panic(err)
					}
					messes := checkMessages(chatID, oldestime)
					for i := 0; i < len(messes); i++ {
						out, err := json.Marshal(messes[i])
						if err != nil {
							log.Panic(err)
						}
						c.WriteMessage(1, out)
					}
				}
				mess = Message{}
				continue
			case 5:
				exist, setPassword := checkChat(mess.Text)
				if exist && setPassword != "" {
					if setPassword == mess.Time {
						chatID = mess.Text
						cuser.c = c
						cuser.i = r.RemoteAddr
						ADD(chatID, &cuser)
						messes := checkMessages(chatID, time.Now())
						for i := 0; i < len(messes); i++ {
							out, err := json.Marshal(messes[i])
							if err != nil {
								log.Panic(err)
							}
							c.WriteMessage(1, out)
						}
						mess = Message{3, chatID, time.Now().Format(timeLayout)}
					} else {
						mess = Message{5, "", time.Now().Format(timeLayout)}
					}
				} else {
					mess = Message{1, "Неправильное обращение, повторите попытку (400)", time.Now().Format(timeLayout)}
				}
			case 6:
				if chatID != "" {
					sendtime, err := time.Parse(timeLayout, mess.Time)
					if err != nil {
						log.Panic(err)
					}
					getFile(chatID, &cuser, mess.Text, sendtime)
				}
				mess = Message{}
				continue
			default:
				log.Println("here")
				mess = Message{1, "Неправильное обращение, повторите попытку (400)", time.Now().Format(timeLayout)}
			}
		} else if messType == 2 && chatID != "" && mess.Code == 2 {
			save(chatID, mess, inBin)
			mess = Message{}
			continue
		} else {
			mess = Message{1, "Неправильное обращение, повторите попытку (400)", time.Now().Format(timeLayout)}
		}
		out, err := json.Marshal(mess)
		if err != nil {
			log.Panic(err)
		}
		c.WriteMessage(1, out)
		mess = Message{}
	}
	return
}

func newPassword(chatID string, newPassword string) {
	err := ExecuteQuery("INSERT INTO chats (id, password) VALUES (?, ?)", chatID, newPassword)
	if err != nil {
		log.Panic(err)
	}
}

func checkChat(chatID string) (exist bool, pass string) {
	db.mux.Lock()
	err := db.session.Query("SELECT password FROM chats WHERE id=?", chatID).WithContext(ctx).Consistency(gocql.One).Scan(&pass)
	db.mux.Unlock()
	if err != nil {
		return false, ""
	}
	return true, pass
}

func checkMessages(chatID string, oldesttime time.Time) []Message {
	db.mux.Lock()
	res := db.session.Query("SELECT type, mess, date FROM messes WHERE chatid = ? AND date < ? LIMIT 50;", chatID, oldesttime).WithContext(ctx).Iter().Scanner()
	db.mux.Unlock()
	var masmess []Message
	for res.Next() {
		var mess string
		var ctime time.Time
		var codeBool bool
		if err := res.Scan(&codeBool, &mess, &ctime); err != nil {
			log.Println(err)
			return []Message{{1, "Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку.", time.Now().Format(timeLayout)}}
		}
		code := 1
		if codeBool {
			code = 2
		}
		masmess = append(masmess, Message{code, mess, ctime.Format(timeLayout)})
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
	}
	err = ExecuteQuery("INSERT INTO messes (chatID, type, mess, date, seconddata) VALUES (?,?,?,?,?)", chatID, mtype, mess.Text, thetime, seconddata)
	if err != nil {
		log.Panic(err)
	}
	byteMess, err := json.Marshal(mess)
	if err != nil {
		log.Panic(err)
	}
	WriteMessageToAll(chatID, byteMess)
}

func getFile(chatID string, cuser *user, name string, sendtime time.Time) {
	db.mux.Lock()
	res := db.session.Query("SELECT seconddata FROM messes WHERE chatid = ? AND type = ? AND mess = ? AND date = ? LIMIT 50 ALLOW FILTERING;", chatID, true, name, sendtime).WithContext(ctx).Iter().Scanner()
	db.mux.Unlock()
	if res.Next() {
		var seconddata []byte
		if err := res.Scan(&seconddata); err != nil {
			log.Println(err)
			out, err := json.Marshal(Message{1, "Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку.", time.Now().Format(timeLayout)})
			if err != nil {
				log.Panic(err)
			}
			cuser.mux.Lock()
			cuser.c.WriteMessage(1, out)
			cuser.mux.Unlock()
		}
		cuser.mux.Lock()
		out, err := json.Marshal(Message{6, name, time.Now().Format(timeLayout)})
		if err != nil {
			log.Panic(err)
		}
		cuser.c.WriteMessage(1, out)
		cuser.c.WriteMessage(2, seconddata)
		cuser.mux.Unlock()
	} else {
		out, err := json.Marshal(Message{1, "Файла не существует.", time.Now().Format(timeLayout)})
		if err != nil {
			log.Panic(err)
		}
		cuser.mux.Lock()
		cuser.c.WriteMessage(1, out)
		cuser.mux.Unlock()
	}
}

func WriteMessageToAll(chatID string, mess []byte) {
	users.mux.Lock()
	for i := 0; i < len(users.u[chatID]); i++ {
		users.u[chatID][i].mux.Lock()
		err := users.u[chatID][i].c.WriteMessage(1, mess)
		if err != nil {
			log.Panic(err)
		}
		users.u[chatID][i].mux.Unlock()
	}
	if len(users.u[chatID]) == 0 {
		delete(users.u, chatID)
	}
	users.mux.Unlock()
}

func makeRandID() string {
	b := make([]rune, generateIDlen)
	for i := range b {
		b[i] = runesForID[rand.Intn(36)]
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
	}
	return id
}
