//======= VARS AND CONSTS AND CONFIG =======\\

const reader = new FileReader();
const urlregex = /((([a-zA-Z0-9]+:){1})([a-zA-Z0-9\-\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]+(\.[a-zA-Z0-9\-\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]+)+)([\?#]{1}[a-zA-Z0-9\-\.\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]*)?)/g;
const imgFormat = /\.(jpeg|jpg|jfif|jpe|dib|rle|gif|png|apng|bmp)$/i;

let socket = window.location.protocol == 'https:' ? new WebSocket("wss://" + document.location.host + "/speaker") : new WebSocket("ws://" + document.location.host + "/speaker");

if (window.location.protocol != 'https:'){
	window.onload = function(){
		addMessage({code: 1, text: "ВЫ ИСПОЛЬЗУЕТЕ НЕЗАЩИЩЁННУЮ ВЕРСИЮ FAST CHAT!\nПереходите на защищённую: https://fastchat.space/chat/", tag: "WARNING", time: goodDate(new Date())});
	};
}

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
				lastKnownTheme = mess.text;
				setTheme(mess.text);
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