package main

//=================IMPORT================\\

import (
	"context"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"io/fs"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gocql/gocql"
	"github.com/gorilla/websocket"
)

//========================================\\

//=================TYPES==================\\

type user struct {
	c *websocket.Conn
	i string
}

type DBConnection struct {
	cluster *gocql.ClusterConfig
	session *gocql.Session
}

//========================================\\

//=================CONFIG=================\\

const maxIDlen int = 5
const HTTPSport string = "443"
const HTTPport string = "80"
const SELFNAME = "fastchat.space"
const maxSizeInBytes = 10485760
const timeLayout = "2006-01-02 15:04:05.000 +0000 UTC"

var db DBConnection
var ctx context.Context
var upgrader = websocket.Upgrader{}
var msAct bool
var temp []byte
var users map[string][]user
var IsLetter = regexp.MustCompile(`^[a-zA-Z0-9]+$`).MatchString

//========================================\\

//=================CODE===================\\

func makeUser(с *websocket.Conn, i string) (newu user) {
	newu.c = с
	newu.i = i
	return newu
}

func ADD(self *user) {
	users[(*self).i] = append(users[(*self).i], (*self))
}

func DEL(id string, ip string) {
	for i := 0; i < len(users[id]); i++ {
		if users[id][i].c.RemoteAddr().String() == ip {
			users[id] = append(users[id][:i], users[id][i+1:]...)
		}
	}
}

func speaker(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Upgrade(w, r, nil, maxSizeInBytes, maxSizeInBytes)
	c.SetReadLimit(maxSizeInBytes)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	defer c.Close()
	chatID := "None"
	var AFN, AFT string
	log.Println("Клиент:", r.RemoteAddr+". Подключен.")
	var cuser user
	_ = cuser
	for {
		messType, mess, err := c.ReadMessage()
		if err != nil {
			log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка (норма: 1000, 1001, 1005, 1006):", err)
			break
		} else {
			if messType == 1 {
				rMess := []rune(string(mess))
				code := string(rMess[0:2])
				ac := strings.Split(string(mess), code)[1]
				if code == "1" {                                                                                       //Новый идентификатор
					if ac != "" {
						temp := strings.Split(ac, "")
						var id, pass string = strings.ToLower(temp[0]), ""
						if checkChatExist(id) {
							rpass := checkChatPass(id)
							log.Println("Клиент:", r.RemoteAddr+", подключается к чату", id)
							if len(temp) == 2 {
								pass = temp[1]
							}
							if rpass == pass{
								chatID = id
								log.Println("Клиент:", r.RemoteAddr+", подключен к чату", chatID)
								
								messages := checkMessages(chatID)
								
								for i := 0; i < len(messages); i++ {
									err = c.WriteMessage(1, []byte(messages[i]))
									if err != nil {
										log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщений после кода 1 в speaker():", err)
										break
									}
								}
								
								cuser := makeUser(c, chatID)
								ADD(&cuser)
								
								mess=[]byte("3")
							}else{
								log.Println("Клиент:", r.RemoteAddr,"ввёл неверный пароль от чата", id)
								mess=[]byte("5")
							}
						} else if IsLetter(id) && len(id) >= 5 && len(id) <= 10 && id!="undefined" && id!="chats"{
							chatID = id
							cuser := makeUser(c, chatID)
							ADD(&cuser)
							log.Println("Клиент:", r.RemoteAddr+", создал чат к чат", chatID)
							makeNewChat(id)
							continue
						} else {
							mess = []byte("4EOF")
						}
					} else {
						chatID = makeNewChat("")
						mess = []byte("4" + chatID)
					}
				} else if chatID != "None"{
					if code == "2" {                                                                                   //Сообщение о скорой отправке файла с AFN (имя + время)
						if ac != "" {
							log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Скоро придёт файл с AFN =", ac)
							rac := []rune(ac)
							AFN = ac
							AFT = string(rac[len(rac)-33:])
							if err != nil {
								log.Panic(err)
								AFN = ""
							}
							continue
						} else {
							mess = []byte("Ошибка отправки файла, имя должно быть не пустым")
							log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Ошибка отправки файла, имя должно быть не пустым.")
						}
					} else if code == "3" {                                                                            //Запрос более старых сообщений
						ctime, err := time.Parse(timeLayout, ac)
						if err != nil {
							log.Panic(err)
						}
						
						messages := checkOldMessages(chatID, ctime)
								
						for i := 0; i < len(messages); i++ {
							err = c.WriteMessage(1, []byte("6"+messages[i]))
							if err != nil {
								log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщений после кода 1 в speaker():", err)
								break
							}
						}
					} else if code == "4" {                                                                            //Запрос файл по хешу имени
						log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Запрошен файл", ac)
						sendFile(ac, chatID, c)
						continue
					} else if code == "5" {                                                                            //Запрос на смену пароля
						err := ExecuteQuery("INSERT INTO chats (id, password) VALUES (?, ?)", chatID, ac)
						if err != nil {
							log.Panic(err)
							mess = []byte("Ошибка. Пароль не установлен.")
							log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Ошибка смены пароля:", err)
						}else{
							log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Установлен новый пароль -", ac)
							for i := 0; i < len(users[chatID]); i++ {
								err = users[chatID][i].c.WriteMessage(1, []byte("1" + chatID))
								if err != nil {
									log.Println("Клиент:", users[chatID][i].c.RemoteAddr().String()+", чат:", chatID+". При смене пароля произошла ошибка:", err)
								}
							}
							continue
						}
					} else {                                                                                            //Обычное текстовое сообщение
						ac = string(rMess[0 : len(rMess)-33])
						date, err := time.Parse(timeLayout, string(rMess[len(rMess)-33:]))
						if err != nil {
							log.Panic(err)
						}
						save(chatID, false, ac, date, nil)
						log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Сообщение:", ac)
						continue
					}
				}else{
					log.Println("Клиент:", r.RemoteAddr, "был подключен без чата.")
					break
				}
			} else if chatID != "None" && messType == 2 {
				if len(mess)>maxSizeInBytes{
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Файл "+string([]byte(AFN)[:len([]byte(AFN))-33])+" превышает допустимый размер")
					AFN=""
					AFT=""
					break
				}
				if AFN != "" && AFT != "" {
					ctime, err := time.Parse(timeLayout, AFT)
					if err != nil {
						log.Panic(err)
					}
					save(chatID, true, AFN, ctime, mess)
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Файл:", AFN)
					AFN = ""
					AFT = ""
					mess = []byte{}
					continue
				} else {
					messType = 1
					mess = []byte("Пришёл файл без имени, повторите отправку.")
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Пришёл файл, хотя не ожидался.")
				}
			} else {
				log.Println("Клиент:", r.RemoteAddr, "попытался отправить байты без чата.")
				break
			}
			err = c.WriteMessage(messType, mess)
			if err != nil {
				log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщения в повторителе speaker():", err)
				break
			}
		}
	}
	log.Println("Клиент:", r.RemoteAddr, "отключен.")
	DEL(chatID, r.RemoteAddr)
	return
}

