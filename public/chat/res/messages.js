//======= VARS AND CONSTS AND CONFIG =======\\

const reader = new FileReader();

let socket = new WebSocket("wss://" + document.location.host + "/speaker");

let qrelement = document.getElementById('qr');
let inFiles = document.getElementById("inFiles");
let text = document.getElementById("text");
let files = document.getElementById("files");
let messages = document.getElementById("messages-container");
let setPassword = document.getElementById("set-password");
let errorpage = document.getElementById("errorpage");
let theerror = document.getElementById("theerror");
let mainpage = document.getElementById("mainpage");
let id = (document.location + "").split('?')[1];
let idName = document.getElementById("id-name");
let awaitingFileName = "";

//================== CODE ==================\\

// WebSocket открыт
socket.onopen = () => {
	console.log("Подключение успешно");
	if (id != undefined && id != "undefined" && id != "EOF"){
		socket.send(JSON.stringify({ code: 0, text: id, time: goodDate(new Date()) }));
		console.log(JSON.stringify({ code: 0, text: id, time: goodDate(new Date()) }));
		return;
	} else if (id != "EOF"){
		socket.send(JSON.stringify({ code: 0, text: "", time: goodDate(new Date()) }));
		console.log(JSON.stringify({ code: 0, text: "", time: goodDate(new Date()) }));
		return;
	}
	resetID();
}

// Новый ID без перезагрузки
function resetID(){
	history.pushState("", "Fast Chat", "./?" + id);
	if (id != undefined && id != "undefined") {
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
	} else {
		mainpage.style.display = "none";
	}
}

// WebSocket закрыт
socket.onclose = (event) => {
	console.log("Отключение: ", event);
	addMessage({code: 1, text: "Ошибка подключения, переподключение..", time: goodDate(new Date())});
	setTimeout(function () {
		open("./?" + id, "_self");
	}, 2500);
}

// Ошибка WebSocket
socket.onerror = (error) => {
	addMessage(1, "Ошибка подключения, переподключение..", "00:00");
	setTimeout(function () {
		open("./?" + id, "_self");
	}, 2500);
	console.log("Ошибка: ", error);
}

let testmess

// Новое сообщение по WebSocket - переписать!
socket.onmessage = (msg) => {
	console.log("Сообщение от сервера")
	if (typeof(msg.data) == "string"){
		mess = JSON.parse(msg.data);
		console.log(mess);
		testmess = mess
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
				break;
			case 5:
				console.log("here");
				theerror.innerHTML = `
					<p>Для доступа к чату введите пароль и нажмите на кнопку "Открыть"</p>
					<div id="password" contenteditable=""></div>
					<button id="check-password" onclick="checkPassword();">Открыть</button>
				`;
				mainpage.style.display = "none";
				errorpage.style.display = "flex";
				idName.innerText = "403";
				break;
			case 6:
				console.log("Ожидается файл", mess.text);
				awaitingFileName = mess.text;
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
		colorLight: '#ffffff00',
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
			all.appendChild(par);
		}
		finalText = all.innerHTML;
	} else if (inpMess.code == 2) {
		let a = document.createElement("a");
		a.setAttribute("id", "file-url");
		a.setAttribute("onclick", "socket.send(JSON.stringify({ code: 6, text: '" + inpMess.text + "', time: '" + inpMess.time + "' }));");
		a.setAttribute("download", inpMess.text);
		a.innerText = inpMess.text;
		finalText = a.outerHTML;
	}
	let finaldiv = document.createElement("div");
	finaldiv.className = "message";
	finaldiv.dataset.gd = inpMess.time;
	finaldiv.innerHTML = '<div class="message-text">' + finalText + '</div><div class="message-time">' + stringTime + '</div>';
	let allMessages = messages.getElementsByClassName("message");
	if (allMessages.length > 0) {
		for (let i = 0; i < allMessages.length; i++){
			if (new Date(allMessages[i].dataset.gd) > curDate){
				console.log("here 1");
				console.log(finaldiv, "inserted after", allMessages[i])
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

// Проверка пароля
function checkPassword() {
	socket.send(JSON.stringify({ code: 5, text: id, time: document.getElementById("password").innerText }));
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

// Отправка всех сообщение
function send() {
	check = text.innerText.replace(/[\n\r]+/g, '').trim();
	if (check != "") {
		let gd = goodDate(new Date());
		socket.send(JSON.stringify({ code: 1, text: text.innerText, time: gd }));
		console.log(JSON.stringify({ code: 1, text: text.innerText, time: gd }));
	}

	function readFile(i) {
		let file = inFiles.files[i];
		let gd = goodDate(new Date());
		if (file.size < 10485760) {
			addMessage({ code: 1, text:  "Файл " + file.name + " отправляется, не закрывайте страницу, пока не появится сообщение с его именем", time: gd });
			socket.send(JSON.stringify({ code: 2, text: file.name, time: gd }));
			reader.readAsArrayBuffer(file);
			reader.onload = function(e) {
				socket.send(e.target.result);
				if (i<inFiles.files.length){
					readFile(i+1);
				}
			}
		} else {
			addMessage({code: 0, text: "Ошибка отправки файла, превышен максимальный размер в 10 МБайт", time: gd});
		}
	}

	if (inFiles.files.length > 0){
		readFile(0);
	}

	setTimeout(() => {
		text.innerHTML = "";
		files.innerHTML = "";
		inFiles.value = "";
		window.body.scrollTo(0, 0);
	}, 50);
}

// Для обновления нстроек
function applySettings() {
	socket.send(JSON.stringify({ code: 3, text: setPassword.innerText, time: goodDate(new Date())})); // Новый пароль
}

// Отправка сообщения на Enter
document.addEventListener('keydown', function (e) {
	if (e.key === "Enter") {
		send();
	}
	//console.log(e.keyCode);
});

// Проверка на наличие более старых сообщений
messages.addEventListener("scroll", function () {
	if (messages.childElementCount > 0 && messages.scrollTop == 0) {
		socket.send(JSON.stringify({ code: 4, text: "", time: messages.getElementsByClassName("message")[0].dataset.gd}));
	}
});