package main

import (
    "path/filepath"
	"github.com/go-sql-driver/mysql"
	"strings"
	"io/fs"
	"log"
	"net/http"
)

func main(){
	//CONFIG\\
	port:="3000"
	//||||||\\
	log.Println("Сервер запущен. v0.2.0 ---> 03.12.2022 0:11");


	log.Println("Регистрация других файлов сайта..");
	err := filepath.Walk("./public", func(path string, info fs.FileInfo, err error) error {
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
			log.Println(path)
			http.HandleFunc(curpath, func(w http.ResponseWriter, r *http.Request){
				http.ServeFile(w, r, path)
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
	log.Println("Начало прослушивания порта",port);
	log.Fatal(http.ListenAndServe(":"+port, nil))
}