func getHash(in []byte) string {
	hasher := sha1.New()
	hasher.Write(in)
	sha := base64.URLEncoding.EncodeToString(hasher.Sum(nil))
	return sha
}

func sendFile(name string, id string, c *websocket.Conn) {
	var file []byte
	err := db.session.Query("SELECT seconddata FROM \""+id+"\" WHERE type = true AND mess=? LIMIT 1 ALLOW FILTERING", name).Scan(&file)
	if err != nil {
		log.Panic(err)
	}
	err = c.WriteMessage(2, file)
	if err != nil {
		log.Println("Клиент:", c.RemoteAddr().String()+", чат:", id+". Возможная ошибка отправки сообщения в sendFile():", err)
		return
	}
	return
}

func checkFileCollision(id string, file []byte) string {
	res := db.session.Query("SELECT mess FROM \""+id+"\" WHERE seconddata=? LIMIT 1 ALLOW FILTERING", file).WithContext(ctx).Iter().Scanner()
	if res.Next() {
		var n string
		err := res.Scan(&n)
		if err != nil {
			log.Panic(err)
		}
		return n
	}
	return ""
}

func save(chatID string, mtype bool, mess string, date time.Time, seconddata []byte) {
	hMess := mess
	if mtype {
		hMess = getHash([]byte(mess))
		if cfe := checkFileCollision(chatID, seconddata); cfe != "" {
			save(chatID, false, "2"+string([]byte(mess)[:len([]byte(mess))-33])+""+cfe, date, []byte{})
			return
		}
	}
	err := ExecuteQuery("INSERT INTO \""+chatID+"\" (type, mess, date, seconddata) VALUES (?,?,?,?)", mtype, hMess, date, seconddata)
	if err != nil {
		for i := 0; i < len(users[chatID]); i++ {
			err = users[chatID][i].c.WriteMessage(1, []byte("Ошибка сохранения сообщения"+mess+date.Format(timeLayout)))
			if err != nil {
				log.Println("Клиент:", users[chatID][i].c.RemoteAddr().String()+", чат:", chatID+". Возможная ошибка отправки сообщения в messageSaver():", err)
			}
		}
		log.Panic(err)
	} else {
		if mtype {
			save(chatID, false, "2"+string([]byte(mess)[:len([]byte(mess))-33])+""+hMess, date, []byte{})
		} else {
			for i := 0; i < len(users[chatID]); i++ {
				err = users[chatID][i].c.WriteMessage(1, []byte(mess+date.Format(timeLayout)))
				if err != nil {
					log.Println("Клиент:", users[chatID][i].c.RemoteAddr().String()+", чат:", chatID+". Возможная ошибка отправки сообщения в messageSaver():", err)
				}
			}
		}
	}
}

func makeID() string {
	rand.Seed(time.Now().UnixNano())
	var ans []string
	IDalphabet := [...]string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "g", "h", "i", "g", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"}
	for i := 0; i < maxIDlen; i++ {
		ans = append(ans, IDalphabet[rand.Intn(len(IDalphabet))])
	}
	return strings.Join(ans, "")
}

