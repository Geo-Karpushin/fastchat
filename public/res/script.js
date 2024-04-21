let inp = "";
function startChat(event){
	console.log(inp);
	
	if(inp!=""){
		open("./chat/?"+inp, "_self");
	}else{
		open("./chat/", "_self");
	}
}



function updateBTN(event){
	linp=event.target;
	inp=linp.value
	if(linp.value!=""){
		document.getElementById("startButton").innerText = "Перейти в Чат!";
	}else{
		document.getElementById("startButton").innerText = "Создать Чат!";
	}
}

document.addEventListener('keydown', function(e) {
	if(e.keyCode==13){
		startChat();
	}
	//console.log(e.keyCode);
});