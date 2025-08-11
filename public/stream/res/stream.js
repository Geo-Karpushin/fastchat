// HTML

function addVideoStream(client, name) {
    let self = document.getElementById("video-"+client)
    if (!self) {
        let div = document.createElement("div");
        div.classList.add("contain-div");
        let namediv = document.createElement("div");
        namediv.innerText = client.includes("self!") ? "Это Вы" : (name || client);
        namediv.classList.add("name-div");
        let newV = document.createElement("video");
        newV.id = "video-"+client;
        newV.setAttribute('autoplay', '');
        newV.setAttribute('playsinline', '');
        newV.setAttribute('loop', '');
        newV.setAttribute('webkit-playsinline', 'webkit-playsinline');
        newV.addEventListener("inactive", () => { newV.srcObject = undefined; newV.src = "/res/imgs/user.svg"; });
        let buttonFS = document.createElement("button");
        buttonFS.classList.add("bottom-icon-button");
        buttonFS.onclick = () => {makeFS(client)};
        let FSimg = document.createElement("img");
        FSimg.src = "/res/imgs/fullscreen.svg";
        FSimg.classList.add("icon");
        buttonFS.appendChild(FSimg);
        div.appendChild(buttonFS);
        div.appendChild(newV);
        div.appendChild(namediv);
        if (mainVideos.getElementsByTagName("video").length < 1) {
            mainVideos.appendChild(div);
        } else {
            allVideos.appendChild(div);
        }
        return newV;
    } else {
        return self;
    }
}

function removeVideoStream(UID) {
    if (mainVideos.contains(document.getElementById("video-"+UID))) {
        mainVideos.appendChild(allVideos.getElementsByTagName("video")[0].parentNode);
    }
    removeFS(UID);
    document.getElementById("video-"+UID).parentNode.remove();
}

function setFirst(UID) {
    let self = document.getElementById("video-"+UID).parentNode;
    if (!document.body.classList.contains("fullscreen")) {
        if (mainVideos.childNodes[0] != undefined) {
            let mvc = mainVideos.childNodes[0].getElementsByTagName("video")[0];
            if ("video-"+UID != mvc.id) {
                mvc = mvc.parentNode;
                mainVideos.appendChild(self);
                allVideos.prepend(mvc);
            }
        } else {
            mainVideos.appendChild(self);
        }
    } else {
        allVideos.prepend(self);
    }
}

function makeFS(UID) {
    setFirst(UID)
    
    document.body.classList.add("fullscreen");

    let self = document.getElementById("video-"+UID).parentNode;
    self.getElementsByTagName("img")[0].src = "/res/imgs/fullscreen-exit.svg";
    self.getElementsByTagName("button")[0].onclick = () => {removeFS(UID)};
}

function removeFS(UID) {
    let self = document.getElementById("video-"+UID).parentNode;
    document.body.classList.remove("fullscreen");
    self.getElementsByTagName("img")[0].src = "/res/imgs/fullscreen.svg";
    self.getElementsByTagName("button")[0].onclick = () => {makeFS(UID)};;
}

// analyse audio

const analysing = {};

function clearAnalyse(event) {
    const streamId = event.target.id;
    const analysis = analysing[streamId];
    
    if (!analysis) return;
    
    clearInterval(analysis.intervalId);
    analysis.stream.removeEventListener("inactive", clearAnalyse);
    
    if (analysis.audioContext.state !== 'closed') {
        analysis.source.disconnect();
        analysis.audioContext.close();
    }
    
    const videoElement = document.getElementById(`video-${analysis.clientId}`);
    videoElement?.classList.remove("speaking");
    
    delete analysing[streamId];
}