func makeNewChat(id string) string {
	if id == "" {
		id = makeID()
	}
	err := ExecuteQuery("INSERT INTO chats (id) VALUES (?)", id)
	if err != nil {
		log.Panic(err)
	}
	err = ExecuteQuery("CREATE TABLE IF NOT EXISTS \"" + id + "\" (type BOOLEAN, mess VARCHAR, date TIMESTAMP, seconddata BLOB, PRIMARY KEY ((type),date)) WITH CLUSTERING ORDER BY(date DESC)")
	if err != nil {
		log.Panic(err)
	}
	return id
}

func checkChatExist(lid string) bool {
	res := db.session.Query("SELECT id FROM chats WHERE id=?", lid).WithContext(ctx).Iter().Scanner()
	return res.Next()
}

func checkChatPass(lid string) (pass string) {
	err := db.session.Query("SELECT password FROM chats WHERE id=?", lid).WithContext(ctx).Consistency(gocql.One).Scan(&pass)
	if err != nil{
		log.Panic(err)
	}
	return
}

func checkOldMessages(lid string, ltime time.Time) []string {
	res := db.session.Query("SELECT mess, date FROM \"" + lid + "\" WHERE type = false AND date < ? LIMIT 50", ltime).WithContext(ctx).Iter().Scanner()
	masmess := []string{}
	for res.Next() {
		mess := ""
		var ctime time.Time
		if err := res.Scan(&mess, &ctime); err != nil {
			log.Println(err)
			return []string{"Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку."}
		}
		masmess = append(masmess, mess+ctime.Format(timeLayout))
	}
	return masmess
}

func checkMessages(lid string) []string {
	res := db.session.Query("SELECT mess, date FROM \"" + lid + "\" WHERE type = false LIMIT 50").WithContext(ctx).Iter().Scanner()
	masmess := []string{}
	for res.Next() {
		mess := ""
		var ctime time.Time
		if err := res.Scan(&mess, &ctime); err != nil {
			log.Println(err)
			return []string{"Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку."}
		}
		masmess = append(masmess, mess+ctime.Format(timeLayout))
	}
	for i, j := 0, len(masmess)-1; i < j; i, j = i+1, j-1 {
		masmess[i], masmess[j] = masmess[j], masmess[i]
	}
	return masmess
}

func ExecuteQuery(query string, values ...interface{}) error {
	err := db.session.Query(query).Bind(values...).Exec()
	return err
}

func setDBconnection(){
	var err error
	db.cluster = gocql.NewCluster("localhost")
	db.cluster.Keyspace = "fastchat"
	db.cluster.Consistency = gocql.Quorum
	db.session, err = db.cluster.CreateSession()
	if err != nil {
		if err == gocql.ErrNoConnectionsStarted{
			defer setDBconnection()
			return
		}
        log.Fatal(err)
    }
}

func redirectToHTTPS(w http.ResponseWriter, r *http.Request) {
	log.Println("Redirecting",r.RemoteAddr,"to","https://"+r.Host+":"+HTTPSport+r.RequestURI)
    http.Redirect(w, r, "https://"+r.Host+":"+HTTPSport+r.RequestURI, http.StatusMovedPermanently)
}

func main() {
	f, err := os.OpenFile("logs", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("Ошибка логов: %v", err)
	}
	defer f.Close()

	log.SetOutput(f)

	log.Println("v0.3.7 ---------==== FASTCHAT ====--------- 07.03.2023 20:00")
	log.Println("Сервер запущен.")
	defer log.Println("Завершение работы...")

	users = make(map[string][]user)
	ctx = context.Background()

	log.Println("Подключение к БД...")

	setDBconnection()

	log.Println("Успешное подключение к БД")

	log.Println("Регистрация файлов и путей сайта...")
	err = filepath.Walk("./public", func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			log.Println("Ошибка доступа к", path, "-", err)
			return nil
		}
		if !info.IsDir() {
			curpath := strings.Replace(strings.Replace(strings.Replace(path, "\\", "/", -1), "public", "", -1), "index.html", "", -1)
			log.Println("Регистрация", curpath)
			http.HandleFunc(curpath, func(w http.ResponseWriter, r *http.Request) {
				if curpath == r.URL.Path {
					http.ServeFile(w, r, path)
				} else {
					fmt.Fprintf(w, "Страница не найдена. 404.")
				}
			})
			return nil
		} else {
			log.Println("-->", path)
		}
		return nil
	})
	if err != nil {
		log.Panic(err)
		return
	}

	log.Println("Регистрация /speaker")
	http.HandleFunc("/speaker", speaker)

	log.Println("Файлы и пути зарегестрированы")

	log.Println("Прослушиваются порты", HTTPport, HTTPSport)
	go func() {
		if err := http.ListenAndServe(":"+HTTPport, http.HandlerFunc(redirectToHTTPS)); err != nil {
			log.Printf("Ошибка ListenAndServe: %v", err)
		}
	}()
	http.ListenAndServeTLS(":"+HTTPSport, "/etc/ssl/certificate.crt", "/etc/ssl/private/private.key", nil)
}

//========================================\\