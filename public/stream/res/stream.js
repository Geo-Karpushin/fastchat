const translateDisplayButton = document.getElementById("translateDisplay");
const translateCameraButton = document.getElementById("camera");
const translateMicrophoneButton = document.getElementById("microphone");

const mainVideos = document.getElementById("main-videos");
const allVideos = document.getElementById("all-videos-content");

addVideoStream("self!");
document.getElementById("video-self!").muted = true;

let cameraStream = new MediaStream();
let displayStream = new MediaStream();

let myoffer = undefined;

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
    constructor (UID, offer) {
        this.UID = UID;
        this.primaryconn = new RTCPeerConnection(configuration);
        this.videoconn = new RTCPeerConnection(configuration);
        this.created = false;
        this.tracksRtpSenders = {};
        this.streamsDescreption = [];
        this.handshake = false;
        this.mediaStream = new MediaStream();

        this.primaryconn.onicecandidate = (event) => {
            if (event.candidate) {
                socket.send(JSON.stringify({ code: 13, text: JSON.stringify(event.candidate), tag: this.UID, time: goodDate(new Date()) }));
            }
        };

        this.videoconn.onicecandidate = (event) => {
            if (event.candidate) {
                this.dataChannel.send(JSON.stringify({ code: 13, candidate: JSON.stringify(event.candidate), name: this.UID, time: goodDate(new Date()) }));
            }
        };

        this.videoconn.addEventListener("track", (event) => {
            console.log("New track from", this.UID, event);

            let isCameraOn = false;

            for (let key in this.streamsDescreption) {
                if (this.streamsDescreption[key] == 'camera') {
                    isCameraOn = true;
                    break;
                }
            }

            for (let i = 0; i < event.streams.length; i++) {
                if (this.streamsDescreption[event.streams[i].id] == "camera" || !isCameraOn) {
                    if (this.mainElement.srcObject && this.streamsDescreption[this.mainElement.srcObject.id] == "display") {
                        this.suppElement = this.suppElement || addVideoStream(UID+"-second", "Экран "+UID);
                        this.suppElement.srcObject = this.mainElement.srcObject;
                        updateScreen(this.suppElement.id);
                    }

                    this.mainElement.srcObject = event.streams[i];
                    updateScreen(this.mainElement.id);

                    if (event.streams[i].getAudioTracks().length > 0) {
                        analyseAudio(event.streams[i], this.UID);
                    }

                    event.streams[i].addEventListener("inactive", () => {
                        let isDisplayOn = false;

                        for (let key in this.streamsDescreption) {
                            if (this.streamsDescreption[key] == "display") {
                                isDisplayOn = true;
                                break;
                            }
                        }
                        
                        if(isDisplayOn) {
                            this.mainElement.srcObject = this.suppElement.srcObject;
                            if (this.suppElement.parentNode.parentNode.id == 'main-videos') {
                                removeFS(this.UID);
                            }
                            this.suppElement.parentNode.remove();
                            delete this.suppElement;
                        } else {
                            this.mainElement.srcObject = null;
                        }

                        updateScreen(this.mainElement.id);
                    });
                } else {
                    this.suppElement = this.suppElement || addVideoStream(UID+"-second", "Экран "+UID);
                    this.suppElement.srcObject = event.streams[i];
                    updateScreen(this.suppElement.id);

                    if (event.streams[i].getAudioTracks().length > 0) {
                        analyseAudio(this.suppElement.id);
                    }

                    event.streams[i].addEventListener("inactive", () => {
                        if (this.suppElement) {
                            if (this.suppElement.parentNode.parentNode.id == 'main-videos') {
                                removeFS(this.UID);
                            }
                            this.suppElement.parentNode.remove();
                            delete this.suppElement;
                        } else {
                            this.mainElement.srcObject = null;
                            updateScreen(this.mainElement.id);
                        }
                    });
                }
            }
        });

        if (!offer) {
            this.dataChannel = this.primaryconn.createDataChannel("main");
            console.log("DataChannel created");

            this.dataChannel.addEventListener('open', async (event) => {
                console.log(`DataChannel with ${this.UID} opened.\n`, event);
                this.handshake = true;
                updateConnection(this.UID);
            });

            this.dataChannel.addEventListener('close', event => {
                console.log(`DataChannel with ${this.UID} closed.\n`, event);
            });

            this.dataChannel.addEventListener('message', event => {
                this.handleMessage(JSON.parse(event.data));
            });

            this.primaryconn.createOffer().then((offer) => {
                myoffer = goodDate(new Date());
                this.primaryconn.setLocalDescription(offer);
                socket.send(JSON.stringify({ code: 11, text: JSON.stringify(offer), tag: this.UID, time: myoffer }));
            });
        } else if (!this.created) {
            this.primaryconn.addEventListener('datachannel', event => {
                this.dataChannel = event.channel;
                console.log("DataChannel created");

                this.dataChannel.addEventListener('open', event => {
                    console.log(`DataChannel with ${this.UID} opened.\n`, event);
                });

                this.dataChannel.addEventListener('close', event => {
                    console.log(`DataChannel with ${this.UID} closed.\n`, event);
                });

                this.dataChannel.addEventListener('message', event => {
                    this.handleMessage(JSON.parse(event.data));
                });
            });

            console.log(`Offer from ${this.UID}\n`);
            this.primaryconn.setRemoteDescription(JSON.parse(offer));
            this.created = true;
            this.primaryconn.createAnswer().then((answer) => {
                this.primaryconn.setLocalDescription(answer);
                socket.send(JSON.stringify({ code: 12, text: JSON.stringify(answer), tag: this.UID, time: goodDate(new Date()) }));
            });
        }

        this.mainElement = addVideoStream(UID, UID);
    }

    handleMessage (mess) {
        switch(mess.code){
            case 11:
                (async () => {
                    let content = {} ;

                    if (cameraStream.getTracks().length > 0) {
                        content[cameraStream.id] = "camera";
                    }

                    if (displayStream.getTracks().length > 0) {
                        content[cameraStream.id] = "display";
                    }

                    await this.videoconn.setRemoteDescription(JSON.parse(mess.offer));
            
                    const answer = await this.videoconn.createAnswer();
                    await this.videoconn.setLocalDescription(answer);
                    
                    this.dataChannel.send(JSON.stringify({ code: 12, answer: JSON.stringify(answer), content: content, name: this.UID, time: goodDate(new Date()) }));
                })();

                if (!this.handshake) {
                    setTimeout(updateConnection(this.UID), 100);
                }

                this.streamsDescreption = mess.content;

                break;
            case 12:
                this.streamsDescreption = mess.content;
                this.videoconn.setRemoteDescription(JSON.parse(mess.answer));
                break;
            case 13:
                this.videoconn.addIceCandidate(JSON.parse(mess.candidate));
                break;
        }
    }
}

