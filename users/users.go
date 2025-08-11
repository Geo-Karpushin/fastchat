package users

import (
	"errors"
	"log"
	"math"
	"run/easy"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type User struct {
	sync.Mutex
	Conn          *websocket.Conn
	UID           string
	Name          string
	PageType      string
	EndConnection *func()
}

type type_chats struct {
	sync.Mutex
	c map[string]map[string](*User)
}

var chats type_chats

func Init() {
	log.Println("Init closed chats")
	chats.Lock()
	chats.c = make(map[string]map[string](*User))
	chats.Unlock()
	log.Println("Init opened chats")
}

func ADD(CID string, cuser *User) {
	log.Println("ADD closed chats")
	chats.Lock()

	if _, ok := chats.c[CID]; !ok {
		chats.c[CID] = make(map[string]*User)
	}

	cuser.Lock()

	if _, ok := chats.c[CID][cuser.UID]; !ok && cuser.UID != "" {
		chats.c[CID][cuser.UID] = cuser
		chats.Unlock()
		log.Println("ADD opened chats")
		WriteWSMessageToAllExeptMe(CID, cuser.UID, easy.Message{Code: 10, Text: cuser.UID, Tag: cuser.PageType, Time: time.Now().Format(easy.TimeLayout)})
	} else {
		cuser.UID = changeUserID(CID, "", true)
		chats.c[CID][cuser.UID] = cuser
		chats.Unlock()
		log.Println("ADD opened chats")
		WriteWSMessageToAllExeptMe(CID, cuser.UID, easy.Message{Code: 10, Text: cuser.UID, Tag: cuser.PageType, Time: time.Now().Format(easy.TimeLayout)})
	}

	cuser.Conn.WriteJSON(easy.Message{
		Code: 1,
		Text: "Добро пожаловать в чат, " + cuser.UID + "\nПожалуйста, соблюдайте законодательство вашей страны!\nВы дали Пользовательское Соглашение https://fastchat.space/res/user-agreement.docx на логирование сообщений.\nВ случае необходимости Fast Chat будет вынужден сотрудничать с соответствующими органами.\nFAST CHAT НЕ НЕСЁТ ОТВЕТСТВЕННОСТИ ЗА ПОВЕДЕНИЕ ПОЛЬЗОВАТЕЛЕЙ!",
		Tag:  "INFO",
		Time: time.Now().Format(easy.TimeLayout),
	})

	cuser.Unlock()
}

func DEL(CID string, UID string) (success bool) {
	log.Println("DEL closed chats")
	chats.Lock()
	defer chats.Unlock()
	defer log.Println("DEL opened chats")

	if _, ok1 := chats.c[CID]; ok1 {
		if user, ok2 := chats.c[CID][UID]; ok2 {
			user.Lock()
			user.Conn.Close()
			delete(chats.c[CID], UID)
			err := writeWSMessageToAll(CID, UID, easy.Message{Code: 14, Text: UID, Tag: "", Time: time.Now().Format(easy.TimeLayout)})
			user.Unlock()
			if err != nil {
				return false
			}
		}
		if len(chats.c[CID]) == 0 {
			delete(chats.c, CID)
		}
		return true
	}
	return false
}

func GetOtherUIDs(CID, cUID string) (UIDS []struct {
	UID      string
	PageType string
	Name     string
}) {
	chats.Lock()
	log.Println("GetOterUIDs closed chats")
	if _, ok := chats.c[CID]; ok {
		for UID := range chats.c[CID] {
			if UID != cUID {
				UIDS = append(UIDS, struct {
					UID      string
					PageType string
					Name     string
				}{UID: UID, PageType: chats.c[CID][UID].PageType, Name: chats.c[CID][UID].Name})
			}
		}
	}
	chats.Unlock()
	log.Println("GetOtherUIDs opened chats")
	return
}

func For(CID, UID string, tail func(*User) error) error {
	log.Println("For closed chats")
	chats.Lock()
	if _, ok := chats.c[CID]; !ok {
		chats.Unlock()
		log.Println("For opened chats")
		return errors.New("users: For: undeclared chat " + CID)
	}
	if _, ok := chats.c[CID][UID]; !ok {
		chats.Unlock()
		log.Println("For opened chats")
		return errors.New("users: For: undeclared user " + UID + " in chat " + CID)
	}
	cuser := chats.c[CID][UID]
	chats.Unlock()
	log.Println("For opened chats")
	cuser.Lock()
	defer cuser.Unlock()
	return tail(cuser)
}

func foreach(CID, ignoreUID string, tail func(*User) error) error {
	if _, ok := chats.c[CID]; !ok {
		return errors.New("users: Foreach: undeclared chat " + CID)
	}
	for UID := range chats.c[CID] {
		log.Println(ignoreUID, UID)
		if ignoreUID == UID {
			continue
		}
		cuser := chats.c[CID][UID]
		log.Println("foreach lock", UID)
		cuser.Lock()
		log.Println("foreach use tail for", UID)
		err := tail(cuser)
		cuser.Unlock()
		log.Println("foreach unlock", UID)
		if err != nil {
			return err
		}
	}
	log.Println("Exited foreach")
	return nil
}

func ForeachExeptMe(CID, myUID string, tail func(*User) error) error {
	if myUID == "" {
		return errors.New("users: ForeachExeptMe: undeclared UID ")
	}
	log.Println("ForeachExeptMe closed chats")
	chats.Lock()
	defer chats.Unlock()
	defer log.Println("ForeachExeptMe opened chats")
	return foreach(CID, myUID, tail)
}

func writeWSMessageToAll(CID, ignoreUID string, mess easy.Message) error {
	return foreach(CID, ignoreUID, func(c *User) error { return c.Conn.WriteJSON(mess) })
}

func WriteWSMessageToAllExeptMe(CID, UID string, mess easy.Message) error {
	if UID == "" {
		return errors.New("users: WriteWSMessageToAllExeptMe: undeclared UID ")
	}
	return ForeachExeptMe(CID, UID, func(c *User) error {
		return c.Conn.WriteJSON(mess)
	})
}

func changeUserID(CID, UID string, forceChange bool) string {
	if _, ok1 := chats.c[CID]; ok1 {
		if _, ok2 := chats.c[CID][UID]; (ok2 && forceChange) || UID == "" {
			attempts := 0
			curGenerateUIDlen := easy.MinUIDlen

			UID = easy.MakeRandString(easy.MinUIDlen)
			_, exist := chats.c[CID][UID]

			for exist {
				if float64(attempts) >= math.Pow(float64(len(easy.MyRunes)), float64(curGenerateUIDlen)) {
					attempts = 0
					curGenerateUIDlen += 1
					if curGenerateUIDlen > easy.MaxUIDlen {
						return ""
					}
				}

				UID = easy.MakeRandString(easy.MinUIDlen)
				_, exist = chats.c[CID][UID]
				attempts += 1
			}
		}

		if _, ok2 := chats.c[CID][UID]; !ok2 {
			return UID
		}

	}
	return ""
}

func ChangeUserID(CID, UID string, forceChange bool) string {
	log.Println("ChangeUserID closed chats")
	chats.Lock()
	defer chats.Unlock()
	log.Println("ChangeUserID opened chats")
	return changeUserID(CID, UID, forceChange)
}
