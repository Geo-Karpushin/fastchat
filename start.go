package main

//=================IMPORT================\\

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"run/speaker"
)

//=================TYPES==================\\

type Question struct {
	Question string `json:"question"`
}

//=================CONFIG=================\\

const version string = "v0.5.0"
const updateDay string = "23.11.2024"

const HTTPSport string = "443"
const HTTPport string = "80"

var questionFile *os.File

/*
speaker
Запросы от клиента:
0 - установка подключения
1 - сообщение
2 - файл
3 - новый пароль
4 - старые сообщения
5 - проверить пароль
6 - запрос файла
7 - смена темы
10 - начало трансляции
11 - новый фрагмент
12 - конец трансляции

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

	speaker.Init()

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
	http.HandleFunc("/speaker", speaker.Speaker)
	http.HandleFunc("/questions", questionSaver)

	log.Println("Файлы и пути зарегистрированы")

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
	// log.Fatal(http.ListenAndServe(":3000", nil))
	log.Fatal(http.ListenAndServeTLS(":"+HTTPSport, "sertificate/cert.pem", "sertificate/privkey.pem", nil))
}

func redirectToHTTPS(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "https://"+r.Host+":"+HTTPSport+r.RequestURI, http.StatusMovedPermanently)
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

/*
func writeError(err error) {
	buf := make([]byte, 1024)
	runtime.Stack(buf, false)
	fmt.Printf("Error: %v\nStack trace:\n%s\n", err, buf)
}
*/
