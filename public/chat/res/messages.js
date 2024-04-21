//======= VARS AND CONSTS AND CONFIG =======\\

const reader = new FileReader();
const urlregex = /((([a-zA-Z0-9]+:){1})([a-zA-Z0-9\-\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]+(\.[a-zA-Z0-9\-\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]+)+)([\?#]{1}[a-zA-Z0-9\-\.\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]*)?)/g;
const imgFormat = /\.(jpeg|jpg|jfif|jpe|dib|rle|gif|png|apng|bmp|ico)$/i;

let socket;

if (window.location.protocol == 'https:'){
	socket = new WebSocket("wss://" + document.location.host + "/speaker");
} else {
	socket = new WebSocket("ws://" + document.location.host + "/speaker");
	window.onload = function(){
		addMessage({code: 1, text: "ВЫ ИСПОЛЬЗУЕТЕ НЕЗАЩИЩЁННУЮ ВЕРСИЮ FAST CHAT!\nПереходите на защищённую: https://fastchat.space/chat/", tag: "WARNING", time: goodDate(new Date())})
	};
}

let qrelement = document.getElementById('qr');
let inFiles = document.getElementById("inFiles");
let text = document.getElementById("text");
let files = document.getElementById("files");
let messages = document.getElementById("messages-container");
let setPassword = document.getElementById("set-password");
let password = document.getElementById("password");
let setTag = document.getElementById("set-tag");
let errorpage = document.getElementById("errorpage");
let theerror = document.getElementById("theerror");
let mainpage = document.getElementById("mainpage");
let useForReadElem = document.getElementById("useForRead")
let id = (document.location.href).split('?')[1];
let idName = document.getElementById("id-name");
let inForm = document.getElementById("in");
let in1 = document.getElementById("in1");
let in2 = document.getElementById("in2");
let cpmd = document.getElementById("close-password-menu-div");
let passwordMenu = document.getElementById("password-menu");
let changeTheme = document.getElementById("change-theme");
let passwordEntered = false;
let awaitingFileName = undefined;
let nextPic = undefined;
let lastKnownPassword = "";
let lastKnownUFR = true;
let lastKnownTag = "";
let useForRead = true;
let lastKnownTheme = '0';
let needToScroll = true;
let lastMessage;
let themeSet = false;

//================== CODE ==================\\

document.title = "Fast Chat - Создание чата...";

// WebSocket открыт
socket.onopen = () => {
	console.log("Подключение успешно");
	if (id != undefined && id != "undefined" && id != "EOF"){
		socket.send(JSON.stringify({ code: 0, text: id, tag: "", time: goodDate(new Date()) }));
		return;
	} else if (id != "EOF"){
		socket.send(JSON.stringify({ code: 0, text: "", tag: "", time: goodDate(new Date()) }));
		return;
	}
	resetID();
}

// Новый ID без перезагрузки
function resetID(){
	history.pushState("", "Fast Chat", "./?" + id);
	document.title = "Fast Chat - "+id.toUpperCase();
	if (id != undefined && id != "undefined") {
		if (id == "EOF") {
			mainpage.style.display = "none";
			passwordMenu.style.display = "none";
			errorpage.style.display = "flex";
			idName.innerText = "400";
		} else {
			mainpage.style.display = "flex";
			passwordMenu.style.display = "none";
			errorpage.style.display = "none";
			idName.innerText = "ID: " + id.toUpperCase();
			makeQR();
		}
	} else {
		mainpage.style.display = "none";
	}
}

// WebSocket закрыт
socket.onclose = (event) => {
	console.log("Отключение: ", event);
	addMessage({code: 1, text: "Ошибка подключения, переподключение..", tag: "", time: goodDate(new Date())});
	setTimeout(function () {
		open("./?" + id, "_self");
	}, 2500);
}

// Ошибка WebSocket
socket.onerror = (error) => {
	addMessage({code: 1, text: "Ошибка подключения, переподключение..", tag: "", time: goodDate(new Date())});
	setTimeout(function () {
		open("./?" + id, "_self");
	}, 2500);
	console.log("Ошибка: ", error);
}

idName.innerHTML = "404";

// Новое сообщение по WebSocket
socket.addEventListener("message", (msg) => {
	console.log("Сообщение от сервера")
	if (typeof(msg.data) == "string"){
		mess = JSON.parse(msg.data);
		switch (mess.code){
			case 0:
				open("./?" + mess.text, "_self");
				break;
			case 1:
			case 2:
				addMessage(mess);
				break;
			case 3:
				id = mess.text;
				resetID();
				if (passwordEntered){
					changeInContent(1);
				} else {
					lastKnownUFR = (mess.tag === 'false');
					useForReadElem.checked = lastKnownUFR;
					useForRead = lastKnownUFR;
					if (lastKnownUFR) {
						changeInContent(1);
					} else {
						changeInContent(2);
					}
				}
				if (!themeSet) {
					console.log(true);
					switch (localStorage.getItem("theme")) {
						case "light":
							localStorage.setItem("theme", "light");
							lastKnownTheme = 0;
							setLightTheme();
							break;
						case "dark":
							localStorage.setItem("theme", "dark");
							lastKnownTheme = 1;
							setDarkTheme();
							break;
					}
					socket.send(JSON.stringify({ code: 7, text: lastKnownTheme.toString(), tag: "", time: goodDate(new Date()) }));
				}
				break;
			case 5:
				passwordEntered = false;
				showPasswordForm();
				if (mess.tag == "false"){
					document.title = "Fast Chat - Для доступа к чату введите пароль";
					idName.innerText = "403";
					cpmd.style.display = "none";
				} else {
					cpmd.style.display = "flex";
				}
				break;
			case 6:
				if (mess.tag == ""){
					awaitingFileName = mess.text;
				} else {
					nextPic = mess.text;
				}
				break;
			case 7:
				themeSet = true;
				lastKnownTheme = mess.text;
				if (mess.text == "0") {
					lastKnownTheme = 0;
					setLightTheme();
				} else {
					lastKnownTheme = 1;
					setDarkTheme();
				}
				break;
		}
	} else {
		if (awaitingFileName != undefined) {
			console.log("Пришёл файл");
			let file = new File([msg.data], awaitingFileName);
			let url = URL.createObjectURL(file);
			const aTag = document.createElement("a");
			aTag.href = url;
			aTag.download = awaitingFileName;
			document.body.appendChild(aTag);
			aTag.click();
			URL.revokeObjectURL(url);
			aTag.remove();
			awaitingFileName = undefined;
		}
	}
});

// QR код
function makeQR(){
	console.log(document.URL)
	qrelement.innerHTML = "";
	const qrcode = new QRCode(qrelement, {
		text: document.URL,
		width: 1024,
		height: 1024,
		colorDark: '#000',
		colorLight: '#fff',
		correctLevel: QRCode.CorrectLevel.M
	});
}

// Добавление нового сообщения
async function addMessage(inpMess) {
	let curDate = new Date(inpMess.time);
	let stringTime = curDate.toLocaleString();
	let localNeedToScroll = true;
	let finalText = "";
	if (inpMess.code == 1) {
		let strings = inpMess.text.split("\n");
		let all = document.createElement("div");
		for (let i = 0; i < strings.length; i++) {
			let par = document.createElement("p");
			par.innerText = strings[i];
			par.innerHTML = wrapLinks(par.innerHTML);
			all.appendChild(par);
		}
		finalText = all.innerHTML;
	} else if (inpMess.code == 2) {
		let a = document.createElement("a");
		a.setAttribute("class", "file-url");
		a.setAttribute("onclick", `socket.send(JSON.stringify({ code: 6, text: "${inpMess.text}", tag: "", time: "${inpMess.time}" }));`);
		a.innerText = inpMess.text;
		if (imgFormat.test(inpMess.text)){
			localNeedToScroll = false;
			await new Promise(resolve => {
				const messageHandler = (waitingMess) => {
					if (typeof(waitingMess.data) != "string" && awaitingFileName == undefined && nextPic == inpMess.text) {
						nextPic = undefined;
						let picture = new File([waitingMess.data], inpMess.text);
						let picurl = URL.createObjectURL(picture);
						let picContainer = document.createElement("div");
						picContainer.setAttribute("class", "message-img-container");
						let picElem = document.createElement("img");
						picElem.decoding = "async";
						picElem.setAttribute("class", "message-img");
						picElem.src = picurl;
						picContainer.appendChild(picElem);
						socket.removeEventListener("message", messageHandler);
						resolve(picContainer.outerHTML);
					}
				};
				socket.addEventListener("message", messageHandler);
				socket.send(JSON.stringify({ code: 6, text: inpMess.text, tag: "place", time: inpMess.time }));
			}).then(result => {
				a.innerHTML = result + a.innerHTML;
			});			  
		}
		let allMessages = messages.children;
		for (let i = allMessages.length - 1; i >= 0; i--){
			if (allMessages[i].dataset.gd === inpMess.time && "Файл " + inpMess.text + " отправляется, не закрывайте страницу, пока не появится сообщение с его именем" === allMessages[i].getElementsByClassName("message-text")[0].innerText){
				allMessages[i].remove()
				break;
			}
		}
		finalText = a.outerHTML;
	}
	let finaldiv = document.createElement("div");
	finaldiv.className = "message";
	finaldiv.dataset.gd = inpMess.time;
	finaldiv.innerHTML = '<div class="message-text">' + finalText + '</div><div class="message-bottom"><div class="message-tag">' + inpMess.tag + '</div><div class="message-time">' + stringTime + '</div></div>';
	let allMessages = messages.children;
	if (allMessages.length > 0) {
		for (let i = 0; i < allMessages.length; i++){
			if (new Date(allMessages[i].dataset.gd) > curDate){
				messages.insertBefore(finaldiv, allMessages[i]);
				return;
			}
			messages.append(finaldiv);
		}
	} else {
		messages.append(finaldiv);
	}
	if (needToScroll && localNeedToScroll && (lastMessage==undefined || curDate-lastMessage>=500)){
		setTimeout(() => {
			messages.children[messages.childElementCount-1].scrollIntoView(true);
		}, 50);
	}
	if (lastMessage == undefined || lastMessage < curDate){
		lastMessage = curDate;
	}
}

// Показать форму ввода пароля
function showPasswordForm(){
	mainpage.style.display = "none";
	passwordMenu.style.display = "flex";
}

// Изменить вид поля ввода
function changeInContent(type){
	switch(type){
		case 1:
			in2.style.display = "none";
			in1.style.display = "contents";
			break
		case 2:
			in1.style.display = "none";
			in2.style.display = "contents";
			break
	}
}

// Проверка пароля
function checkPassword() {
	passwordEntered = true;
	let pass = password.value;
	lastKnownPassword = pass;
	setPassword.value = pass;
	let now = goodDate(new Date());
	getHash(pass).then(
		result => {return getHash(now+result);}
	).then(
		result => {socket.send(JSON.stringify({ code: 5, text: id, tag: result, time: now }));}
	).catch(
		error => {console.log(error);}
	);
}

// Прикреплён новый файл
inFiles.onchange = () => {
	files.innerHTML = "";
	for (let i = 0; i < inFiles.files.length; i++) {
		files.innerHTML += '<a contenteditable="false" data-file = ' + inFiles.files[i] + '>' + inFiles.files[i].name + '</a> ';
	}
}

// Форматирование даты
function goodDate(date) {
	return date.getUTCFullYear() + "-" +
		("0" + (date.getUTCMonth() + 1)).slice(-2) + "-" +
		("0" + date.getUTCDate()).slice(-2) + "T" +
		("0" + date.getUTCHours()).slice(-2) + ":" +
		("0" + date.getUTCMinutes()).slice(-2) + ":" +
		("0" + date.getUTCSeconds()).slice(-2) + "." +
		(date.getUTCMilliseconds()+"00").slice(-3) + "+0000";
}

//Получение хэша
async function getHash(inp) {
	const data = new TextEncoder().encode(inp);
	const digest = await crypto.subtle.digest('SHA-256', data);
	const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
	return hashBase64.replaceAll("+", "-").replaceAll("/", "_");
}

// Отправка всех сообщение
function send() {
	check = text.innerText.replace(/[\n\r]+/g, '').trim();
	if (check != "") {
		let gd = goodDate(new Date());
		socket.send(JSON.stringify({ code: 1, text: text.innerText, tag: lastKnownTag, time: gd }));
	}

	function readFile(i) {
		let file = inFiles.files[i];
		let gd = goodDate(new Date());
		if (file.size < 10485760) {
			addMessage({ code: 1, text:  "Файл " + file.name + " отправляется, не закрывайте страницу, пока не появится сообщение с его именем", tag:"", time: gd });
			socket.send(JSON.stringify({ code: 2, text: file.name, tag: lastKnownTag, time: gd }));
			reader.readAsArrayBuffer(file);
			reader.onload = function(e) {
				socket.send(e.target.result);
				if (i<inFiles.files.length-1){
					setTimeout(() => {
						readFile(i+1);
					}, 100);
				} else {
					setTimeout(() => {
						text.innerHTML = "";
						files.innerHTML = "";
						inFiles.value = "";
						window.body.scrollTo(0, 0);
					}, 50);
				}
			}
		} else {
			addMessage({code: 1, text: "Ошибка отправки файла, превышен максимальный размер в 10 МБайт", tag: "", time: gd});
		}
	}

	if (inFiles.files.length > 0){
		readFile(0);
	} else {
		setTimeout(() => {
			text.innerHTML = "";
			files.innerHTML = "";
			inFiles.value = "";
			window.body.scrollTo(0, 0);
		}, 50);
	}
}

// Для обновления нстроек
function applySettings() {
	console.log(setPassword.value != "" && ( lastKnownPassword != setPassword.value || lastKnownUFR != useForRead))
	if ( setPassword.value != "" && ( lastKnownPassword != setPassword.value || lastKnownUFR != useForRead )) { // Новый пароль
		lastKnownPassword = setPassword.value;
		lastKnownUFR = useForRead;
		getHash(lastKnownPassword).then(
			result => {socket.send(JSON.stringify({ code: 3, text: result, tag: useForRead.toString(), time: goodDate(new Date())}));}
		).catch(
			error => {console.log(error);}
		)
	} else if ( setPassword.value == "" && lastKnownPassword != setPassword.value ) {
		lastKnownPassword = "";
		lastKnownUFR = true;
		useForReadElem.checked = true;
		socket.send(JSON.stringify({ code: 3, text: "", tag: "", time: goodDate(new Date())}));
	}
	if (lastKnownTheme != changeTheme.dataset.theme) {
		lastKnownTheme = changeTheme.dataset.theme;
		socket.send(JSON.stringify({ code: 7, text: lastKnownTheme, tag: "", time: goodDate(new Date())}));
	}
	if (lastKnownTag != setTag.value) { // Новый тэг
		lastKnownTag = setTag.value;
	}
}

// Обёртка ссылок
function wrapLinks(str) {
	return str.replace(urlregex, "<a class='file-url' target='_blank' href='$1'>$1</a>");
}

// Устанавливает тему
// function setTheme(num) {
// 	if (num >= themes.length) {
// 		num %= themes.length
// 	}
// 	changeTheme.dataset.theme = num;
// 	for (let i = 0; i < themesVars.length; i++) {
// 		document.documentElement.style.setProperty(themesVars[i], themes[num][i]);
// 	}
// }

function changeThemeFunction() {
	if (document.body.classList.contains("darkTheme")) {
		setLightTheme()
	} else {
		setDarkTheme()
	}
}

function setDarkTheme() {
	document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')[0].setAttribute('href', '../../res/dark_favicon.png');
	document.body.classList.add("darkTheme");
	//themeControllerImg.src = "./res/light.svg";
	changeTheme.dataset.theme = 1;
	console.log("Установлена тёмная тема");
}

function setLightTheme() {
	document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')[0].setAttribute('href', '../../res/favicon.png');
	document.body.classList.remove("darkTheme");
	//themeControllerImg.src = "./res/dark.svg";
	changeTheme.dataset.theme = 0;
	console.log("Установлена светлая тема");
}

// Отправка сообщения на Enter
document.addEventListener('keydown', function (e) {
	if (!e.shiftKey && e.key === "Enter") {
		send();
	}
	//console.log(e.keyCode);
});

// Проверка позиции в messages
messages.addEventListener("scroll", function () {
	if (messages.childElementCount > 0 && messages.scrollTop == 0) {
		socket.send(JSON.stringify({ code: 4, text: "", tag: "", time: messages.getElementsByClassName("message")[0].dataset.gd}));
	}
	if ((messages.scrollHeight - messages.clientHeight) - 10 <= messages.scrollTop) {
        needToScroll = true;
    } else {
		needToScroll = false;
	}
});

// Меняет режим использования пароля
useForReadElem.onchange = function () {
    useForRead = useForReadElem.checked;
};