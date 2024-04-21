let socket = new WebSocket("wss://"+document.location.host+"/speaker");
const reader = new FileReader();
let messages = document.getElementById("messages-container");
let inputData = document.getElementById("inText")
let inText = inputData.getElementsByClassName("text")[0];
let inFiles = document.getElementById("inFiles");
let thisFiles = [];
let awaitingFileName="";
let idName = document.getElementById("id-name");
let setPassword = document.getElementById("set-password");
reader.addEventListener('load', readFile);


let id=(document.location+"").split('?')[1];

socket.onopen = () => {
	console.log("Подключение успешно");
	if(id!=undefined && id!="undefined"){
		if(id=="EOF"){
			document.getElementById("mainpage").style.display="none"; 
			document.getElementById("errorpage").style.display="flex"; 
			idName.innerText = "400";
		}else{
			idName.innerText = "ID: "+id;
			const qrcode = new QRCode(document.getElementById('qr'), {
				text: document.URL,
				width: 128,
				height: 128,
				colorDark : '#333e0b',
				colorLight : '#ffffff00',
				correctLevel : QRCode.CorrectLevel.H
			});
			//document.getElementById("qr").src="http://qrcoder.ru/code/?"++"&4&0";//"http://qrcoder.ru/code/?http%3A%2F%2F185.22.233.219%3A3000%2Fchat%2F%3F"+id+"&4&0";
			socket.send("1"+id+"");
		}
	}else{
		document.getElementById("mainpage").style.display="none";
		socket.send("1");
	}
}

socket.onclose = (event) => {
	console.log("Отключение: ", event);
	addMessage(1, "Ошибка подключения, переподключение..", "00:00");
	setTimeout(function() {
		open("./?"+id, "_self");
    }, 2500);
}


socket.onerror = (error) => {
	addMessage(1, "Ошибка подключения, переподключение..", "00:00");
	setTimeout(function() {
		open("./?"+id, "_self");
    }, 2500);
	console.log("Ошибка: ", error);
}


socket.onmessage = (msg) => {
	console.log(msg.data);
	if(typeof(msg.data)=='string'){
		let code = msg.data.substring(0,2);
		if (code=="1" && msg.data!="1"){
			console.log("code 1");
			open("./?"+msg.data.split("1")[1], "_self");
		}else if (code=="2"){
			let mess=msg.data.substring(2,msg.data.length-33);
			let time=msg.data.substring(msg.data.length-33,msg.data.length);
			if (mess.includes("")){
				addMessage(3, mess, time);
			}else{
				addMessage(2, mess, time);
			}
		}else if (code=="3"){
			document.getElementById("mainpage").style.display="block"; 
			document.getElementById("errorpage").style.display="none";
			idName.innerText = "ID: "+id;
		}else if (code=="4"){
			id = msg.data.split("4")[1];
			history.pushState("", "Fast Chat", "./?"+id);
			if(id=="EOF"){
				document.getElementById("mainpage").style.display="none"; 
				document.getElementById("errorpage").style.display="flex"; 
				idName.innerText = "400";
			}else{
				document.getElementById("mainpage").style.display="block"; 
				document.getElementById("errorpage").style.display="none"; 
				idName.innerText = "ID: "+id;
				const qrcode = new QRCode(document.getElementById('qr'), {
					text: document.URL,
					width: 128,
					height: 128,
					colorDark : '#333e0b',
					colorLight : '#ffffff00',
					correctLevel : QRCode.CorrectLevel.H
				});
			}
		}else if (code=="5"){
			document.getElementById("theerror").innerHTML=`
			<div id="theerror">
				<p>Для доступа к чату введите пароль и нажмите на кнопку "Открыть"</p>
				<div id="password" contenteditable=""></div>
				<button id="check-password" onclick="checkPassword();">Открыть</button>
			</div>
			`;
			document.getElementById("mainpage").style.display="none"; 
			document.getElementById("errorpage").style.display="flex"; 
			idName.innerText = "403";
		}else if (code=="6"){
			addMessageToUp(msg.data.split("6")[1])
		}else{
			let mess=msg.data.substring(0,msg.data.length-33);
			let time=msg.data.substring(msg.data.length-33,msg.data.length);
			addMessage(1, mess, time);
		}
	}else{
		file = new File([msg.data], awaitingFileName);
		let url = URL.createObjectURL(file);
		download(url);
		addMessage(1,"Файл "+awaitingFileName+" загружается, не закрывайте страницу, пока он не появится в папке загрузок для этого браузера.", "00:00");
	}
}

function checkPassword(){
	socket.send("1"+id+""+document.getElementById("password").innerText);
}