let myConnects = {};

let grantedCamera = false;
let grantedMicrophone = false;
let grantedDisplay = false;

function getPermissions() {
    let exist = false;
    for (let i = 0; i < document.head.getElementsByTagName("script").length; i++){
        exist = document.head.getElementsByTagName("script")[i].src.split("/").pop() == "messages.js?v=0.5.0";
        if (exist) break
    }
    if (!exist) {
        setTimeout(getPermissions, 10);
        return;
    }
    addMessage({code: 1, text: `Чтобы вы смогли общаться, нам необходимо получить доступ к микрофону и камере`, tag: "INFO", time: goodDate(new Date())});

    navigator.permissions.query({ name: "camera" }).then(res => {
        if(res.state == "granted"){
            translateCameraButton.disabled = false;
            grantedCamera = true;
            addMessage({code: 1, text: `Вы разрешили доступ к камере`, tag: "INFO", time: goodDate(new Date())});
        } else {
            translateCameraButton.disabled = true;
            addMessage({code: 1, text: `Вы запретили доступ к камере`, tag: "INFO", time: goodDate(new Date())});
        }
    });

    navigator.permissions.query({name: "microphone"}).then(res => {
        if(res.state == "granted"){
            translateMicrophoneButton.disabled = false;
            grantedMicrophone = true;
            addMessage({code: 1, text: `Вы разрешили доступ к микрофону`, tag: "INFO", time: goodDate(new Date())});
        } else {
            translateMicrophoneButton.disabled = true;
            addMessage({code: 1, text: `Вы запретили доступ к микрофону`, tag: "INFO", time: goodDate(new Date())});
        }
    });
}

