package main

//=================IMPORT================\\

import (
	_"github.com/go-sql-driver/mysql"
	"github.com/gorilla/websocket"
	"encoding/base64"
    "path/filepath"
	"database/sql"
	"encoding/hex"
	"crypto/sha1"
	"math/rand"
	"net/http"
	"strings"
	"io/fs"
	"time"
	"log"
	"fmt"
)

//========================================\\

//=================TYPES==================\\

type message struct{
	chat string
	mess string
	date string
	mtype bool
}

type mqueue []message

type user struct{
	c *websocket.Conn
	i string
}

//========================================\\

//=================CONFIG=================\\

const maxIDlen int = 5
const port string = "3000"
var db *sql.DB
var upgrader = websocket.Upgrader{}
var msAct bool
var temp []byte
var qm mqueue
var users map[string][]user

//========================================\\

//=================CODE===================\\


func (self *mqueue) push (in message){
	*self = append(*self, in)
	return
}

func (self *mqueue) pop ()(out message){
	if len(*self)>1{
		out = (*self)[0]
		*self = (*self)[1:]
	}else if len(*self)==1{
		out = (*self)[0]
		*self=[]message{}
	}else{
		out=makeMess("None", "None", "None", false)
	}
	return out
}

func makeMess(chat string, mess string, date string, t bool)(newm message){
	newm.chat=chat
	newm.mess=mess
	newm.date=date
	newm.mtype=t
	return newm
}

func makeUser(с *websocket.Conn, i string)(newu user){
	newu.c=с
	newu.i=i
	return newu
}

func ADD(self *user){
	users[(*self).i]=append(users[(*self).i],(*self))
}

func DEL(id string, ip string){
	for i := 0; i<len(users[id]); i++{
		if users[id][i].c.RemoteAddr().String()==ip{
			users[id]=append(users[id][:i], users[id][i+1:]...)
		}
	}
}

func speaker(w http.ResponseWriter, r *http.Request) {
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	defer c.Close()
	chatId:="None"
	AFF:=""
	log.Println("Клиент:",r.RemoteAddr+". Подключен.")
	var cuser user
	_=cuser
	for {
		flag:=false
		messType, mess, err := c.ReadMessage()
		if err != nil {
			log.Println("Клиент:",r.RemoteAddr+", чат:",chatId+". Возможная ошибка (норма: 1000, 1001, 1005, 1006):", err)
			break
		}
		if messType==1{
			rMess:=[]rune(string(mess))
			code:=string(rMess[0:4])
			ac:=strings.Split(string(mess),code)[1]
			time:=""
			if(code=="{~}1"){
				flag=true
				if ac==""{
					chatId=makeNewChat()
					mess=[]byte("{~}1"+chatId)
					flag=false
				}else{
					if checkChatExist(ac){
						chatId=strings.ToUpper(ac)
					}else{
						chatId=makeNewChat()
						mess=[]byte("{~}1"+chatId)
						flag=false
					}
					messages:=checkMessages(chatId)
					for i:=0; i<len(messages);i++{
						err = c.WriteMessage(1, []byte(messages[i]))
						if err != nil {
							log.Println("Клиент:",r.RemoteAddr+", чат:",chatId+". Возможная ошибка отправки сообщения после кода {~}1 в speaker():", err)
							break
						}
					}
					if err != nil {
						log.Println("Клиент:",r.RemoteAddr+", чат:",chatId+". Возможная ошибка отправки сообщения после кода {~}1 в speaker() 2:", err)
						break
					}
					cuser:=makeUser(c,chatId)
					ADD(&cuser)
				}
			}else if(code=="{~}2"){
				flag=true
				if ac!=""{
					AFF=ac
				}else{
					flag=false
					mess=[]byte("Ошибка отправки файла, имя должно быть не пустым")
					log.Println("Клиент:",r.RemoteAddr+", чат:",chatId+". Ошибка отправки файла, имя должно быть не пустым.")
				}
			}else if(code=="{~}3"){
				flag=true
				sendFile(getHash(ac), chatId, c)
			}else if(code=="{~}4"){
				flag=true
				sendFile(ac, chatId, c)
			}else{
				if ac!=""{
					time=string(rMess[len(rMess)-14:])
					ac=string(rMess[0:len(rMess)-14])
				}
				SaveMessage(chatId,ac,time,true)
				log.Println("Клиент:",r.RemoteAddr+", чат:",chatId+". Сообщение:",ac)
				flag=true
			}
		}else{
			flag=true
			if(AFF!=""){
				rAFF:=[]rune(AFF)
				name:=string(rAFF[0:len(rAFF)-14])
				date:=string(rAFF[len(rAFF)-14:])
				hex:=converToBlobStr(mess)
				SaveFile(chatId,name,date,hex)
				log.Println("Клиент:",r.RemoteAddr+", чат:",chatId+". Файл:",name)
				messType=1
				mess=[]byte("{~}2"+AFF)
				AFF=""
			}else{
				log.Println("Клиент:",r.RemoteAddr+", чат:",chatId+". Пришёл файл, хотя не ожидался.")
			}
			mess=[]byte{}
		}
		if !flag{
			err = c.WriteMessage(messType, mess)
			if err != nil {
				log.Println("Клиент:",r.RemoteAddr+", чат:",chatId+". Возможная ошибка отправки сообщения в повторителе speaker():", err)
				break
			}
		}
	}
	log.Println("Клиент:",r.RemoteAddr+". Отключен.")
	DEL(chatId, r.RemoteAddr)
	return
}

