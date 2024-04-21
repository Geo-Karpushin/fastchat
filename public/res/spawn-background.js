const messagesCount = getRandomArbitrary(10, 20);
const timeSpread = 20;
const scaleSpread = 3;
const leftSpread = 100;
const topSpread = 100;


window.onload = function(){
	const bodyDOM = document.querySelector("body");
	document.title = "Fast Chat - Главная страница";

	for (let i = 0; i <= messagesCount; i++) {
		let tdelay=getRandomArbitrary(5, timeSpread);
		let tscale=getRandomArbitrary(1/scaleSpread, scaleSpread-1.5);
		let tleft=Math.round(getRandomArbitrary(-leftSpread+10,leftSpread-10));
		let ttop=Math.round(getRandomArbitrary(-topSpread,topSpread));
		bodyDOM.innerHTML+=`<div class='light' style='-webkit-animation: floatUp ${tdelay}s infinite linear;-moz-animation: floatUp ${tdelay}s infinite linear;-o-animation: floatUp ${tdelay}s infinite linear;animation: floatUp ${tdelay}s infinite linear;-webkit-transform: scale(${tscale});-moz-transform: scale(${tscale});-o-transform: scale(${tscale});transform: scale(${tscale});left: ${tleft}%;top: ${ttop}%; animation-delay: ${i}s;'></div>`;
	}
}

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}