if (typeof (msg.data) == 'string') {
	console.log(msg.data)
	let inp = JSON.parse(msg.data);
	console.log(inp);
	if (inp.code == 1) {
		open("./?" + inp.text, "_self");
	} else if (inp.code == 2) {
		addMessage(inp)
	} else if (inp.code == 3) {
		mainpage.style.display = "block";
		errorpage.style.display = "none";
		idName.innerText = "ID: " + id;
	} else if (inp.code == 4) {
		id = inp.text;
		history.pushState("", "Fast Chat", "./?" + id);
		if (id == "EOF") {
			mainpage.style.display = "none";
			errorpage.style.display = "flex";
			idName.innerText = "400";
		} else {
			mainpage.style.display = "block";
			errorpage.style.display = "none";
			idName.innerText = "ID: " + id;
			makeQR();
		}
	} else if (inp.code == 5) {
		theerror.innerHTML = `
			<p>Для доступа к чату введите пароль и нажмите на кнопку "Открыть"</p>
			<div id="password" contenteditable=""></div>
			<button id="check-password" onclick="checkPassword();">Открыть</button>
		`;
		mainpage.style.display = "none";
		errorpage.style.display = "flex";
		idName.innerText = "403";
	} else if (inp.code == 6) {
		addMessage(inp)
	} else {
		let mess = msg.data.substring(0, msg.data.length - 33);
		let time = msg.data.substring(msg.data.length - 33, msg.data.length);
		addMessage(1, inp, time);
	}
} else {
	console.log("Пришёл файл");
	file = new File([msg.data], awaitingFileName);
	let url = URL.createObjectURL(file);
	download(url);
	addMessage({code: 1, text: "Файл " + awaitingFileName + " загружается, не закрывайте страницу, пока он не появится в папке загрузок для этого браузера.", time: goodDate(new Date())});
}









