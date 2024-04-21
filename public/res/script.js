let inp = "";
let mustCompile = /^[A-Z0-9]{5,10}$/;
let alph = /^[A-Z0-9]+$/;

const errorPlace = document.getElementById("label");
const todesc = document.getElementById("toDescription");
const themeControllerImg = document.getElementById("switchTheme").getElementsByTagName('img')[0];;

function startChat(){
	console.log(inp);
	
	if(inp!=""){
		open("./chat/?"+inp, "_self");
	}else{
		open("./chat/", "_self");
	}
}

function updateBTN(event){
	event.target.value = event.target.value.toUpperCase();
	inp = event.target.value;
	if (inp !="" && !mustCompile.test(inp)) {
		if (inp.length < 5){
			errorPlace.innerText = "ID менее 5 символов";
		} else if (inp.length > 10){
			errorPlace.innerText = "ID более 10 символов";
		} else if (!alph.test(inp)){
			errorPlace.innerText = "ID не из латинского алфавита и цифр";
		}
	} else {
		errorPlace.innerText = "";
	}
	if(inp != ""){
		document.getElementById("startButton").innerText = "Перейти в Чат!";
	}else{
		document.getElementById("startButton").innerText = "Создать Чат!";
	}
}

function goDown() {
	document.body.scrollTo(0, document.body.clientHeight);
}

if (localStorage.getItem("theme") === null) {
	if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		localStorage.setItem("theme", "dark");
		setDarkTheme();
	} else {
		localStorage.setItem("theme", "light");
		setLightTheme();
	}
} else {
	if (localStorage.getItem("theme") == "dark") {
		setDarkTheme();
	} else {
		setLightTheme();
	}
}

function setDarkTheme() {
	document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')[0].setAttribute('href', './res/dark_favicon.png');
	document.body.classList.add("darkTheme");
	themeControllerImg.src = "./res/light.svg";
	console.log("Установлена тёмная тема");
}

function setLightTheme() {
	document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')[0].setAttribute('href', './res/favicon.png');
	document.body.classList.remove("darkTheme");
	themeControllerImg.src = "./res/dark.svg";
	console.log("Установлена светлая тема");
}

function switchTheme () {
	switch (localStorage.getItem("theme")) {
		case "dark":
			localStorage.setItem("theme", "light");
			setLightTheme();
			break;
		case "light":
			localStorage.setItem("theme", "dark");
			setDarkTheme();
			break;
	}
}

document.body.addEventListener('scroll', function() {
	if (window.getComputedStyle(todesc).getPropertyValue("opacity") == 1){
		anime({
			targets: todesc,
			easing: 'easeOutCubic',
			loop: 1,
			delay: 0,
			duration: 500,
			keyframes: [
				{
					opacity: 0
				}
			],
			complete: function() {
				todesc.disabled = true;
			}
		});
	}
});

document.addEventListener('keydown', function(e) {
	if(e.keyCode==13){
		startChat();
	}
	//console.log(e.keyCode);
});