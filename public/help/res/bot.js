//======= VARS AND CONSTS AND CONFIG =======\\
const urlregex = /((([a-zA-Z0-9]+:){1})([a-zA-Z0-9\-\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]+(\.[a-zA-Z0-9\-\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]+)+)([\?#]{1}[a-zA-Z0-9\-\.\_\~\(\)\*\%\!\#\$\&\'\+\/\,\:\;\=\?\@\[\]]*)?)/g;

const text = document.getElementById("text");
const themes = document.getElementById("themes");
let messages = document.getElementById("messages-container");
const inForm = document.getElementById("in");

const answers = readJSONFile("./res/mainbot.json");

//================== CODE ==================\\

document.title = "Fast Chat - Чат-бот";

// Поиск ответов на вопросы  
function findBestAnswers(question) {
	question = question.toLowerCase();
	let bestAnswers = [];
	answers.forEach(answer => {
		localBestTheme = { score: 0, theme: "" }
		answer.themes.forEach(theme => {
			let result = similarity(theme, question);
			if (result > localBestTheme.score) {
				localBestTheme.score = result;
				localBestTheme.theme = theme;
			}
		});
		bestAnswers.push({ score: localBestTheme.score, theme: localBestTheme.theme, answer: answer.answer });
	});
	bestAnswers = bestAnswers.sort(compareFn);
	return [bestAnswers, bestAnswers[0].score >= 0.2];
}

// Добавление нового сообщения
function addMessage(inpMess) {
	let finalText = "";
	let strings = inpMess.text.split("\n");
	let all = document.createElement("div");
	for (let i = 0; i < strings.length; i++) {
		let par = document.createElement("p");
		if (inpMess.checked) {
			par.innerHTML = strings[i];
		} else {
			par.innerText = strings[i];
			par.innerHTML = wrapLinks(par.innerHTML);
		}
		all.appendChild(par);
	}
	finalText = all.innerHTML;
	let finaldiv = document.createElement("div");
	finaldiv.className = "message";
	finaldiv.dataset.gd = inpMess.time;
	finaldiv.innerHTML = '<div class="message-text">' + finalText + '</div><div class="message-bottom"><div class="message-tag">' + inpMess.tag + '</div></div>';
	messages.append(finaldiv);
	setTimeout(() => {
		messages.children[messages.childElementCount-1].scrollIntoView(true);
	}, 50);
}

//Отправка вопроса
function ask(question) {
	check = question.replace(/[\n\r]+/g, '').trim();
	if (check != "") {
		addMessage({ text: question, tag: "YOU" });
		temp = findBestAnswers(question.toLowerCase())[0];
		let bestAnswer = temp[0];
		let success = temp[1];
		setTimeout(() => {
			themes.innerHTML = "";
		}, 50);
		if (success && bestAnswer.score >= 0.45){
			addMessage({ text: bestAnswer.answer, tag: "BOT" });
		} else {
			fetch(document.location.protocol+"//"+document.location.host+"/questions", {
				method:'PUT',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					question: question
				})
			});
			addMessage({ checked: true, text: "Это отличный вопрос! К сожалению, я пока не могу ответить на него :(\nПожалуйста, переформулируйте вопрос или обратитесь к администрации Fast Chat для получения подробного ответа. Их контакты указаны внизу страницы", tag: "BOT" });
		}
	}
}

// Схожесть строк
function similarity(s1, s2) {
	var longer = s1;
	var shorter = s2;
	if (s1.length < s2.length) {
		longer = s2;
		shorter = s1;
	}
	var longerLength = longer.length;
	if (longerLength == 0) {
		return 1.0;
	}
	return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
	}

	function editDistance(s1, s2) {
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();

	var costs = new Array();
	for (var i = 0; i <= s1.length; i++) {
		var lastValue = i;
		for (var j = 0; j <= s2.length; j++) {
		if (i == 0)
			costs[j] = j;
		else {
			if (j > 0) {
			var newValue = costs[j - 1];
			if (s1.charAt(i - 1) != s2.charAt(j - 1))
				newValue = Math.min(Math.min(newValue, lastValue),
				costs[j]) + 1;
			costs[j - 1] = lastValue;
			lastValue = newValue;
			}
		}
		}
		if (i > 0)
		costs[s2.length] = lastValue;
	}
	return costs[s2.length];
}

// Обёртка ссылок
function wrapLinks(str) {
	return str.replace(urlregex, "<a id='file-url' target='_blank' href='$1'>$1</a>");
}

// Чтение JSON файлов
function readJSONFile(file) {
    var rawFile = new XMLHttpRequest();
    rawFile.open("GET", file, false);
    let ans;
    rawFile.onreadystatechange = function () {
        if(rawFile.readyState === 4) {
            if(rawFile.status === 200 || rawFile.status == 0) {
                ans = JSON.parse(rawFile.responseText);
            }
        }
    }
    rawFile.send(null);
    return ans;
}

// Сравнение результатов
function compareFn(a, b) {
	if (a.score > b.score) {
		return -1;
	}
	if (a.score < b.score) {
		return 1;
	}
	return 0;
}

// Получение тем
text.addEventListener('input', function (e) {
	themes.innerHTML = "";
	temp = findBestAnswers(text.innerText.toLowerCase());
	let bestAnswers = temp[0];
	let success = temp[1];
	if (success) {
		for (let i = 0; i < (5 <= bestAnswers.length ? 5 : bestAnswers.length); i++) {
			themes.innerHTML += `<div id="file-url" contenteditable="false" onclick = "(() => {addMessage({ text: \`${bestAnswers[i].answer}\`, tag: 'BOT' }); themes.innerHTML = ''; text.innerHTML = '';})()">${bestAnswers[i].theme[0].toUpperCase()+bestAnswers[i].theme.slice(1)}</div>`;
		}
	}
});

// Отправка вопроса на Enter
document.addEventListener('keydown', function (e) {
	if (!e.shiftKey && e.key === "Enter") {
		ask(text.innerText);
		setTimeout(() => {
			text.innerHTML = "";
			window.body.scrollTo(0, 0);
		}, 50);
	}
});