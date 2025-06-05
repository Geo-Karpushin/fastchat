let inp = "";
let mustCompile = /^[A-Z0-9]{5,10}$/;
let alph = /^[A-Z0-9]+$/;

const errorPlace = document.getElementById("label");
const todesc = document.getElementById("toDescription");
const themeControllerImg = document.getElementById("switchTheme").getElementsByTagName('img')[0];

const themeButtons = Array.prototype.slice.call(document.getElementById("switchThemeMenu").getElementsByTagName('button'));

function startChat(){
	console.log(inp);
	
	if(inp!=""){
		open("./chat/?"+inp, "_self");
	}else{
		open("./chat/", "_self");
	}
}

function startVChat() {
	console.log(inp);
	
	if(inp!=""){
		open("./stream/?"+inp, "_self");
	}else{
		open("./stream/", "_self");
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

function updateTheme() {
	themeButtons.forEach(e => {
		e.classList.remove("themeSelected");
	});
	switch (localStorage.getItem("theme")) {
		case null:
			localStorage.setItem("theme", "system");
		case "system":
			if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
				setDarkTheme();
			} else {
				setLightTheme();
			}
			themeButtons[0].classList.add("themeSelected");
			break;
		case "dark":
			setDarkTheme();
			themeButtons[2].classList.add("themeSelected");
			break;
		case "light":
			setLightTheme();
			themeButtons[1].classList.add("themeSelected");
			break;
	}
}

updateTheme();

function setDarkTheme() {
	document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')[0].setAttribute('href', './res/imgs/dark_favicon.png');
	document.body.classList.add("darkTheme");
	themeControllerImg.src = "./res/imgs/light.svg";
	console.log("Установлена тёмная тема");
}

function setLightTheme() {
	document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')[0].setAttribute('href', './res/imgs/favicon.png');
	document.body.classList.remove("darkTheme");
	themeControllerImg.src = "./res/imgs/dark.svg";
	console.log("Установлена светлая тема");
}

function switchTheme () {
	switch (localStorage.getItem("theme")) {
		case "system":
			if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
				localStorage.setItem("theme", "light");
			} else {
				localStorage.setItem("theme", "dark");
			}
			break;
		case "dark":
			localStorage.setItem("theme", "light");
			break;
		case "light":
			localStorage.setItem("theme", "dark");
			break;
	}
	updateTheme();
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