getPermissions();

function killDisplayTranslate() {
    try {
        translateDisplayButton.classList.remove("buttonSelected");
        if (document.getElementById("video-self!-display").parentNode.parentNode.id == 'main-videos') {
            removeFS("self!-display");
        }
        document.getElementById("video-self!-display").parentNode.remove();
        if (displayStream != null && displayStream.active) {
            displayStream.getTracks().forEach(async (track) => {
                displayStream.removeTrack(track);
                track.stop();
                for ([uid, user] of Object.entries(myConnects)) {
                    try {
                        await user.videoconn.removeTrack(myConnects[uid].tracksRtpSenders[track.id]);
                        delete myConnects[uid].tracksRtpSenders[track.id];
                        await updateConnection(uid);
                    } catch (ex) {
                        console.log("При завершении трансляции произошла ошибка:", ex);
                    }
                }
            });
        }
    } catch (ex) {
        console.log("Ошибка killDisplayTranslate", ex)
    }
}

async function translateDisplay(event) {
    try {
        if (event.target.classList.contains("buttonSelected")) {
            killDisplayTranslate();
            return;
        } else {
            event.target.classList.add("buttonSelected");
        }
        displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                width: 1280, 
                height: 720
                // width: { ideal: 640 },
                // height: { ideal: 480 },
                // frameRate: { ideal: 30 }
            },
            audio: true
        });
        displayStream.oninactive = () => {killDisplayTranslate()};
        addVideoStream("self!-display");
        document.getElementById("video-self!-display").muted = true;
        document.getElementById("video-self!-display").srcObject = displayStream;
        for ([uid, user] of Object.entries(myConnects)) {
            updateConnection(uid);
        }
    } catch (ex) {
        console.log("Ошибка получения демонстрации экрана:", ex);
        event.target.classList.remove("buttonSelected");
        if (document.getElementById("video-self!-display").parentNode.parentNode.id == 'main-videos') {
            removeFS("self!-display");
        }
        document.getElementById("video-self!-display").parentNode.remove();
    }
}

async function translateUserMedia(event) {
    if (event.target.classList.contains("buttonSelected")) {
        event.target.classList.remove("buttonSelected");
    } else {
        event.target.classList.add("buttonSelected");
    }

    try {
        let needToActivateCamera = (cameraStream == null || cameraStream.getVideoTracks().length == 0) && translateCameraButton.classList.contains("buttonSelected");
        let needToActivateMicrophone = (cameraStream == null || cameraStream.getAudioTracks().length == 0) && translateMicrophoneButton.classList.contains("buttonSelected");
        if (needToActivateCamera || needToActivateMicrophone) {
            getPermissions();
            await navigator.mediaDevices.getUserMedia({
                video: needToActivateCamera,
                audio: needToActivateMicrophone
            }).then(async (stream) => {
                if (cameraStream != null) {
                    if (needToActivateCamera) { cameraStream.addTrack(stream.getVideoTracks()[0]); }
                    if (needToActivateMicrophone) { cameraStream.addTrack(stream.getAudioTracks()[0]) };
                    cameraStream.oninactive = () => {document.getElementById("video-self!").srcObject = null; updateScreen("video-self!");};
                } else {
                    cameraStream = stream;
                }
                
                for ([uid, user] of Object.entries(myConnects)) {
                    if (cameraStream.getAudioTracks()[0]) {
                        analyseAudio(cameraStream, "self!");
                    }
                    await updateConnection(uid);
                }

                document.getElementById("video-self!").srcObject = cameraStream;
                updateScreen("video-self!");
            });
        }

        if (!needToActivateCamera && cameraStream.getVideoTracks().length != 0 && !translateCameraButton.classList.contains("buttonSelected")) {
            cameraStream.getVideoTracks().forEach(async (track) => {
                track.stop();
                cameraStream.removeTrack(track);
                for ([uid, user] of Object.entries(myConnects)) {
                    try {
                        await user.videoconn.removeTrack(myConnects[uid].tracksRtpSenders[track.id]);
                        delete myConnects[uid].tracksRtpSenders[track.id];
                        await updateConnection(uid);
                    } catch (ex) {
                        console.log("При завершении трансляции произошла ошибка:", ex);
                    }
                }
            });
            console.log("camera off");
        }

        if (!needToActivateMicrophone && cameraStream.getAudioTracks().length != 0 && !translateMicrophoneButton.classList.contains("buttonSelected")) {
            cameraStream.getAudioTracks().forEach(async (track) => {
                track.stop();
                cameraStream.removeTrack(track);
                for ([uid, user] of Object.entries(myConnects)) {
                    try {
                        await user.videoconn.removeTrack(myConnects[uid].tracksRtpSenders[track.id]);
                        delete myConnects[uid].tracksRtpSenders[track.id];
                        updateConnection(uid);
                    } catch (ex) {
                        console.log("При завершении трансляции произошла ошибка:", ex);
                    }
                }
            });
            console.log("micro off");
        }
    } catch (ex) {
        console.log("Ошибка при доступе к медиа устройствам:", ex);
    }
}

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

