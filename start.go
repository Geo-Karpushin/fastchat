package main

import (
	_"github.com/go-sql-driver/mysql"
	"github.com/gorilla/websocket"
    "path/filepath"
	"database/sql"
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
					chatId=ac
				}
				log.Println("Чат -", chatId)
			}
		}else{
			flag=true
			if(AFF!=""){
				log.Println(AFF)
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
	//db.Query("INSERT INTO `fastchat` (`id`) VALUES ('"+id+"')")
	return id
}

func main(){
	log.Println("Сервер запущен. v0.2.1 ---> 03.12.2022 0:45");


	db, err := sql.Open("mysql", "root:@/fastchat")
     
    if err != nil {
        log.Panic(err)
    }
	
	err=db.Ping()
	if err != nil {
        log.Println("Ошибка проверки соединения:",err,"Повторно...")
		err=db.Ping()
		if err != nil {
			log.Fatal("Ошибка соединения:",err)
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
	log.Println("Файлы зарегестрированы");
	http.HandleFunc("/speaker", speaker)
	log.Println("Начало прослушивания порта",port);
	log.Fatal(http.ListenAndServe(":"+port, nil))
}