function analyseAudio(stream, client) {
    const streamId = stream.id;
    
    if (analysing[streamId]) {
        clearAnalyse({ target: { id: streamId } });
    }
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let avg = 0;
    let isSpeaking = false;
    
    function analyse() {
        analyser.getByteFrequencyData(dataArray);
    
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const volume = sum / dataArray.length;
        
        avg = avg ? (avg + volume) / 2 : volume;
        
        const newIsSpeaking = avg > 10;
        if (newIsSpeaking !== isSpeaking) {
            isSpeaking = newIsSpeaking;
            const videoElement = document.getElementById(`video-${client}`);
            videoElement?.classList.toggle("speaking", isSpeaking);
        }
    }
    
    const intervalId = setInterval(analyse, 250);
    stream.addEventListener("inactive", clearAnalyse);
    
    analysing[streamId] = {
        intervalId,
        clientId: client,
        audioContext,
        analyser,
        source,
        stream
    };
}

// media

const translateDisplayButton = document.getElementById("translateDisplay");
const translateCameraButton = document.getElementById("camera");
const translateMicrophoneButton = document.getElementById("microphone");

const mainVideos = document.getElementById("main-videos");
const allVideos = document.getElementById("all-videos-content");

let selfVideo = addVideoStream("self!", "Это вы");
selfVideo.muted = true;

let selfDisplay = undefined;

let mediaStream = new MediaStream();
let displayStream = new MediaStream();

let cameraTrack;
let microphoneTrack;

async function displayTranslateSwitcher() {
    try {
        if (displayStream.active) {
            killDisplayTranslate();
        } else {
            await getDisplayTranslate();
        }

        refreshSelfVideos();
        updateConnections();
    } catch (ex) {
        console.error("Ошибка переключателя демонстрации экрана:", ex);
    }
}

async function getDisplayTranslate() {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
            cursor: "always",
            width: { ideal: 1280 }, 
            height: { ideal: 720 }, 
            frameRate: { ideal: 30 },
        },
        audio: true
    });
    displayStream.oninactive = () => { killDisplayTranslate() };

    displayStream.getTracks().forEach(async (track) => {
        appendBroadcastTrack(track, displayStream);
    });

    translateDisplayButton.classList.add("buttonSelected");
}

function killDisplayTranslate() {
    displayStream.oninactive = undefined;
    displayStream.getTracks().forEach(async (track) => {
        displayStream.removeTrack(track);

        removeBroadcastTrack(track);

        track.stop();
    });

    translateDisplayButton.classList.remove("buttonSelected");
}

async function microphoneTrackSwitcher() {
    try {
        if (microphoneTrack && microphoneTrack.readyState == "live") {
            killMicrophoneTrack();
        } else {
            await getMicrophoneTrack();
        }

        refreshSelfVideos();
        updateConnections();
    } catch (ex) {
        console.error("Ошибка переключателя микрофона:", ex);
    }
}

function killMicrophoneTrack() {
    microphoneTrack.onended = undefined;
    mediaStream.removeTrack(microphoneTrack);

    removeBroadcastTrack(microphoneTrack);

    microphoneTrack.stop();

    translateMicrophoneButton.classList.remove("buttonSelected");
}

async function getMicrophoneTrack() {
    let audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
    })

    microphoneTrack = audioStream.getAudioTracks()[0];
    microphoneTrack.onended = () => { killMicrophoneTrack(); };
    mediaStream.addTrack(microphoneTrack);

    appendBroadcastTrack(microphoneTrack, mediaStream);

    translateMicrophoneButton.classList.add("buttonSelected");
}

async function cameraTrackSwitcher() {
    try {
        if (cameraTrack && cameraTrack.readyState == "live") {
            killCameraTrack();
        } else {
            await getCameraTrack();
        }

        refreshSelfVideos();
        updateConnections();
    } catch (ex) {
        console.error("Ошибка переключателя камеры:", ex);
    }
}

function killCameraTrack() {
    cameraTrack.onended = undefined;
    mediaStream.removeTrack(cameraTrack);

    removeBroadcastTrack(cameraTrack);

    cameraTrack.stop();

    translateCameraButton.classList.remove("buttonSelected");
}

async function getCameraTrack() {
    let videoStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        width: { ideal: 1280 }, 
        height: { ideal: 720 }, 
        frameRate: { ideal: 30 },
    });

    cameraTrack = videoStream.getVideoTracks()[0];
    cameraTrack.onended = () => { killCameraTrack(); };
    mediaStream.addTrack(cameraTrack);

    appendBroadcastTrack(cameraTrack, mediaStream);

    translateCameraButton.classList.add("buttonSelected");
}