func getHash( in string ) string {
	hasher := sha1.New()
    hasher.Write([]byte(in))
    sha := base64.URLEncoding.EncodeToString(hasher.Sum(nil))
	return sha
}

func sendFile(name string, id string, c *websocket.Conn){
	res, err := db.Query("SELECT CONVERT(`data` USING utf8) FROM `f"+id+"` WHERE `name`='" + name +"' LIMIT 1")
    if err != nil {
        log.Panic(err)
    }
	if res.Next(){
		var file string
		res.Scan(&file)
		fBlob:=converFromBlobStr(file)
		err = c.WriteMessage(2, fBlob)
		if err != nil {
			log.Println("Клиент:",c.RemoteAddr().String()+", чат:",id+". Возможная ошибка отправки сообщения в sendFile():", err)
			return
		}
	}
	return
}

func checkFileCollision(id string, data string) string{
	lochash:=getHash(data)
	res, err := db.Query("SELECT `name` FROM `f"+id+"` WHERE `hash`='" + lochash +"' LIMIT 1")
    if err != nil {
        log.Panic(err)
    }
	if res.Next(){
		var n string
		res.Scan(&n)
		return n
	}
	return "NOVALUE-NOCOLLISION"
}

func converToBlobStr(in []byte) (out string){
	out = hex.EncodeToString(in)
	return out
}

func converFromBlobStr(in string) []byte{
	decodedByteArray, err := hex.DecodeString(in)
	if err != nil {
		log.Panic(err)
	}
	return decodedByteArray
}

func SaveMessage(chatId string, text string, time string, flag bool){
	qm.push(makeMess(chatId,text,time,false))
	if !msAct && flag{
		messageSaver()
	}
}
func SaveFile(chatId string, name string, date string, data string){
	qm.push(makeMess(chatId,name+date,data,true))
	if !msAct{
		messageSaver()
	}
}