function download(url) {
	const aTag = document.createElement("a");
	aTag.href = url;
	aTag.download = awaitingFileName;
	document.body.appendChild(aTag);
	aTag.click();
	URL.revokeObjectURL(url);
	aTag.remove();
	awaitingFileName='';
}

function convertTZ(date, tzString) {
	return new Date((typeof date === "string" ? new Date(date) : date).toLocaleString("en-US", {timeZone: tzString}));   
}

function addMessageToUp(msg) {
	type = 1
	time = "00:00"
	text = ""
	code = msg.substring(0,2);
	if (code=="2"){
		text=msg.substring(2,msg.length-33);
		time=msg.substring(msg.length-33,msg.length);
		if (text.includes("")){
			type = 3
		}else{
			type = 2
		}
	}else{
		text = msg.substring(0,msg.length-33);
		time = msg.substring(msg.length-33,msg.length);
	}
	console.log(type, text, time);
	if(time=="00:00"){
		const curDate = new Date();
		time = curDate.toLocaleString();
	}else{
		const curDate = new Date(time);
		time = curDate.toLocaleString();
	}
	if (type==1){
		temp = text.split("\n");
		text = ""
		for(let i=0; i<temp.length; i++){
			text+="<p>"+temp[i]+"</p>"
		}
		
		messages.insertAdjacentHTML("afterbegin", '<div class = "message"><div class="message-text">'+text+'</div><div class="message-time">'+time+'</div></div>');
	}else if (type==2){
		messages.insertAdjacentHTML("afterbegin", '<div class = "message"><div class="message-text"><a id="file-url" onclick="getFile(event); return false;" download="'+text+'">'+text+'</a></div><div class="message-time">'+time+'</div></div>');
		awaitingFileName="";
	}else if (type==3){
		let innerTXT=text.split("")
		messages.insertAdjacentHTML("afterbegin", '<div class = "message"><div class="message-text"><a id="file-url" onclick="getCurFile(`'+innerTXT[0]+'`,`'+innerTXT[1]+'`);" download="'+innerTXT[0]+'">'+innerTXT[0]+'</a></div><div class="message-time">'+time+'</div></div>');
		awaitingFileName="";
	}
}

function addMessage(type, text, time) {
	if(time=="00:00"){
		const curDate = new Date();
		time = curDate.toLocaleString();
	}else{
		const curDate = new Date(time);
		time = curDate.toLocaleString();
	}
	if (type==1){
		temp = text.split("\n");
		text = document.createElement("div");
		for(let i=0; i<temp.length; i++){
			let cp = document.createElement("p");
			cp.innerText = temp[i];
			text.appendChild(cp);
		}
		/*
		let div = document.createElement("div");
		div.className = "message";
		let mte = document.createElement("div");
		mte.className = "message-text";
		mte.innerText = text;
		let mti = document.createElement("div");
		mti.className = "message-time";
		mti.innerText = time;
		div.appendChild(mte);
		div.appendChild(mti);
		messages.appendChild(div);
		*/
		messages.innerHTML += '<div class = "message"><div class="message-text">'+text.innerHTML+'</div><div class="message-time">'+time+'</div></div>';
	}else if (type==2){
		a = document.createElement("a");
		a.setAttribute("id", "file-url");
		a.setAttribute("onclick", "getFile(event); return false;");
		a.setAttribute("download", text);
		a.innerText = text;
		messages.innerHTML += '<div class = "message"><div class="message-text">'+a.outerHTML+'</div><div class="message-time">'+time+'</div></div>';
		awaitingFileName="";
	}else if (type==3){
		let innerTXT=text.split("");
		a = document.createElement("a");
		a.setAttribute("id", "file-url");
		a.setAttribute("onclick", "getCurFile('"+innerTXT[0]+"','"+innerTXT[1]+"');");
		a.setAttribute("download", innerTXT[0]);
		a.innerText = innerTXT[0];
		messages.innerHTML += '<div class = "message"><div class="message-text">'+a.outerHTML+'</div><div class="message-time">'+time+'</div></div>';
		awaitingFileName="";
	}
	setTimeout(() => {
		messages.childNodes[messages.childElementCount].scrollIntoView(false);
	}, 50);
}