function refreshSelfVideos() {
    if (mediaStream.active) {
        selfVideo.srcObject = mediaStream;

        if (mediaStream.getAudioTracks().length > 0) {
            analyseAudio(mediaStream, "self!");
        }

        if (displayStream.active) {
            if (selfDisplay == undefined) {
                selfDisplay = addVideoStream("self!-display", "Ваш экран");
                selfDisplay.muted = true;
            }

            selfDisplay.srcObject = displayStream;
            
            if (displayStream.getAudioTracks().length > 0) {
                analyseAudio(displayStream, "self!-display");
            }
        } else if (selfDisplay != undefined) {
            removeVideoStream("self!-display");
            selfDisplay = undefined;
        }
    } else {
        if (displayStream.active) {
            if (selfDisplay != undefined) {
                removeVideoStream("self!-display");
                selfDisplay = undefined;
            }

            selfVideo.srcObject = displayStream;

            if (displayStream.getAudioTracks().length > 0) {
                analyseAudio(displayStream, "self!-display");
            }
        } else {
            if (selfDisplay != undefined) {
                removeVideoStream("self!-display");
                selfDisplay = undefined;
            }

            selfVideo.srcObject = undefined;
        }
    }
}

// p2p

let myConnects = {};

const configuration = {
    iceServers: [
        {
            urls: ["stun:fastchat.space:3479",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302"]
        },
        {
            urls: 'turn:turn.fastchat.space:3479',
            username: 'turnuser',
            credential: 'userkey',
        }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
}

class Peer {
    constructor (UID, streamsMap) {
        this.UID = UID;
        this.Name = UID;
        this.streamsMap = streamsMap;
        this.conn = new RTCPeerConnection(configuration);
        this.mediaStream = new MediaStream();
        this.displayStream = new MediaStream();

        this.selfVideo = addVideoStream(this.UID, this.Name);
        this.selfDisplay = undefined

        this.senders = {}

        this.conn.onicecandidate = (event) => {
            if (event.candidate) {
                socket.send(JSON.stringify({ code: 13, text: JSON.stringify(event.candidate), tag: this.UID, time: goodDate(new Date()) }));
            }
        };

        this.conn.addEventListener("track", (event) => {
            setFirst(this.UID);
            if (this.streamsMap.mediaStream == event.streams[0].id) {
                // event.track.onended = () => { this.mediaStream.removeTrack(track); };
                this.mediaStream = event.streams[0];
                this.mediaStream.oninactive = () => { this.refreshSelfVideos(); };
            } else if (this.streamsMap.displayStream == event.streams[0].id) {
                // event.track.onended = () => { this.displayStream.removeTrack(track); };
                this.displayStream = event.streams[0];
                this.displayStream.oninactive = () => { this.refreshSelfVideos(); };
            }
            this.refreshSelfVideos();
        });
    }

    refreshSelfVideos() {
        if (this.mediaStream.active) {
            this.selfVideo.srcObject = this.mediaStream;

            if (this.mediaStream.getAudioTracks().length > 0) {
                analyseAudio(this.mediaStream, this.UID);
            }

            if (this.displayStream.active) {
                if (this.selfDisplay == undefined) {
                    this.selfDisplay = addVideoStream(this.UID + "-second", this.Name);
                }

                this.selfDisplay.srcObject = this.displayStream;

                if (this.displayStream.getAudioTracks().length > 0) {
                    analyseAudio(this.displayStream, this.UID + "-second");
                }
            } else if (this.selfDisplay != undefined) {
                removeVideoStream(this.UID + "-second");
                this.selfDisplay = undefined;
            }
        } else {
            if (this.displayStream.active) {
                if (this.selfDisplay != undefined) {
                    removeVideoStream(this.UID + "-second");
                    this.selfDisplay = undefined;
                }

                this.selfVideo.srcObject = this.displayStream;

                if (this.displayStream.getAudioTracks().length > 0) {
                    analyseAudio(this.displayStream, this.UID);
                }
            } else {
                if (this.selfDisplay != undefined) {
                    removeVideoStream(this.UID + "-second");
                    this.selfDisplay = undefined;
                }

                this.selfVideo.srcObject = undefined;
            }
        }
    }

    updateConnection() {
        this.conn.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
        }).then((offer) => {
            this.conn.setLocalDescription(offer);

            let content = {
                mediaStream: mediaStream.id,
                displayStream: displayStream.id,
                offer: offer,
            }

            socket.send(JSON.stringify({ code: 11, text: JSON.stringify(content), tag: this.UID, time: goodDate(new Date()) }));
        });
    }

    appendOffer(offer) {
        this.conn.setRemoteDescription(offer).then(() => {
            this.conn.createAnswer().then((answer) => {
                this.conn.setLocalDescription(answer);

                let content = {
                    mediaStream: mediaStream.id,
                    displayStream: displayStream.id,
                    answer: answer,
                }

                socket.send(JSON.stringify({ code: 12, text: JSON.stringify(content), tag: this.UID, time: goodDate(new Date()) }));
            })
        })
    }

    appendAnswer(answer) {
        this.conn.setRemoteDescription(answer);
    }

    appendICECandidate(iceCandidate) {
        this.conn.addIceCandidate(iceCandidate);
    }

    addTrack(track, stream) {
        if (!(track.id in this.senders)) {
            this.senders[track.id] = this.conn.addTrack(track, stream);
        }
    }

    removeTrack(track) {
        if (track.id in this.senders) {
            this.conn.removeTrack(this.senders[track.id]);
        }
    }
}

