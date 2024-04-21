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
const port string = "3000"
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
		flag := false
		messType, mess, err := c.ReadMessage()
		if err != nil {
			log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка (норма: 1000, 1001, 1005, 1006):", err)
			err = c.WriteMessage(messType, mess)
			if err != nil {
				log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщения в повторителе speaker():", err)
				break
			}
			break
		} else {
			if messType == 1 {
				flag = true
				rMess := []rune(string(mess))
				code := string(rMess[0:2])
				ac := strings.Split(string(mess), code)[1]
				if code == "1" {
					if ac != "" {
						if IsLetter(ac) {
							if len(ac) >= 5 && len(ac) <= 10 {
								ac = strings.ToUpper(ac)
								chatID = ac
								if checkChatExist(ac) {
									messages := checkMessages(chatID)
									for i := 0; i < len(messages); i++ {
										err = c.WriteMessage(1, []byte(messages[i]))
										if err != nil {
											log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщения после кода 1 в speaker():", err)
											break
										}
									}
								} else {
									makeNewChat(ac)
								}
								cuser := makeUser(c, chatID)
								ADD(&cuser)
							} else {
								mess = []byte("1EOF")
								flag = false
							}
						} else {
							mess = []byte("1EOF")
							flag = false
						}
					} else {
						chatID = makeNewChat("")
						mess = []byte("1" + chatID)
						flag = false
					}
				} else if code == "2" {
					if ac != "" {
						rac := []rune(ac)
						AFN = ac
						AFT = string(rac[len(rac)-33:])
						if err != nil {
							log.Panic(err)
							AFN = ""
						}
					} else {
						flag = false
						mess = []byte("Ошибка отправки файла, имя должно быть не пустым")
						log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Ошибка отправки файла, имя должно быть не пустым.")
					}
				} else if code == "3" {
					sendFile(getHash([]byte(ac)), chatID, c)
				} else if code == "4" {
					sendFile(ac, chatID, c)
				} else {
					ac = string(rMess[0 : len(rMess)-33])
					date, err := time.Parse(timeLayout, string(rMess[len(rMess)-33:]))
					if err != nil {
						log.Panic(err)
					}
					save(chatID, false, ac, date, nil)
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Сообщение:", ac)
				}
			} else if messType == 2 {
				flag = true
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
					messType = 1
					mess = []byte("2" + AFN)
					AFN = ""
					AFT = ""
				} else {
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Пришёл файл, хотя не ожидался.")
				}
				mess = []byte{}
			}
			if !flag {
				err = c.WriteMessage(messType, mess)
				if err != nil {
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщения в повторителе speaker():", err)
					break
				}
			}
		}
	}
	log.Println("Клиент:", r.RemoteAddr+". Отключен.")
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
	err := db.session.Query("SELECT seconddata FROM "+id+" WHERE type = true AND mess=? LIMIT 1 ALLOW FILTERING", name).Scan(&file)
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
	res := db.session.Query("SELECT mess FROM "+id+" WHERE seconddata=? LIMIT 1 ALLOW FILTERING", file).WithContext(ctx).Iter().Scanner()
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
	err := ExecuteQuery("INSERT INTO "+chatID+" (type, mess, date, seconddata) VALUES (?,?,?,?)", mtype, hMess, date, seconddata)
	if err != nil {
		for i := 0; i < len(users[chatID]); i++ {
			err = users[chatID][i].c.WriteMessage(1, []byte("Ошибка сохранения сообщения"+mess+date.String()))
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
				err = users[chatID][i].c.WriteMessage(1, []byte(mess+date.String()))
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
	IDalphabet := [...]string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "G", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"}
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
	err = ExecuteQuery("CREATE TABLE IF NOT EXISTS " + id + " (type BOOLEAN, mess VARCHAR, date TIMESTAMP, seconddata BLOB, PRIMARY KEY ((type),date)) WITH CLUSTERING ORDER BY(date DESC)")
	if err != nil {
		log.Panic(err)
	}
	return id
}

func checkChatExist(lid string) bool {
	res := db.session.Query("SELECT id FROM chats WHERE id=?", lid).WithContext(ctx).Iter().Scanner()
	return res.Next()
}

func checkMessages(lid string) []string {
	res := db.session.Query("SELECT mess, date FROM " + lid + " WHERE type = false LIMIT 50").WithContext(ctx).Iter().Scanner()
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

func main() {
	f, err := os.OpenFile("logs", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("Ошибка логов: %v", err)
	}
	defer f.Close()

	log.SetOutput(f)

	log.Println("v0.3.4 ---------==== FASTCHAT ====--------- 08.02.2023 00:00")
	log.Println("Сервер запущен.")
	defer log.Println("Завершение работы...")

	users = make(map[string][]user)
	ctx = context.Background()

	log.Println("Подключение к БД...")

	db.cluster = gocql.NewCluster("localhost")
	db.cluster.Keyspace = "fastchat"
	db.cluster.Consistency = gocql.Quorum
	db.session, err = db.cluster.CreateSession()
	if err != nil {
		log.Fatal(err)
	}
	defer db.session.Close()

	log.Println("Успешное подключение к MySQL")

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

	log.Println("Прослушивается порт", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

//========================================\\
