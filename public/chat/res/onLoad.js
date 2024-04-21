window.onload = function(){
	let mc = document.getElementById("menu-cover");
	let pmc = document.getElementById("password-menu");
	let mainpage = document.getElementById("mainpage");

	document.getElementById("name").style.position="absolute";
	document.getElementById("header").style.justifyContent="center";
	//if(document.location.pathname)
	anime({
		targets: '#name',
		duration: 1000,
		easing: 'easeInOutQuad',
		keyframes: [
			{fontSize: '3.25em'},
			{fontSize: '3em'},
			{fontSize: '2.75em'},
			{fontSize: '2.50em'},
			{fontSize: '2.25em'},
			{fontSize: '2em'}
		],
		margin: 0,
		left: '1%',
		top:'2%',
		loopComplete: function(anim) {
			document.getElementById("name").style.left="0px";
			document.getElementById("name").style.position="relative";
			document.getElementById("header").style.justifyContent="space-between";
			anime({
				targets: '#id-name',
				duration: 500,
				easing: 'easeInOutQuad',
				keyframes: [
					{	
						textShadow: '0.1em 0.1em 0.2em (var(--dark-color), 0)',
						webkitTextFillColor: 'rgba(var(--main-color), 0)'
					},
					{	
						textShadow: '0.1em 0.1em 0.2em rgba(var(--dark-color), 0.1)',
						webkitTextFillColor: 'rgba(var(--main-color), 0.3)'
					},
					{	
						textShadow: '0.1em 0.1em 0.2em rgba(var(--dark-color), 0.4)',
						webkitTextFillColor: 'rgba(var(--main-color), 0.7)'
					},
					{	
						textShadow: '0.1em 0.1em 0.2em rgba(var(--dark-color), 0.55)',
						webkitTextFillColor: 'rgba(var(--main-color), 1)'
					},
				]
			});
		}
	});
	document.addEventListener("click", function(e) {
		if (e.target.id == 'apply-settings' || e.target.id == "close-icon-button" || e.target.id == "search") {
			mc.style.display = 'none';
			setTheme(lastKnownTheme);
		} else if (e.target.id == 'settings' || e.target.id=='settings-container') {
			mc.style.display = (mc.style.display != 'flex') ? 'flex' : 'none';
		} else if (e.target.id == 'close-password-menu-div') {
			pmc.style.display = 'none';
			mainpage.style.display = "flex";
		}
	});
};

function copyToClipboard(text) {
	var input = document.createElement('input');
	input.setAttribute('value', text);
	document.body.appendChild(input);
	input.select();
	document.execCommand('copy');
	document.body.removeChild(input);
}