func messageSaver(){
	msAct=true
	if len(qm)>0{
		lmess:=qm.pop()
		if lmess.mtype{
			rName:=[]rune(lmess.mess)
			ldate:=string(rName[len(rName)-14:])
			lname:=string(rName[0:len(rName)-14])
			cfe:=checkFileCollision(lmess.chat, lmess.date)
			log.Println(cfe)
			if(cfe=="NOVALUE-NOCOLLISION"){
				req:="INSERT INTO `f"+lmess.chat+"` (`name`, `data`, `hash`) VALUES ('" + getHash(lmess.mess) + "','" + lmess.date + "','"+ getHash(lmess.date) +"')"
				_, err := db.Exec(req)
				if err != nil {
					log.Println(err)
					name:=qm.pop()
					for i := 0; i<len(users[lmess.chat]);i++{
						err = users[lmess.chat][i].c.WriteMessage(1, []byte("Ошибка отправки файла: "+ name.mess[4:]+name.date))
						if err != nil {
							log.Println("Клиент:",users[lmess.chat][i].c.RemoteAddr().String()+", чат:",lmess.chat+". Возможная ошибка отправки файла в messageSaver():", err)
						}
					}
				}else{
					SaveMessage(lmess.chat,"{~}2"+lname,ldate,false)
				}
			}else{
				SaveMessage(lmess.chat,"{~}2"+lname+"{[|4~4~4|]}"+cfe,ldate,false)
			}
		}else{
			_, err := db.Exec("INSERT INTO `c"+lmess.chat+"` (`mess`, `date`) VALUES ('" + lmess.mess + "','" + lmess.date + "')")
			if err != nil {
				log.Println(err)
			}else{
				for i := 0; i<len(users[lmess.chat]);i++{
					err = users[lmess.chat][i].c.WriteMessage(1, []byte(lmess.mess+lmess.date))
					if err != nil {
						log.Println("Клиент:",users[lmess.chat][i].c.RemoteAddr().String()+", чат:",lmess.chat+". Возможная ошибка отправки сообщения в messageSaver():", err)
						break
					}
				}
			}
		}
		if len(qm)>0{
			defer messageSaver()
		}else{
			msAct=false
		}
	}else{
		msAct=false
	}
	return
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

func makeNewChat() string{
	id:=makeID()
	_, err := db.Exec("INSERT INTO `chats` (`id`) VALUES ('" + id + "')")
    if err != nil {
        log.Panic(err)
    }
	_, err = db.Exec("CREATE TABLE IF NOT EXISTS `c" + id + "` (mess TEXT, date DATETIME)")
    if err != nil {
        log.Panic(err)
    }
	_, err = db.Exec("CREATE TABLE IF NOT EXISTS `f" + id + "` (name TEXT, data LONGBLOB, hash VARCHAR(32))")
    if err != nil {
        log.Panic(err)
    }
	return id
}

func checkChatExist(lid string) bool{
	res, err := db.Query("SELECT `id` FROM `chats` WHERE `id`='" + lid +"'")
    if err != nil {
        log.Panic(err)
    }
	if res.Next(){
		return true
	}
	return false
}

func checkMessages(lid string) ([]string){
	res, err := db.Query("SELECT * FROM `c"+lid+"` ORDER BY `date` DESC LIMIT 50")
    if err != nil {
        log.Panic(err)
		return []string{"Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку."}//,[][]byte{}
    }
	masmess:=[]string{}
	for res.Next(){
		mess:=""
		time:=""
		if err := res.Scan(&mess,&time); err != nil {
			log.Panic(err)
            return []string{}
        }
		time=strings.Replace(strings.Replace(strings.Replace(time, " ", "", -1), ":", "", -1), "-", "", -1)
		masmess=append(masmess, mess+time)
	}
	for i, j := 0, len(masmess)-1; i < j; i, j = i+1, j-1 {
        masmess[i], masmess[j] = masmess[j], masmess[i]
    }
	return masmess
}

func main(){
	log.Println("v0.2.8 ---------===============--------- 09.12.2022 14:00")
	log.Println("Сервер запущен.")
	
	users = make(map[string][]user)

	db2, err := sql.Open("mysql", "root:@/fastchat?maxAllowedPacket=524288000")
    db = db2
	
	log.Println("Подключение к MySQL...")

    if err != nil {
        log.Println("Ошибка подключение к MySQL:",err)
    }
	
	log.Println("Соединения создано, проверка..")

    err = db.Ping()
    if err != nil {
        log.Println("Ошибка проверки соединения:", err, "Повторно...")
        err = db.Ping()
        if err != nil {
            log.Fatal("Ошибка соединения:", err)
        }
    }
	
    defer db.Close()

    log.Println("Успешное подключение к MySQL")

	log.Println("Регистрация файлов и путей сайта...")
	err = filepath.Walk("./public", func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			log.Println("Ошибка доступа к", path,"-", err)
			return nil
		}
		if !info.IsDir() {
			curpath:=strings.Replace(strings.Replace(strings.Replace(path, "\\", "/", -1), "public", "", -1), "index.html", "", -1)
			log.Println("Регистрация",curpath)
			http.HandleFunc(curpath, func(w http.ResponseWriter, r *http.Request){
				if(curpath==r.URL.Path){
					http.ServeFile(w, r, path)
				}else{
					fmt.Fprintf(w,"Страница не найдена. 404.")
				}
			})
			return nil
		}else{
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
	
	log.Println("Прослушивается порт",port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

//========================================\\