messType, in, err := c.ReadMessage()
		if err != nil {
			log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Ошибка:", err)
			break
		} else {
			if messType == 1 {
				err = json.Unmarshal(in, &mess)
				if err != nil {
					log.Panic(err)
				}
				if mess.Code == 1 { //Новый идентификатор
					if mess.Text != "" {
						var id, pass string = strings.ToLower(mess.Text), mess.Time
						if checkChatExist(id) {
							rpass := checkChatPass(id)
							log.Println("Клиент:", r.RemoteAddr+", подключается к чату", id)
							if rpass == pass {
								chatID = id
								log.Println("Клиент:", r.RemoteAddr+", подключен к чату", chatID)

								messages := checkMessages(chatID)

								for i := 0; i < len(messages); i++ {
									out, err := json.Marshal(Message{0, messages[i][0], messages[i][1]})
									if err != nil {
										log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщений после кода 1 в speaker():", err)
										break
									}
									err = c.WriteMessage(1, out)
									if err != nil {
										log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщений после кода 1 в speaker():", err)
										break
									}
								}

								cuser = makeUser(c, chatID)
								ADD(&cuser)

								mess.Code = 3
								mess.Text = ""
								mess.Time = time.Now().Format(timeLayout)
							} else {
								log.Println("Клиент:", r.RemoteAddr, "ввёл неверный пароль от чата", id)
								mess.Code = 5
								mess.Text = ""
								mess.Time = time.Now().Format(timeLayout)
							}
						} else if IsLetter(id) && len(id) >= 5 && len(id) <= 10 && id != "undefined" && id != "chats" {
							chatID = id
							cuser = makeUser(c, chatID)
							ADD(&cuser)
							log.Println("Клиент:", r.RemoteAddr+", создал чат", chatID)
							makeNewChat(chatID)
							continue
						} else {
							mess.Code = 4
							mess.Text = "EOF"
							mess.Time = time.Now().Format(timeLayout)
						}
					} else {
						chatID = makeNewChat("")
						mess.Code = 4
						mess.Text = chatID
						mess.Time = time.Now().Format(timeLayout)
						cuser = makeUser(c, chatID)
						ADD(&cuser)
						log.Println("Клиент:", r.RemoteAddr+", создал чат", chatID)
					}
				} else if chatID != "None" {
					if mess.Code == 2 { //Сообщение о скорой отправке файла с AFN (имя + время)
						if mess.Text != "" {
							log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Скоро придёт файл с AFN =", mess.Text)
							AFN = mess.Text
							AFT = mess.Time
							continue
						} else {
							mess.Code = 0
							mess.Text = "Ошибка отправки файла, имя должно быть не пустым"
							mess.Time = time.Now().Format(timeLayout)
							log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Ошибка отправки файла, имя должно быть не пустым.")
						}
					} else if mess.Code == 3 { //Запрос более старых сообщений
						ctime, err := time.Parse(timeLayout, mess.Time)
						if err != nil {
							log.Panic(err)
						}

						messages := checkOldMessages(chatID, ctime)

						for i := 0; i < len(messages); i++ {
							out, err := json.Marshal(Message{6, messages[i][0], messages[i][1]})
							if err != nil {
								log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщений после кода 6 в speaker():", err)
								break
							}
							err = c.WriteMessage(1, out)
							if err != nil {
								log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщений после кода 6 в speaker():", err)
								break
							}
						}
					} else if mess.Code == 4 { //Запрос файл по хешу имени
						log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Запрошен файл", mess.Text)
						sendFile(mess.Text, chatID, c)
						continue
					} else if mess.Code == 5 { //Запрос на смену пароля
						err := ExecuteQuery("INSERT INTO chats (id, password) VALUES (?, ?)", chatID, mess.Text)
						if err != nil {
							log.Panic(err)
							mess.Code = 0
							mess.Text = "Ошибка. Пароль не установлен."
							mess.Time = time.Now().Format(timeLayout)
							log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Ошибка смены пароля:", err)
						} else {
							log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Установлен новый пароль -", mess.Text)
							out, err := json.Marshal(Message{1, chatID, time.Now().Format(timeLayout)})
							if err != nil {
								log.Println("Ошибка создания JSON при смене пароля в чате:", chatID, err)
								break
							}
							users.mux.Lock()
							for i := 0; i < len(users.u[chatID]); i++ {
								err = users.u[chatID][i].c.WriteMessage(1, out)
								if err != nil {
									log.Println("Клиент:", users.u[chatID][i].c.RemoteAddr().String()+", чат:", chatID+". При смене пароля произошла ошибка:", err)
								}
							}
							users.mux.Unlock()
							continue
						}
					} else { //Обычное текстовое сообщение
						date, err := time.Parse(timeLayout, mess.Time)
						if err != nil {
							log.Panic(err)
						}
						save(chatID, false, mess.Text, date, nil)
						log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Сообщение:", mess.Text)
						continue
					}
				} else {
					log.Println("Клиент:", r.RemoteAddr, "был подключен без чата.")
					break
				}
			} else if chatID != "None" && messType == 2 {
				if len(in) > maxSizeInBytes {
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Файл "+string([]byte(AFN)[:len([]byte(AFN))-33])+" превышает допустимый размер")
					AFN = ""
					AFT = ""
					break
				}
				if AFN != "" && AFT != "" {
					ctime, err := time.Parse(timeLayout, AFT)
					if err != nil {
						log.Panic(err)
					}
					save(chatID, true, AFN, ctime, in)
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Файл:", AFN)
					AFN = ""
					AFT = ""
					continue
				} else {
					messType = 1
					mess.Code = 0
					mess.Text = "Пришёл файл без имени, повторите отправку."
					mess.Time = time.Now().Format(timeLayout)
					log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Пришёл файл, хотя не ожидался.")
				}
			} else {
				log.Println("Клиент:", r.RemoteAddr, "попытался отправить байты без чата.")
				break
			}
			out, err := json.Marshal(mess)
			if err != nil {
				log.Panic(err)
			}
			err = c.WriteMessage(messType, out)
			if err != nil {
				log.Println("Клиент:", r.RemoteAddr+", чат:", chatID+". Возможная ошибка отправки сообщения в повторителе speaker():", err)
				break
			}
		}


		func makeUser(с *websocket.Conn, i string) (newu user) {
			newu.mux.Lock()
			newu.c = с
			newu.i = i
			newu.mux.Unlock()
			return newu
		}
		
		func ADD(self *user) {
			users.mux.Lock()
			self.mux.Lock()
			users.u[(*self).i] = append(users.u[(*self).i], (*self))
			self.mux.Unlock()
			users.mux.Unlock()
		}
		
		func DEL(id string, ip string) {
			users.mux.Lock()
			for i := 0; i < len(users.u[id]); i++ {
				users.u[id][i].mux.Lock()
				if users.u[id][i].c.RemoteAddr().String() == ip {
					users.u[id] = append(users.u[id][:i], users.u[id][i+1:]...)
				}
				users.u[id][i].mux.Unlock()
			}
			if len(users.u[id]) == 0 {
				delete(users.u, id)
			}
			users.mux.Unlock()
		}
		
		func getHash(in []byte) string {
			hasher := sha1.New()
			hasher.Write(in)
			sha := base64.URLEncoding.EncodeToString(hasher.Sum(nil))
			return sha
		}
		
		func sendFile(name string, id string, c *websocket.Conn) {
			var file []byte
			db.mux.Lock()
			err := db.session.Query("SELECT seconddata FROM \""+id+"\" WHERE type = true AND mess=? LIMIT 1 ALLOW FILTERING", name).Scan(&file)
			db.mux.Unlock()
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
			db.mux.Lock()
			res := db.session.Query("SELECT mess FROM \""+id+"\" WHERE seconddata=? LIMIT 1 ALLOW FILTERING", file).WithContext(ctx).Iter().Scanner()
			db.mux.Unlock()
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
				users.mux.Lock()
				for i := 0; i < len(users.u[chatID]); i++ {
					users.u[chatID][i].mux.Lock()
					out, err := json.Marshal(Message{0, "Ошибка сохранения сообщения" + mess, date.Format(timeLayout)})
					if err != nil {
						log.Println("Клиент:", users.u[chatID][i].c.RemoteAddr().String()+", чат:", chatID+". Возможная ошибка отправки сообщения об ошибке в messageSaver():", err)
						break
					}
					err = users.u[chatID][i].c.WriteMessage(1, out)
					if err != nil {
						log.Println("Клиент:", users.u[chatID][i].c.RemoteAddr().String()+", чат:", chatID+". Возможная ошибка отправки сообщения об ошибке в messageSaver():", err)
					}
					users.u[chatID][i].mux.Unlock()
				}
				users.mux.Unlock()
				log.Panic(err)
			} else {
				if mtype {
					save(chatID, false, "2"+string([]byte(mess)[:len([]byte(mess))-33])+""+hMess, date, []byte{})
				} else {
					users.mux.Lock()
					for i := 0; i < len(users.u[chatID]); i++ {
						users.u[chatID][i].mux.Lock()
						out, err := json.Marshal(Message{0, hMess, date.Format(timeLayout)})
						if err != nil {
							log.Println("Ошибка создания JSON при смене пароля в чате:", chatID, err)
							break
						}
						err = users.u[chatID][i].c.WriteMessage(1, out)
						if err != nil {
							log.Println("Клиент:", users.u[chatID][i].c.RemoteAddr().String()+", чат:", chatID+". Возможная ошибка отправки сообщения в messageSaver():", err)
						}
						users.u[chatID][i].mux.Unlock()
					}
					users.mux.Unlock()
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
			CREATE TABLE IF NOT EXISTS messes (chatID VARCHAR, type BOOLEAN, mess VARCHAR, date TIMESTAMP, seconddata BLOB, PRIMARY KEY ((chatID),date)) WITH CLUSTERING ORDER BY(date DESC)
			if err != nil {
				log.Println(err)
			}
			return id
		}
		
		func checkChatExist(lid string) bool {
			db.mux.Lock()
			res := db.session.Query("SELECT id FROM chats WHERE id=?", lid).WithContext(ctx).Iter().Scanner()
			db.mux.Unlock()
			return res.Next()
		}
		
		func checkChatPass(lid string) (pass string) {
			db.mux.Lock()
			err := db.session.Query("SELECT password FROM chats WHERE id=?", lid).WithContext(ctx).Consistency(gocql.One).Scan(&pass)
			db.mux.Unlock()
			if err != nil {
				log.Panic(err)
			}
			return
		}
		
		
		
		func checkMessages(lid string) [][]string {
			db.mux.Lock()
			res := db.session.Query("SELECT mess, date FROM \"" + lid + "\" WHERE type = false LIMIT 50").WithContext(ctx).Iter().Scanner()
			db.mux.Unlock()
			masmess := [][]string{}
			for res.Next() {
				mess := ""
				var ctime time.Time
				if err := res.Scan(&mess, &ctime); err != nil {
					log.Println(err)
					return [][]string{{"Ошибка загрузки данных чата, повторите попытку позже. Если ошибка сохраниться - обратитесь в техническую поддержку.", time.Now().Format(timeLayout)}}
				}
				masmess = append(masmess, []string{mess, ctime.Format(timeLayout)})
			}
			for i, j := 0, len(masmess)-1; i < j; i, j = i+1, j-1 {
				masmess[i], masmess[j] = masmess[j], masmess[i]
			}
			return masmess
		}
		
		func redirectToHTTPS(w http.ResponseWriter, r *http.Request) {
			log.Println("Redirecting", r.RemoteAddr, "to", "https://"+r.Host+":"+HTTPSport+r.RequestURI)
			http.Redirect(w, r, "https://"+r.Host+":"+HTTPSport+r.RequestURI, http.StatusMovedPermanently)
		}
		