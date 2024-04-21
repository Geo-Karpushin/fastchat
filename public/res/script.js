function startChat(){
	var inp = document.getElementById("inpT");
	console.log(inp.value);
	
	if(inp.value!=""){
		open("./chat/?"+inp.value, "_self");
	}else{
		open("./chat/", "_self");
	}
}