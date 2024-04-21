const socket = new WebSocket("ws://"+document.location.host+"/speaker");

socket.send("{~}1");

socket.close();