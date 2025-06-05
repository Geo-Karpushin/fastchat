package speaker

import (
	"encoding/json"
	"log"
	"net/http"
	"run/db"
	"run/easy"
	"run/users"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

func Init() {
	users.Init()

	log.Println("Подключение к БД...")

	db.Init()
}

func Speaker(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Upgrade(w, r, nil, easy.MaxTransmitSizeInBytes, easy.MaxTransmitSizeInBytes)
	if err != nil {
		http.Error(w, "Ошибка перехода к WebSocket соединению", 500)
		log.Printf("Ошибка перехода к WebSocket соединению: %v", err)
		return
	}
	c.SetReadLimit(easy.MaxTransmitSizeInBytes)
	var chatID string
	var rop bool
	var cuser users.User
	var mess easy.Message
	endConnection := func() {
		log.Println("Клиент:", r.RemoteAddr+". Отключен.")
		users.DEL(chatID, cuser.UID)
	}
	log.Println("Клиент:", r.RemoteAddr+". Подключен.")
	for {
		messType, inBin, err := c.ReadMessage()
		if err != nil {
			endConnection()
			log.Printf("Error: %v", err)
			return
		}
		if messType == 1 {
			err = json.Unmarshal(inBin, &mess)
			if err != nil {
				endConnection()
				log.Printf("Error: %v", err)
				return
			}
			switch mess.Code {
			case 0:
				cuser.Lock()
				cuser.PageType = mess.Tag
				cuser.Unlock()
				mess.Text = strings.ToLower(mess.Text)
				lenMessText := len(mess.Text)
				if mess.Text != "" && easy.IsLetter(mess.Text) && lenMessText >= easy.MinCIDlen && lenMessText <= easy.MaxCIDlen {
					exist, setPassword, lrop, theme := db.CheckChat(mess.Text)
					rop = lrop
					if exist {
						cuser.Lock()
						err := c.WriteJSON(easy.Message{Code: 7, Text: strconv.Itoa(theme), Tag: "", Time: time.Now().Format(easy.TimeLayout)})
						cuser.Unlock()
						if err != nil {
							endConnection()
							log.Printf("Error: %v", err)
							return
						}
						if setPassword != "" && !rop {
							mess = easy.Message{Code: 5, Text: "", Tag: "false", Time: time.Now().Format(easy.TimeLayout)}
						} else {
							chatID = mess.Text
							trop := "false"
							if rop {
								trop = "true"
							}
							mess = easy.Message{Code: 3, Text: chatID, Tag: trop, Time: time.Now().Format(easy.TimeLayout)}
							cuser.Lock()
							cuser.Conn = c
							cuser.EndConnection = &endConnection
							cuser.Unlock()
							users.ADD(chatID, &cuser)
							messes := db.CheckMessages(chatID, time.Now())
							cuser.Lock()
							log.Println("Клиент:", cuser.UID, r.RemoteAddr+", подключен к чату:", chatID+".")
							for i := 0; i < len(messes); i++ {
								cuser.Conn.WriteMessage(1, messes[i])
							}
							cuser.Unlock()
						}
					} else {
						chatID, err = db.MakeChat(mess.Text)
						if err != nil {
							endConnection()
							log.Printf("Error: %v", err)
							return
						}
						mess = easy.Message{Code: 3, Text: chatID, Tag: "false", Time: time.Now().Format(easy.TimeLayout)}
						cuser.Lock()
						cuser.Conn = c
						cuser.EndConnection = &endConnection
						log.Println("Клиент:", cuser.UID, r.RemoteAddr+", создал чат с заданым идентификатором:", chatID+".")
						cuser.Unlock()
						users.ADD(chatID, &cuser)
					}
				} else if mess.Text == "" {
					chatID, err = db.MakeChat("")
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					mess = easy.Message{Code: 3, Text: chatID, Tag: "false", Time: time.Now().Format(easy.TimeLayout)}
					cuser.Lock()
					cuser.Conn = c
					cuser.EndConnection = &endConnection
					log.Println("Клиент:", cuser.UID, r.RemoteAddr+", создал чат:", chatID+".")
					cuser.Unlock()
					users.ADD(chatID, &cuser)
				} else {
					mess = easy.Message{Code: 3, Text: "EOF", Tag: "true", Time: time.Now().Format(easy.TimeLayout)}
				}
			case 1:
				if chatID != "" && cuser.UID != "" && !rop {
					db.Save(chatID, easy.Message(mess), "")
					cuser.Lock()
					if mess.Tag == "" {
						mess.Tag = cuser.UID
					} else {
						mess.Tag = cuser.UID + ". Тег: " + mess.Tag
					}
					cuser.Conn.WriteJSON(mess)
					UID := cuser.UID
					cuser.Unlock()
					err = users.WriteWSMessageToAllExeptMe(chatID, UID, mess)
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". Получено сообщение:", mess.Text)
				}
				mess = easy.Message{}
				continue
			case 2:
				if chatID != "" && !rop {
					continue
				}
				mess = easy.Message{}
				continue
			case 3:
				if chatID != "" && !rop {
					var readOnlyPass bool
					if mess.Tag == "false" {
						readOnlyPass = true
					}
					if mess.Text != "" {
						cuser.Lock()
						log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". Пароль изменён, хэш:", mess.Text)
						cuser.Unlock()

						err = db.ChangePassword(chatID, mess.Text, readOnlyPass)
						if err != nil {
							endConnection()
							log.Printf("Error: %v", err)
							return
						}
						mess = easy.Message{Code: 0, Text: chatID, Tag: "", Time: time.Now().Format(easy.TimeLayout)}

						users.ForeachExeptMe(chatID, cuser.UID, func(u *users.User) error {
							err := u.Conn.WriteJSON(mess)
							// (*u.EndConnection)()
							return err
						})
						cuser.Lock()
						cuser.Conn.WriteJSON(mess)
						cuser.Unlock()
						endConnection()
					} else {
						cuser.Lock()
						log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". Пароль снят.")
						UID := cuser.UID
						cuser.Unlock()

						err = db.ChangePassword(chatID, "", false)
						if err != nil {
							endConnection()
							log.Printf("Error: %v", err)
							return
						}

						err = users.WriteWSMessageToAllExeptMe(chatID, UID, mess)

						cuser.Lock()
						mess = easy.Message{Code: 1, Text: "Пароль снят.", Tag: "Пароль снял " + cuser.UID, Time: time.Now().Format(easy.TimeLayout)}
						if err != nil {
							cuser.Unlock()
							endConnection()
							log.Printf("Error: %v", err)
							return
						}

						err = cuser.Conn.WriteJSON(mess)
						if err != nil {
							cuser.Unlock()
							endConnection()
							log.Printf("Error: %v", err)
							return
						}
						cuser.Unlock()
						// err = db.ExecuteQuery("UPDATE chats SET password = ?, readonlypass = ? WHERE id = ?", nil, nil, chatID)
						// if err != nil {
						// 	log.Printf("Error: %v", err)
						// }
					}
				}
				mess = easy.Message{}
				continue
			case 4:
				if chatID != "" {
					cuser.Lock()
					log.Println("Клиент:", cuser.UID, r.RemoteAddr+", запросил сообщения от", mess.Time, "в чате:", chatID+".")
					cuser.Unlock()
					oldestime, err := time.Parse(easy.TimeLayout, mess.Time)
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					messes := db.CheckMessages(chatID, oldestime)
					cuser.Lock()
					for i := 0; i < len(messes); i++ {
						for i := 0; i < len(messes); i++ {
							c.WriteMessage(1, messes[i])
						}
					}
					cuser.Unlock()
				}
				mess = easy.Message{}
				continue
			case 5:
				exist, setPassword, _, _ := db.CheckChat(mess.Text)
				if exist && setPassword != "" {
					if easy.GetHash([]byte(mess.Time+setPassword)) == mess.Tag {
						if rop {
							cuser.Lock()
							log.Println("Клиент:", cuser.UID, r.RemoteAddr+", ввёл правильный пароль и получил доступ к отправке информации в чат", chatID+".")
							cuser.Unlock()
							rop = false
							mess = easy.Message{Code: 3, Text: chatID, Tag: "false", Time: time.Now().Format(easy.TimeLayout)}
						} else {
							chatID = mess.Text
							cuser.Lock()
							cuser.Conn = c
							cuser.EndConnection = &endConnection
							cuser.Unlock()
							users.ADD(chatID, &cuser)
							messes := db.CheckMessages(chatID, time.Now())
							cuser.Lock()
							log.Println("Клиент:", cuser.UID, r.RemoteAddr+", ввёл правильный пароль и подключился к чату:", chatID+".")
							for i := 0; i < len(messes); i++ {
								cuser.Conn.WriteMessage(1, messes[i])
							}
							cuser.Unlock()
							mess = easy.Message{Code: 3, Text: chatID, Tag: "false", Time: time.Now().Format(easy.TimeLayout)}
						}
					} else {
						trop := "false"
						if rop {
							trop = "true"
						}
						mess = easy.Message{Code: 5, Text: "", Tag: trop, Time: time.Now().Format(easy.TimeLayout)}
					}
				} else {
					mess = easy.Message{Code: 1, Text: "Неправильное обращение, повторите попытку (400)", Tag: "", Time: time.Now().Format(easy.TimeLayout)}
				}
			case 6:
				if chatID != "" {
					cuser.Lock()
					log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". Запрошен файл", mess.Text, "от", mess.Time)
					cuser.Unlock()
					sendtime, err := time.Parse(easy.TimeLayout, mess.Time)
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					path, data, err := db.GetFile(chatID, mess.Text, sendtime, mess.Tag)
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					out, err := json.Marshal(easy.Message{Code: 6, Text: mess.Text, Tag: mess.Tag, Time: time.Now().Format(easy.TimeLayout)})
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					cuser.Lock()
					err = cuser.Conn.WriteMessage(1, out)
					cuser.Unlock()
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					cuser.Lock()
					err = cuser.Conn.WriteMessage(2, data)
					cuser.Unlock()
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					cuser.Lock()
					log.Println("Клиент:", cuser.UID, r.RemoteAddr, "- получает файл", path)
					cuser.Unlock()
				}
				mess = easy.Message{}
				continue
			case 7:
				if chatID != "" && !rop {
					num, err := strconv.Atoi(mess.Text)
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
					err = db.SaveTheme(chatID, num)
					if err != nil {
						endConnection()
						log.Printf("Error: %v", err)
						return
					}
				}
				mess = easy.Message{}
				continue
			// case 9: // Смена UID
			// 	if chatID != "" {
			// 		users.ChangeUserID(chatID, cuser.UID, cuser.UID mess.Tag)
			// 	}
			case 10: // Запрос UIDs клиентов
				cuser.Lock()
				if chatID != "" && cuser.UID != "" {
					log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". Запрос UIDs клиентов в чате.")
					cuser.Unlock()
					UIDs := users.GetOtherUIDs(chatID, cuser.UID)
					cuser.Lock()
					for i := 0; i < len(UIDs); i++ {
						cuser.Conn.WriteJSON(easy.Message{Code: 10, Text: UIDs[i].UID, Tag: UIDs[i].PageType, Time: mess.Time})
					}
				}
				cuser.Unlock()
				mess = easy.Message{}
				continue
			case 11: // Offer к клиенту
				if chatID != "" && !rop {
					cuser.Lock()
					log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". Offer к", mess.Tag)
					cuser.Unlock()
					users.For(chatID, mess.Tag, func(u *users.User) error {
						return u.Conn.WriteJSON(easy.Message{Code: 11, Text: mess.Text, Tag: cuser.UID, Time: mess.Time})
					})
				}
				mess = easy.Message{}
				continue
			case 12: // Answer к клиенту
				cuser.Lock()
				log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". Answer к", mess.Tag)
				cuser.Unlock()
				users.For(chatID, mess.Tag, func(u *users.User) error {
					return u.Conn.WriteJSON(easy.Message{Code: 12, Text: mess.Text, Tag: cuser.UID, Time: mess.Time})
				})
				mess = easy.Message{}
				continue
			case 13: // IceClient к клиенту
				cuser.Lock()
				log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". IceCandidate к", mess.Tag)
				cuser.Unlock()
				users.For(chatID, mess.Tag, func(u *users.User) error {
					return u.Conn.WriteJSON(easy.Message{Code: 13, Text: mess.Text, Tag: cuser.UID, Time: mess.Time})
				})
				mess = easy.Message{}
				continue

			// case 11: // Ответ на запрос трансляции (answer)
			// 	offeredUserIndex, err := strconv.Atoi(mess.Tag)
			// 	if err != nil || offeredUserIndex < 0 || offeredUserIndex >= len(users.u[chatID]) {
			// 		endConnection()
			// 		log.Panic(r.RemoteAddr, "send impossible offeredUserIndex or", err)
			// 	}
			// 	users.u[chatID][offeredUserIndex].mux.Lock()
			// 	log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Offer трансляции к клиенту", users.u[chatID][offeredUserIndex].i)
			// 	out, err := json.Marshal(easy.Message{11, mess.Text, getHash([]byte(r.RemoteAddr)), time.Now().Format(easy.TimeLayout)})
			// 	if err != nil {
			// 		users.u[chatID][offeredUserIndex].mux.Unlock()
			// 		endConnection()
			// 		log.Printf("Error: %v", err)
			// 	}
			// 	users.u[chatID][offeredUserIndex].c.WriteMessage(1, out)
			// 	mess = easy.Message{11, "ok", getHash([]byte("123")), "123"}
			// 	users.u[chatID][offeredUserIndex].mux.Unlock()
			// 	continue
			// case 12:
			// 	var requestedUser *user
			// 	userFounded := false
			// 	users.mux.Lock()
			// 	for i := 0; i < len(users.u[chatID]); i++ {
			// 		users.u[chatID][i].mux.Lock()
			// 		if getHash([]byte(users.u[chatID][i].i)) == mess.Tag {
			// 			userFounded = true
			// 			requestedUser = users.u[chatID][i]
			// 			users.u[chatID][i].mux.Unlock()
			// 			break
			// 		}
			// 		users.u[chatID][i].mux.Unlock()
			// 	}
			// 	if !userFounded {
			// 		mess = easy.Message{12, mess.Text, getHash([]byte(r.RemoteAddr)), time.Now().Format(easy.TimeLayout)}
			// 	}
			// 	users.mux.Unlock()
			// 	log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Offer трансляции к клиенту", requestedUser.i)
			// 	out, err := json.Marshal(easy.Message{12, mess.Text, getHash([]byte(r.RemoteAddr)), time.Now().Format(easy.TimeLayout)})
			// 	if err != nil {
			// 		endConnection()
			// 		log.Printf("Error: %v", err)
			// 	}
			// 	requestedUser.c.WriteMessage(1, out)
			// 	requestedUser.mux.Unlock()
			// 	continue
			default:
				mess = easy.Message{Code: 1, Text: "Неправильное обращение, повторите попытку (400)", Tag: "", Time: time.Now().Format(easy.TimeLayout)}
			}
		} else if messType == 2 && chatID != "" && cuser.UID != "" && !rop && mess.Code == 2 {
			cuser.Lock()
			log.Println("Клиент:", cuser.UID, r.RemoteAddr+", чат:", chatID+". Сохранение файла:", mess.Text)
			cuser.Unlock()
			name, err := db.SaveFile(chatID, easy.GetHash(inBin), &inBin)
			if err != nil {
				endConnection()
				log.Printf("Error: %v", err)
				return
			}
			db.Save(chatID, easy.Message(mess), name)
			cuser.Lock()
			if mess.Tag == "" {
				mess.Tag = cuser.UID
			} else {

				mess.Tag = cuser.UID + ". Тег: " + mess.Tag
			}
			cuser.Conn.WriteJSON(mess)

			UID := cuser.UID
			cuser.Unlock()
			users.WriteWSMessageToAllExeptMe(chatID, UID, mess)
			mess = easy.Message{}
			continue
		} else {
			mess = easy.Message{Code: 1, Text: "Неправильное обращение, повторите попытку (400)", Tag: "", Time: time.Now().Format(easy.TimeLayout)}
		}
		out, err := json.Marshal(mess)
		if err != nil {
			endConnection()
			log.Printf("Error: %v", err)
			return
		}
		cuser.Lock()
		c.WriteMessage(1, out)
		cuser.Unlock()
		mess = easy.Message{}
	}
	endConnection()
}