function removeWRTCConnection(client) {
    try {
        let newclient = new Audio('/res/imgs/out.wav');
        newclient.play();
        delete myConnects[client];
        if (document.getElementById("video-"+client).parentNode.parentNode.id == 'main-videos') {
            removeFS(client);
        }
        document.getElementById("video-"+client).parentNode.remove();
        if (document.getElementById("video-"+client+"-second")) {
            if (document.getElementById("video-"+client+"-second").parentNode.parentNode.id == 'main-videos') {
                removeFS(client+"-second");
            }
            document.getElementById("video-"+client+"-second").parentNode.remove();
        }
    } catch (ex) {
        console.log("Ошибка очистки:", ex);
    }
}

analysing = {};

function clearAnalyse (event) {
    console.log("cleared");
    if (Object.keys(analysing).indexOf(event.target.id) != -1) {
        clearInterval(analysing[event.target.id][0]);
    }

    if (document.getElementById("video-"+analysing[event.target.id][1])) {
        document.getElementById("video-"+analysing[event.target.id][1]).classList.remove("speaking");
    }

    delete analysing[event.target.id];
}

function analyseAudio(stream, client) {
    if (Object.keys(analysing).indexOf(stream.id) != -1) {
        clearAnalyse({target: stream})
    }
    
    console.log("added");

    let audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let analyser = audioContext.createAnalyser();
    let source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    let avg = 0;
    function analyse() {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
    
        const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
        avg += volume
        avg /= 2;
        if (avg > 10) {
            if (document.getElementById("video-"+client)) {
                document.getElementById("video-"+client).classList.add("speaking");
            }
        } else {
            if (document.getElementById("video-"+client)) {
                document.getElementById("video-"+client).classList.remove("speaking");
            }
        }
    }
    let refreshId = setInterval(analyse, 250);
    stream.addEventListener("inactive", clearAnalyse);
    analysing[stream.id] = [refreshId, client];
}

function addRemoteClient(client) {
    let newclient = new Audio('/res/imgs/in.wav');
    newclient.play();
    if (myConnects[client] != undefined) return;
    myConnects[client] = new Peer(client);
}

function removeFS(client) {
    let self = document.getElementById("video-"+client).parentNode;
    document.body.classList.remove("fullscreen");
    self.getElementsByTagName("img")[0].src = "/res/imgs/fullscreen.svg";
    self.getElementsByTagName("button")[0].onclick = () => {makeFS(client)};;
}

