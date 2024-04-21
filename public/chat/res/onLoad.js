window.onload = function(){
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
						textShadow: '0.1em 0.1em 0.2em (19,26,6,0)',
						webkitTextFillColor: 'rgba(51,62,11,0)'
					},
					{	
						textShadow: '0.1em 0.1em 0.2em rgba(19,26,6,0.1)',
						webkitTextFillColor: 'rgba(51,62,11,0.3)'
					},
					{	
						textShadow: '0.1em 0.1em 0.2em rgba(19,26,6,0.4)',
						webkitTextFillColor: 'rgba(51,62,11,0.7)'
					},
					{	
						textShadow: '0.1em 0.1em 0.2em rgba(19,26,6,0.55)',
						webkitTextFillColor: 'rgba(51,62,11,1)'
					},
				]
			});
		}
	});
};

document.addEventListener("click", function(e) {
	let m = document.getElementById('menu');
	if (e.target.id != 'settings-container' && e.target.id != 'settings' && e.target.id != 'menu' && e.target.parentElement.id != 'menu') {
		m.style.display = 'none';
	} else if (e.target.id == 'settings' || e.target.id=='settings-container') {
		m.style.display = (m.style.display != 'block') ? 'block' : 'none';
	}
	console.log(e.target.id);
});