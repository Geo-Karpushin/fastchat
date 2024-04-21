let socket = new WebSocket("ws://"+document.location.host+"/speaker");
const reader = new FileReader();
let messages = document.getElementById("messages-container");
let inText = document.getElementById("inText");
let inFiles = document.getElementById("inFiles");
let thisFiles = [];
let awaitingFileName="";
let idName = document.getElementById("id-name");
reader.addEventListener('load', readFile);


let id=(document.location+"").split('?')[1];

socket.onopen = () => {
	console.log("Подключение успешно");
	if(id!=undefined){
		idName.innerText = "ID: "+id;
		socket.send("1"+id);
	}else{
		document.getElementById("body").style.display="none";
		socket.send("1");
	}
}

socket.onclose = (event) => {
	console.log("Отключение: ", event);
	addMessage(1, "Ошибка подключения, переподключение..", "00:00", false);
	setTimeout(function() {
		open("./?"+id, "_self");
    }, 2500);
}


socket.onerror = (error) => {
	addMessage(1, "Ошибка подключения, переподключение..", "00:00", false);
	setTimeout(function() {
		open("./?"+id, "_self");
    }, 2500);
	console.log("Ошибка: ", error);
}


socket.onmessage = (msg) => {
	console.log(msg.data);
	if(typeof(msg.data)=='string'){
		let code=msg.data.substring(0,2);
		if (code=="1" && msg.data!="1"){
			console.log("code 1");
			open("./?"+msg.data.split("1")[1], "_self");
		}else if (code=="2"){
			let mess=msg.data.substring(2,msg.data.length-14);
			let time=msg.data.substring(msg.data.length-14,msg.data.length);
			if (mess.includes("")){
				addMessage(3, mess, time, false);
			}else{
				addMessage(2, mess, time, false);
			}
		}else{
			let mess=msg.data.substring(0,msg.data.length-14);
			let time=msg.data.substring(msg.data.length-14,msg.data.length);
			addMessage(1, mess, time, false);
		}
	}else{
		file=new File([msg.data], awaitingFileName);
		let url = URL.createObjectURL(file);
		download(url);
	}
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

function addMessage(type, text, time, needToSave)
{
	if(time=="00:00"){
		const curDate = new Date();
		time = curDate.toLocaleString();
	}else{
		time=time.substring(0,4)+'-'+time.substring(4,6)+'-'+time.substring(6,8)+'T'+time.substring(8,10)+':'+time.substring(10,12)+':'+time.substring(12,14)
		const curDate = new Date(time);
		time = curDate.toLocaleString();
	}
	if (type==1){
		messages.innerHTML += '<div class = "message"><div class="message-text">'+text+'</div><div class="message-time">'+time+'</div></div>';
		
		if(needToSave)
		{
			let gd=goodDate(curDate);
			socket.send(text+gd);
		}
			
		let tempMessages = messages.childNodes;
		
		tempMessages[tempMessages.length-1].scrollIntoView(false);
	}else if (type==2){
		messages.innerHTML += '<div class = "message"><div class="message-text"><a id="file-url" onclick="getFile(event); return false;" download="'+text+'">'+text+'</a></div><div class="message-time">'+time+'</div></div>';
		awaitingFileName="";
		let tempMessages = messages.childNodes;
		
		tempMessages[tempMessages.length-1].scrollIntoView(false);
	}else if (type==3){
		let innerTXT=text.split("")
		messages.innerHTML += '<div class = "message"><div class="message-text"><a id="file-url" onclick="getCurFile(`'+innerTXT[0]+'`,`'+innerTXT[1]+'`);" download="'+innerTXT[0]+'">'+innerTXT[0]+'</a></div><div class="message-time">'+time+'</div></div>';
		awaitingFileName="";
		let tempMessages = messages.childNodes;
		
		tempMessages[tempMessages.length-1].scrollIntoView(false);
	}
}

function goodDate(date){
	return date.getFullYear()+("0" + (date.getMonth() + 1)).slice(-2)+String(date.getDate()).padStart(2, '0')+("0" + (date.getHours())).slice(-2)+("0" + (date.getMinutes())).slice(-2)+("0" + (date.getSeconds())).slice(-2);
}

function getFile(event){
	let ctime = event.target.parentNode.parentNode.getElementsByClassName("message-time")[0].innerText
	socket.send("3"+event.target.innerText+ctime.substring(6,10)+ctime.substring(3,5)+ctime.substring(0,2)+ctime.substring(12).replaceAll(":",""));
	awaitingFileName=event.target.innerText
}

function getCurFile(name,hash){
	console.log("4"+hash);
	socket.send("4"+hash);
	awaitingFileName=name
}

function sendFiles(){
	for(let i=0; i<inFiles.files.length; i++){
		thisFiles.push(inFiles.files[i]);
	}
	helpRead();
	inFiles.value=""
}

function helpRead() {
	if(reader.readyState!=1 && thisFiles.length!=0)
	{
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
		if(inFiles.files[i].size<524287000){
			thisFiles.push(inFiles.files[i]);
		}else{
			addMessage(1, "Ошибка отправки файла, превышен максимальный размер в 499 МБайт", "00:00", false);
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

function send(){
	inText.innerText=inText.innerText.replace(/\s+/g, ' ').trim();
	if(inText.innerText==""){
		inText.innerText="";
	}else{
		console.log(inText.innerText);
		if(inText.innerText[0]==""){
			addMessage(1, "Сообщение не может содержать  в начале", "00:00", false)
		}else{
			const curDate = new Date();
			let gd=goodDate(curDate);
			socket.send(inText.innerText+gd);
		}
		inText.innerText="";
	}
	
	setTimeout(() => {
		inText.innerText="";
		window.body.scrollTo(0, 0);
	}, 50);
	
	if(inFiles.files.length!=0){
		sendFiles();
	}
}

inFiles.onchange = () => {
    for(let i=0; i<inFiles.files.length; i++){
		console.log(inFiles.files[i].name);
	}
}

document.addEventListener('keydown', function(e) {
	if (event.shiftKey && event.keyCode === 13)
    {
        send();
    }
	//console.log(e.keyCode);
});