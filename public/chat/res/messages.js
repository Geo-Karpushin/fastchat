//======= VARS AND CONSTS AND CONFIG =======\\

const reader = new FileReader();
const urlregex = /((([a-zA-Z0-9]+:){1})([a-zA-Z0-9\-\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]+(\.[a-zA-Z0-9\-\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]+)+)([\?#]{1}[a-zA-Z0-9\-\.\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]*)?)/g;

let socket;

if (window.location.protocol == 'https:'){
	socket = new WebSocket("wss://" + document.location.host + "/speaker");
} else {
	socket = new WebSocket("ws://" + document.location.host + "/speaker");
	addMessage({code: 1, text: "ВЫ ИСПОЛЬЗУЕТЕ НЕЗАЩИЩЁННУЮ ВЕРСИЮ FAST CHAT!\nПереходите на защищённую: https://fastchat.space/chat/", tag: "", time: goodDate(new Date())});
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
let awaitingFileName = "";
let lastKnownPassword = "";
let lastKnownUFR = true;
let lastKnownTag = "";
let useForRead = true;
let lastKnownTheme = '0';

let themesVars = [
	'--dark-color',
	'--main-color',
	'--pre-bg',
	'--text',
	'--text-hover',
	'--url-color',
	'--very-dark',
	'--menu-color',
	'--bg-1',
	'--bg-2',
	'--bg-3',
	'--bg-4',
	'--close-color'
]
let themes = [
	[
		'19, 26, 6',
		'51, 62, 11',
		'95, 105, 85',
		'210, 210, 210',
		'255, 255, 255',
		'135, 206, 250',
		'0, 0, 0',
		'177, 199, 85',
		'#1F6521',
		'#53900F',
		'#A4A71E',
		'#D6CE15',
		'#ff0000a3'
	],
	[ 
		'219, 226, 206',
		'81, 92, 41',
		'95, 105, 85',
		'205, 205, 205',
		'255, 255, 255',
		'135, 206, 250',
		'100, 100, 100',
		'26, 46, 27',
		'#103811',
		'#243d07',
		'#38390b',
		'#3f3d04',
		'#ff0000a3'
	]
];

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
			idName.innerText = "ID: " + id;
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
socket.onmessage = (msg) => {
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
				awaitingFileName = mess.text;
				break;
			case 7:
				lastKnownTheme = mess.text;
				setTheme(mess.text);
				break;
		}
	} else {
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
		awaitingFileName = '';
	}
}

// QR код
function makeQR(){
	qrelement.innerHTML = "";
	const qrcode = new QRCode(qrelement, {
		text: document.URL,
		width: 128,
		height: 128,
		colorDark: '#333e0b',
		colorLight: '#d3d3d3',
		correctLevel: QRCode.CorrectLevel.H
	});
}

// Добавление нового сообщения
function addMessage(inpMess) {
	let curDate = new Date(inpMess.time);
	let stringTime = curDate.toLocaleString();
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
		a.setAttribute("id", "file-url");
		a.setAttribute("onclick", "socket.send(JSON.stringify({ code: 6, text: '" + inpMess.text + "', tag: '" + inpMess.tag + "', time: '" + inpMess.time + "' }));");
		a.innerText = inpMess.text;
		finalText = a.outerHTML;
	}
	let finaldiv = document.createElement("div");
	finaldiv.className = "message";
	finaldiv.dataset.gd = inpMess.time;
	finaldiv.innerHTML = '<div class="message-text">' + finalText + '</div><div class="message-bottom"><div class="message-tag">' + inpMess.tag + '</div><div class="message-time">' + stringTime + '</div></div>';
	let allMessages = messages.getElementsByClassName("message");
	if (allMessages.length > 0) {
		for (let i = 0; i < allMessages.length; i++){
			if (new Date(allMessages[i].dataset.gd) > curDate){
				//allMessages[i].before(finaldiv);
				messages.insertBefore(finaldiv, allMessages[i]);
				return;
			}
			messages.append(finaldiv);
		}
	} else {
		messages.append(finaldiv);
	}
	setTimeout(() => {
		messages.childNodes[messages.childElementCount].scrollIntoView(false);
	}, 50);
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
	let pass = password.innerText;
	lastKnownPassword = pass;
	setPassword.innerText = pass;
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
		files.innerHTML += '<div id="file-url" contenteditable="false" data-file = ' + inFiles.files[i] + '>' + inFiles.files[i].name + '</div>';
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
	if (lastKnownPassword != setPassword.innerText || ( setPassword.innerText != "" && lastKnownUFR != useForRead )) { // Новый пароль
		lastKnownPassword = setPassword.innerText;
		lastKnownUFR = useForRead;
		getHash(lastKnownPassword).then(
			result => {socket.send(JSON.stringify({ code: 3, text: result, tag: useForRead.toString(), time: goodDate(new Date())}));}
		).catch(
			error => {console.log(error);}
		)
	}
	if (lastKnownTheme != changeTheme.theme) {
		lastKnownTheme = changeTheme.dataset.theme;
		socket.send(JSON.stringify({ code: 7, text: lastKnownTheme, tag: "", time: goodDate(new Date())}));
	}
	if (lastKnownTag != setTag.innerText) { // Новый тэг
		lastKnownTag = setTag.innerText;
	}
}

// Обёртка ссылок
function wrapLinks(str) {
	return str.replace(urlregex, "<a id='file-url' target='_blank' href='$1'>$1</a>");
}

// Устанавливает тему
function setTheme(num) {
	if (num >= themes.length) {
		num %= themes.length
	}
	changeTheme.dataset.theme = num;
	for (let i = 0; i < themesVars.length; i++) {
		document.documentElement.style.setProperty(themesVars[i], themes[num][i]);
	}
}

// Отправка сообщения на Enter
document.addEventListener('keydown', function (e) {
	if (!e.shiftKey && e.key === "Enter") {
		send();
	}
	//console.log(e.keyCode);
});

// Проверка на наличие более старых сообщений
messages.addEventListener("scroll", function () {
	if (messages.childElementCount > 0 && messages.scrollTop == 0) {
		socket.send(JSON.stringify({ code: 4, text: "", tag: "", time: messages.getElementsByClassName("message")[0].dataset.gd}));
	}
});

useForReadElem.onchange = function () {
    useForRead = useForReadElem.checked;
};