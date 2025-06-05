const allVideosContent = document.getElementById('all-videos-content');

allVideosContent.addEventListener('wheel', (event) => {
    allVideosContent.scrollBy(event.deltaY, 0);
}, {passive: true});

function updateScreen(id) {
    // let videos = document.getElementById("video-content").getElementsByTagName("video");
    // for(let i = 0; i < videos.length; i++){
    //     setTimeout(() => {videos[i].srcObject = videos[i].srcObject}, 10);
    // }

    document.getElementById(id).srcObject = document.getElementById(id).srcObject;
}

// document.addEventListener("visibilitychange", () => {
//     if (!document.hidden) {
//         updateScreen();
//     }
// });

function chat() {
    if (document.body.classList.contains("chatopened")) {
        document.body.classList.remove("chatopened");
        document.getElementById("chatbtn").classList.remove("buttonSelected");
    } else {
        document.body.classList.add("chatopened");
        messages.children[messages.childElementCount-1].scrollIntoView(true);
        document.getElementById("chatbtn").getElementsByTagName("img")[0].src = "../../res/imgs/chat.svg";
        document.getElementById("chatbtn").classList.add("buttonSelected");
    }
}

if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent)) {
    document.getElementById("enter-conf").parentNode.innerHTML += "<p>Сейчас идёт тестирования видеочатов, и на данный момент мобильные устройства поддерживаются не полностью. Могут возникать ошибки при работе.</p>";
    document.getElementById("translateDisplay").style.display = "none";
}

function openStream() {
    // let stream = document.createElement('script');
    // stream.src = './res/stream.js?v=0.5.0';
    // stream.defer = true;
    // document.body.appendChild(stream);

    let messages = document.createElement('script');
    messages.src = '/res/scripts/messages.js?v=0.5.0';
    messages.defer = true;
    document.body.appendChild(messages);

    document.body.classList.remove("doyouwanttoenter");
}