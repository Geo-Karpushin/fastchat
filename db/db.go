package db

import (
	"encoding/json"
	"errors"
	"log"
	"math"
	"os"
	"run/easy"
	"strconv"
	"time"

	"github.com/gocql/gocql"
)

type DB struct {
	cluster *gocql.ClusterConfig
	session *gocql.Session
}

type Answer struct {
	Answer *gocql.Query
}

type Scanner struct {
	Scanner gocql.Scanner
}

var db DB

func Init() {
	tryToConnect := func() (err error) {
		db.cluster = gocql.NewCluster("localhost")
		db.cluster.Keyspace = "fastchat"
		db.cluster.Consistency = gocql.Quorum
		db.session, err = db.cluster.CreateSession()
		return
	}

	for db.session == nil || db.session.Closed() {
		err := tryToConnect()
		if err != nil {
			log.Printf("gocql connect error: %v", err)
		}
		time.Sleep(time.Millisecond * 2000)
	}
}

func Query(query string, values ...interface{}) *Answer {
	return &Answer{db.session.Query(query, values...)}
}

func ExecuteQuery(query string, values ...interface{}) error {
	return Query(query, values...).Answer.Exec()
}

func (answer Answer) Scan(values ...interface{}) error {
	return answer.Answer.Scan(values...)
}

func (answer Answer) Scanner() Scanner {
	return Scanner{answer.Answer.Iter().Scanner()}
}

func (scanner Scanner) Next() bool {
	return scanner.Scanner.Next()
}

func (scanner Scanner) Scan(values ...interface{}) error {
	return scanner.Scanner.Scan(values...)
}

func CheckChat(chatID string) (exist bool, pass string, rop bool, theme int) {
	err := Query("SELECT password, readonlypass, theme FROM chats WHERE id=?", chatID).Scan(&pass, &rop, &theme)

	if err != nil {
		return false, "", false, 0
	}
	return true, pass, rop, theme
}

func CheckMessages(chatID string, oldesttime time.Time) (masmess [][]byte) {
	res := Query("SELECT type, mess, tag, date FROM messes WHERE chatid = ? AND date < ? LIMIT 50;", chatID, oldesttime).Scanner()

	for res.Next() {
		var mess, tag string
		var ctime time.Time
		var codeBool bool
		if err := res.Scan(&codeBool, &mess, &tag, &ctime); err != nil {
			b, _ := json.Marshal(easy.Message{Code: 1, Text: "Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку.", Tag: "", Time: time.Now().Format(easy.TimeLayout)})
			masmess = append(masmess, b)
			return
		}
		code := 1
		if codeBool {
			code = 2
		}
		b, _ := json.Marshal(easy.Message{Code: code, Text: mess, Tag: tag, Time: ctime.Format(easy.TimeLayout)})
		masmess = append(masmess, b)
	}
	return
}

func MakeChat(id string) (string, error) {
	if id == "" {
		attempts := 0
		for {
			if float64(attempts) >= math.Pow(float64(len(easy.MyRunes)), float64(easy.GenerateCIDlen)) {
				easy.GenerateCIDlen += 1
				attempts = 0
			}

			id = easy.MakeRandString(easy.GenerateCIDlen)

			if exist, _, _, _ := CheckChat(id); !exist {
				break
			}
			attempts += 1
		}
	}
	err := ExecuteQuery("INSERT INTO chats (id) VALUES (?)", id)
	if err != nil {
		return "", err
	}
	return id, nil
}

func SaveTheme(chatID string, num int) (err error) {
	ExecuteQuery("UPDATE chats SET theme = ? WHERE id = ?;", num, chatID)
	return nil
}

func ChangePassword(chatID string, newPasswordstr string, readOnlyPass bool) error {
	return ExecuteQuery("UPDATE chats SET password = ?, readonlypass = ? WHERE id = ?;", newPasswordstr, readOnlyPass, chatID)
}

func SaveFile(chatID string, hName string, data *[]byte) (string, error) {
	if hName == "" {
		return "", errors.New("db: SaveFile: empty hname")
	}
	path := "./files/" + hName[:11] + "/" + hName[11:22] + "/" + hName[22:33] + "/" + hName[33:44]
	fi, err := os.Stat(path)
	if os.IsNotExist(err) {
		os.MkdirAll(path[:len(path)-11], 0777)
		_, err = os.Create(path)
		if err != nil {
			return "", err
		}
	} else if err == nil && len(*data) == int(fi.Size()) {
		log.Println(chatID, "- файл уже существует по пути:", path)
		return path, nil
	} else if err == nil {
		tpath := path
		attempt := 1
		for err == nil {
			tpath = path + "_" + strconv.Itoa(attempt)
			_, err = os.Stat(tpath)
		}
		if !os.IsNotExist(err) {
			return "", err
		}
		path = tpath
	} else {
		return "", err
	}
	err = os.WriteFile(path, *data, 0644)
	if err != nil {
		return "", err
	}
	log.Println(chatID, "- файл успешно сохранён по пути:", path)
	return path, nil
}

func GetFile(chatID string, name string, sendtime time.Time, tag string) (string, []byte, error) {
	res := Query("SELECT seconddata FROM messes WHERE chatid = ? AND type = ? AND mess = ? AND date = ? LIMIT 1 ALLOW FILTERING;", chatID, true, name, sendtime).Scanner()

	if res.Next() {
		var path string
		if err := res.Scan(&path); err != nil {
			return "", nil, err
		}
		file, err := os.Open(path)
		if err != nil {
			return "", nil, err
		}
		stat, err := os.Stat(path)
		if err != nil {
			return "", nil, err
		}
		data := make([]byte, int(stat.Size()))
		_, err = file.Read(data)
		if err != nil {
			return "", nil, err
		}
		return path, data, nil
	}

	return "", nil, errors.New("db: GetFile: No such file " + name)
}

func Save(chatID string, mess easy.Message, name string) {
	mtype := false
	if mess.Code == 2 {
		mtype = true
	}
	thetime, err := time.Parse(easy.TimeLayout, mess.Time)
	if err != nil {
		log.Panic(err)
		return
	}
	if mtype {
		err = ExecuteQuery("INSERT INTO messes (chatID, type, mess, tag, date, seconddata) VALUES (?,?,?,?,?,?)", chatID, mtype, mess.Text, mess.Tag, thetime, name)
		if err != nil {
			log.Panic(err)
			return
		}
	} else {
		err = ExecuteQuery("INSERT INTO messes (chatID, type, mess, tag, date) VALUES (?,?,?,?,?)", chatID, mtype, mess.Text, mess.Tag, thetime)
		if err != nil {
			log.Panic(err)
			return
		}
	}
}