function makeFS(client) {
    let self = document.getElementById("video-"+client).parentNode;
    if (mainVideos.childNodes[0] != undefined) {
        let mvc = mainVideos.childNodes[0].getElementsByTagName("video")[0];
        if ("video-"+client != mvc.id) {
            mvc = mvc.parentNode;
            mainVideos.appendChild(self);
            allVideos.appendChild(mvc);
        }
    } else {
        mainVideos.appendChild(self);
    }
    
    document.body.classList.add("fullscreen");

    self.getElementsByTagName("img")[0].src = "/res/imgs/fullscreen-exit.svg";
    self.getElementsByTagName("button")[0].onclick = () => {removeFS(client)};
}

async function updateConnection(client) {
    if (cameraStream.getAudioTracks()[0] && !myConnects[client].tracksRtpSenders[cameraStream.getAudioTracks()[0].id]) {
        console.log("added audio");
        let rtpSender = await myConnects[client].videoconn.addTrack(cameraStream.getAudioTracks()[0], cameraStream);
        myConnects[client].tracksRtpSenders[cameraStream.getAudioTracks()[0].id] = rtpSender;
    }

    if (cameraStream.getVideoTracks()[0] && !myConnects[client].tracksRtpSenders[cameraStream.getVideoTracks()[0].id]) {
        console.log("added camera");
        let rtpSender = await myConnects[client].videoconn.addTrack(cameraStream.getVideoTracks()[0], cameraStream);
        myConnects[client].tracksRtpSenders[cameraStream.getVideoTracks()[0].id] = rtpSender;
    }

    if (displayStream.getVideoTracks()[0] && !myConnects[client].tracksRtpSenders[displayStream.getVideoTracks()[0].id]) {
        console.log("added display");
        let rtpSender = await myConnects[client].videoconn.addTrack(displayStream.getVideoTracks()[0], displayStream);
        myConnects[client].tracksRtpSenders[displayStream.getVideoTracks()[0].id] = rtpSender;
    }

    let content = {} ;

    if (cameraStream.getTracks().length > 0) {
        content[cameraStream.id] = "camera";
    }

    if (displayStream.getTracks().length > 0) {
        content[displayStream.id] = "display";
    }

    await trowOffer(client, content);
}

async function trowOffer(client, content) {
    if (myConnects[client].primaryconn.connectionState != "connected") {
        await new Promise((resolve) => {
            const checkConnection = () => {
                if (myConnects[client].primaryconn.connectionState == "connected") {
                    resolve();
                } else {
                    setTimeout(checkConnection, 10);
                }
            };
            checkConnection();
        });
    }
    const offer = await myConnects[client].videoconn.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
    });
    await myConnects[client].videoconn.setLocalDescription(offer);
    myConnects[client].dataChannel.send(JSON.stringify({ code: 11, offer: JSON.stringify(offer), name: client, content: content, time: goodDate(new Date()) }));
}

async function appendAnswer(answer, client) {
    if (myConnects[client] == undefined || myConnects[client].created) return;
    console.log(`Answer from ${client}\n`);
    myConnects[client].primaryconn.setRemoteDescription(JSON.parse(answer));
    myConnects[client].created = true;
}

async function appendIceCandidate(iceCandidate, client) {
    // addMessage({code: 1, text: `${iceCandidate}`, tag: "DEBUG", time: goodDate(new Date())});
    if (!myConnects[client] || myConnects[client].primaryconn.remoteDescription == null) {
        await new Promise((resolve) => {
            const checkConnectionExist = () => {
                if (myConnects[client] && myConnects[client].primaryconn.remoteDescription != null) {
                    resolve();
                } else {
                    setTimeout(checkConnectionExist, 50);
                }
            };
            checkConnectionExist();
        });
    }
    await myConnects[client].primaryconn.addIceCandidate(JSON.parse(iceCandidate));
}

async function appendOffer(offer, client, inputoffer) {
    await new Promise((resolve) => {
        const checkMyOfferExist = () => {
            if (myoffer) {
                resolve();
            } else {
                setTimeout(checkMyOfferExist, 10);
            }
        };
        checkMyOfferExist();
    });
    if (myoffer && new Date(myoffer) < new Date(inputoffer)) return;
    myConnects[client] = new Peer(client, offer);
}