function goodDate(date){
	return date.getUTCFullYear() + "-" +
    ("0" + (date.getUTCMonth()+1)).slice(-2) + "-" +
    ("0" + date.getUTCDate()).slice(-2) + " " +
    ("0" + date.getUTCHours()).slice(-2) + ":" +
    ("0" + date.getUTCMinutes()).slice(-2) + ":" +
    ("0" + date.getUTCSeconds()).slice(-2) + "." +
	("00" + date.getUTCMilliseconds()).slice(-3) + " +0000 UTC";
	//date.getUTCFullYear()+("0" + (date.getUTCMonth() + 1)).slice(-2)+String(date.getUTCDate()).padStart(2, '0')+("0" + (date.getUTCHours())).slice(-2)+("0" + (date.getUTCMinutes())).slice(-2)+("0" + (date.getUTCSeconds())).slice(-2);
}

function getFile(event){
	let ctime = event.target.parentNode.parentNode.getElementsByClassName("message-time")[0].innerText
	let cDate = new Date(ctime.substring(6,10)+"-"+ctime.substring(3,5)+"-"+ctime.substring(0,2)+"T"+ctime.substring(12))
	socket.send("3"+event.target.innerText+goodDate(cDate));
	awaitingFileName=event.target.innerText
}

function getCurFile(name,hash){
	console.log("4"+hash);
	socket.send("4"+hash);
	awaitingFileName=name
}

function helpRead() {
	if(reader.readyState!=1 && thisFiles.length!=0){
		const curDate = new Date();
		let gd=goodDate(curDate)
		console.log("File: ");
		console.log(thisFiles[thisFiles.length-1]);
		socket.send("2"+thisFiles[thisFiles.length-1].name+gd);
		reader.readAsArrayBuffer(thisFiles[thisFiles.length-1]);
		thisFiles.pop();
	}else if(reader.readyState==1){
		helpRead();
	}
}

function readFile(event) {
	console.log(event);
	socket.send(event.target.result);
	helpRead();
}

function sendFiles(){
	for(let i=0; i<inFiles.files.length; i++){
		if(inFiles.files[i].size<10485760){
			thisFiles.push(inFiles.files[i]);
		}else{
			addMessage(1, "Ошибка отправки файла, превышен максимальный размер в 10 МБайт", "00:00");
		}
	}
	helpRead();
	inFiles.value=""
}

function helpRead() {
	if(reader.readyState!=1 && thisFiles.length!=0)
	{
		const curDate = new Date();
		let gd=goodDate(curDate)
		let tname=thisFiles[thisFiles.length-1].name;
		console.log("File: ");
		addMessage(1,"Файл "+tname+" отправляется, не закрывайте страницу, пока не появится сообщение с его именем", "00:00", false);
		console.log(thisFiles[thisFiles.length-1]);
		socket.send("2"+tname+gd);
		reader.readAsArrayBuffer(thisFiles[thisFiles.length-1]);
		thisFiles.pop();
	}else if(reader.readyState==1){
		helpRead();
	}
}

function readFile(event) {
	console.log(event);
	socket.send(event.target.result);
	helpRead();
}

function send(){
	check=inText.innerText.replace(/[\n\r]+/g, '').trim();
	if(check!=""){
		console.log(inText.innerText);
		if(inText.innerText[0]==""){
			addMessage(1, "Сообщение не может содержать  в начале", "00:00")
		}else{
			const curDate = new Date();
			let gd=goodDate(curDate);
			console.log(inText.innerText+gd);
			socket.send(inText.innerText+gd);
		}
	}
	
	setTimeout(() => {
		inText.innerText="";
		inputData.getElementsByClassName("files")[0].innerHTML="";
		window.body.scrollTo(0, 0);
	}, 50);
	
	if(inFiles.files.length!=0){
		sendFiles();
	}
}

function applySettings(){
	socket.send("5"+setPassword.innerText);
}

inFiles.onchange = () => {
	inputData.getElementsByClassName("files")[0].innerHTML="";
    for(let i=0; i<inFiles.files.length; i++){
		inputData.getElementsByClassName("files")[0].innerHTML += '<div id="file-url" contenteditable="false" data-file = '+inFiles.files[i]+'>'+inFiles.files[i].name+'</div>';
		console.log(inFiles.files[i].name);
	}
}

document.addEventListener('keydown', function(e) {
	if (event.shiftKey && event.keyCode === 13){
		console.log("Enter");
	}else if (event.keyCode === 13){
        send();
    }
	//console.log(e.keyCode);
});

messages.addEventListener("scroll", function() {
	if (messages.childElementCount>0 && messages.scrollTop==0) 
	{
		socket.send("3"+goodDate(new Date(messages.childNodes[1].getElementsByClassName("message-time")[0].innerText.substring(3,6)+messages.childNodes[1].getElementsByClassName("message-time")[0].innerText.substring(0,3)+messages.childNodes[1].getElementsByClassName("message-time")[0].innerText.substring(6))));
	}
});