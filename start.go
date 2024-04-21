package main

import (
	_"github.com/go-sql-driver/mysql"
	"github.com/gorilla/websocket"
    "path/filepath"
	"database/sql"
	"encoding/hex"
	"math/rand"
	"net/http"
	"strings"
	"time"
	"io/fs"
	"log"
	"fmt"
)

//=================CONFIG=================\\

var db *sql.DB
var maxIDlen int = 5
var port string = "3000"

//========================================\\

var upgrader = websocket.Upgrader{} // use default options

var temp []byte

func speaker(w http.ResponseWriter, r *http.Request) {
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	defer c.Close()
	chatId:=""
	AFF:=""
	for {
		flag:=false
		messType, mess, err := c.ReadMessage()
		if err != nil {
			log.Println("Возможная ошибка (норма: 1000, 1001, 1005, 1006):", err)
			break
		}
		if messType==1{
			rMess:=[]rune(string(mess))
			code:=string(rMess[0:4])
			ac:=strings.Split(string(mess),code)[1]
			time:=""
			log.Println("Сообщение -", string(mess))
			log.Println("Код -", code)
			log.Println("После кода -", ac)
			if(code=="{~}1"){
				flag=true
				if ac==""{
					chatId=makeNewChat()
					mess=[]byte("{~}1"+chatId)
					flag=false
				}else{
					if checkChatExist(ac){
						chatId=ac
					}else{
						chatId=makeNewChat()
						mess=[]byte("{~}1"+chatId)
						flag=false
					}
					messages,_:=checkMessages(chatId)
					for i:=0; i<len(messages);i++{
						err = c.WriteMessage(1, []byte(messages[i]))
						if err != nil {
							log.Println("Возможная ошибка отправки сообщения:", err)
							break
						}
					}
				}
				log.Println("Чат -", chatId)
			}else if(code=="{~}2"){
				flag=true
				if ac!=""{
					AFF=ac
				}else{
					flag=false
					mess=[]byte("Ошибка отправки файла, имя должно быть не пустым")
					log.Println("Ошибка отправки файла, имя должно быть не пустым")
				}
			}else{
				if ac!=""{
					time=string(rMess[len(rMess)-14:])
					ac=string(rMess[0:len(rMess)-14])
				}
				log.Println("Сообщение -", ac)
				log.Println("Время -", time)
				SaveMessage(chatId,ac,time)
			}
		}else{
			flag=true
			if(AFF!=""){
				log.Println(AFF)
				if string(mess)==string(temp){
					log.Println("всё хорошо")
				}else{
					log.Println(string(temp))
					log.Println(string(mess))
				}
				rAFF:=[]rune(AFF)
				log.Println("Имя:",string(rAFF[0:len(rAFF)-14]))
				log.Println("Время:",string(rAFF[len(rAFF)-14:]))
				name:=string(rAFF[0:len(rAFF)-14])
				date:=string(rAFF[len(rAFF)-14:])
				SaveMessage(chatId,"{~}2"+name,date)
				hex:=converToBlobStr(mess)
				SaveFile(chatId,name,hex)
				//log.Println(mess)
				messType=1
				mess=[]byte("{~}2"+AFF)
				err = c.WriteMessage(messType, mess)
				if err != nil {
					log.Println("Возможная ошибка отправки сообщения:", err)
					break
				}
				AFF=""
			}else{
				log.Println("Пришёл файл, хотя не ожидался")
			}
			mess=[]byte{}
		}
		if !flag{
			err = c.WriteMessage(messType, mess)
			if err != nil {
				log.Println("Возможная ошибка отправки сообщения:", err)
				break
			}
		}
	}
}

func converToBlobStr(in []byte) (out string){
	for i:=0; i<len(in); i++{
		out+=fmt.Sprintf("%x", in[i])
	}
	return out
}

func converFromBlobStr(in string) []byte{
	decodedByteArray, err := hex.DecodeString(in)
	if err != nil {
		log.Panic(err)
	}
	return decodedByteArray
}