function appendBroadcastTrack(track, stream) {
    for ([UID, user] of Object.entries(myConnects)) {
        myConnects[UID].addTrack(track, stream)
    }
}

function removeBroadcastTrack(track) {
    for ([UID, user] of Object.entries(myConnects)) {
        myConnects[UID].removeTrack(track)
    }
}

function updateConnections() {
    for ([UID, user] of Object.entries(myConnects)) {
        myConnects[UID].updateConnection();
    }
}

function establishConnection(UID) {
    myConnects[UID] = new Peer(UID);

    mediaStream.getTracks().forEach(async (track) => {
        myConnects[UID].addTrack(track, mediaStream);
    });
    displayStream.getTracks().forEach(async (track) => {
        myConnects[UID].addTrack(track, displayStream);
    });
    
    myConnects[UID].updateConnection();

    let newclient = new Audio('/res/imgs/in.wav');
    newclient.play();
}

function appendOffer(UID, content) {
    if (!(UID in myConnects)) {
        myConnects[UID] = new Peer(UID);
    }
    myConnects[UID].streamsMap = { mediaStream: content.mediaStream, displayStream: content.displayStream };
    myConnects[UID].appendOffer(content.offer);
}

function appendAnswer(UID, content) {
    if (UID in myConnects) {
        myConnects[UID].streamsMap = { mediaStream: content.mediaStream, displayStream: content.displayStream };
        myConnects[UID].appendAnswer(content.answer);
    }
}

function appendICECandidate(UID, iceCandidate) {
    if (UID in myConnects) {
        new Promise((resolve) => {
            function wait() {
                if (myConnects[UID].conn.remoteDescription == null) {
                    setTimeout(wait, 50);
                } else {
                    myConnects[UID].appendICECandidate(iceCandidate);
                    resolve();
                }
            }
            wait();
        });
    }
}

function closeConnection(UID) {
    myConnects[UID].conn.close();
    delete myConnects[UID];

    removeVideoStream(UID);
    
    let newclient = new Audio('/res/imgs/out.wav');
    newclient.play();
}

function changeName(UID, name, attempt) {
    if (UID in myConnects) {
        myConnects[UID].selfVideo.parentNode.getElementsByClassName("name-div")[0].innerText = name;

        if (myConnects[UID].selfDisplay) {
            myConnects[UID].selfDisplay.parentNode.getElementsByClassName("name-div")[0].innerText = name;
        }

        myConnects[UID].Name = name;
    } else if (attempt < 5) {
        setTimeout(() => {changeName(UID, name, attempt+1)}, 150);
    }
}