func SaveMessage(chatId string, text string, time string){
	_, err := db.Exec("INSERT INTO `c"+chatId+"` (`mess`, `date`) VALUES ('" + text + "','" + time + "')")
    if err != nil {
        log.Panic(err)
    }
}
func SaveFile(chatId string, name string, data string){
	req:="INSERT INTO `f"+chatId+"` (`name`, `data`) VALUES ('" + name + "','" + data + "')"
	log.Println(req)
	_, err := db.Exec(req)
    if err != nil {
        log.Panic(err)
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
	_, err = db.Exec("CREATE TABLE IF NOT EXISTS `f" + id + "` (name TEXT, data LONGBLOB)")
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

func checkMessages(lid string) ([]string, [][]byte){
	res, err := db.Query("SELECT * FROM `c"+lid+"` LIMIT 50")
    if err != nil {
        log.Panic(err)
		return []string{"Ошибка загрузки данных, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку."},[][]byte{}
    }
	masmess:=[]string{}
	masfile:=[][]byte{}
	for res.Next(){
		mess:=""
		time:=""
		if err := res.Scan(&mess,&time); err != nil {
			log.Panic(err)
            return []string{},[][]byte{}
        }
		time=strings.Replace(strings.Replace(strings.Replace(time, " ", "", -1), ":", "", -1), "-", "", -1)
		masmess=append(masmess, mess+time)
		if string([]rune(mess)[0:4])=="{~}2"{
			name:=string([]rune(mess)[4:len([]rune(mess))])
			
			log.Println("Ищю файл",name)
			var data string
			if err := db.QueryRow("SELECT CONVERT(`data` USING utf8) FROM `f"+lid+"` WHERE `name`='"+name+"'").Scan(&data); err != nil {
				if err == sql.ErrNoRows {
					log.Println("Отсутствует файл",name,"in",lid)
					return []string{"Ошибка загрузки данных, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку. (Отсутствует файл",name,"в",lid+")"}, [][]byte{}
				}
				log.Panic(err)
				return []string{},[][]byte{}
			}
			ans:=converFromBlobStr(data)
			if string(temp)==string([]byte{}){
				temp=ans
			}
			masfile=append(masfile,ans)
		}
		
	}
	return masmess, masfile
}

func main(){
	log.Println("Сервер запущен. v0.2.4 ---> 03.12.2022 22:00");


	db2, err := sql.Open("mysql", "root:@/fastchat")
    db = db2

    if err != nil {
        log.Panic(err)
    }

    err = db.Ping()
    if err != nil {
        log.Println("Ошибка проверки соединения:", err, "Повторно...")
        err = db.Ping()
        if err != nil {
            log.Fatal("Ошибка соединения:", err)
        }
    }

    log.Println("Успешное подключение к MySQL")

    defer db.Close()

	log.Println("Регистрация других файлов сайта..");
	err = filepath.Walk("./public", func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			log.Println("Ошибка доступа к", path,"-", err)
			return nil
		}
		/*
		if info.IsDir() && info.Name() == subDirToSkip {
			fmt.Printf("skipping a dir without errors: %+v \n", info.Name())
			return filepath.SkipDir
		}
		*/
		if !info.IsDir() {
			log.Println("Файл: ", path)
			curpath:=strings.Replace(strings.Replace(strings.Replace(path, "\\", "/", -1), "public", "", -1), "index.html", "", -1)
			log.Println(path,"==>",curpath)
			http.HandleFunc(curpath, func(w http.ResponseWriter, r *http.Request){
				//fmt.Fprintf(w,r.URL.Path)
				if(curpath==r.URL.Path){
					http.ServeFile(w, r, path)
				}else{
					fmt.Fprintf(w,"Страница не найдена. 404.")
				}
			})
			return nil
		}else{
			log.Println("--> ", path)
		}
		return nil
	})
	if err != nil {
		log.Panic(err)
		return
	}
	log.Println("Файлы зарегестрированы")
	http.HandleFunc("/speaker", speaker)
	log.Println("Начало прослушивания порта",port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}