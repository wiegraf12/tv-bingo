const socket = io();
let currentRoomId = null;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
    initAudio();
    if (type === 'draw') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'win') {
        for(let i=0; i<6; i++) {
            setTimeout(() => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.connect(g); g.connect(audioCtx.destination);
                o.type = 'triangle';
                o.frequency.setValueAtTime(880, audioCtx.currentTime);
                g.gain.setValueAtTime(0.2, audioCtx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                o.start(); o.stop(audioCtx.currentTime + 0.2);
            }, i * 120);
        }
    }
}

// Draw the master 75 board mapping elements
const bingoBoard = document.getElementById('bingoBoard');
function generateBoardGrid() {
    bingoBoard.innerHTML = "";
    for (let i = 1; i <= 75; i++) {
        const ball = document.createElement('div');
        ball.classList.add('ball');
        ball.id = `ball-${i}`;
        ball.innerText = i;
        bingoBoard.appendChild(ball);
    }
}
generateBoardGrid();

socket.emit('create-room');
socket.on('room-created', (roomId) => {
    currentRoomId = roomId;
    document.getElementById('roomCode').innerText = roomId;
    
    const joinUrl = encodeURIComponent(`${window.location.origin}/mobile.html?room=${roomId}`);
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = `<img src="https://qrserver.com{joinUrl}&color=3d2314&bgcolor=fffdf6" alt="Scan to Play" width="150" height="150" />`;
});

document.getElementById('callBtn').addEventListener('click', () => {
    if (currentRoomId) socket.emit('draw-number', currentRoomId);
    document.getElementById('bingoAlert').style.display = 'none';
});

// Added Action Key Listeners to handle clearing active maps and sending data requests
document.getElementById('resetBtn').addEventListener('click', () => {
    if (currentRoomId && confirm("Are you sure you want to clear the board and start a new round?")) {
        socket.emit('reset-game', currentRoomId);
    }
});

socket.on('number-called', (data) => {
    playSound('draw');
    document.getElementById('currentBall').innerText = data.current;
    const activeBall = document.getElementById(`ball-${data.current}`);
    if (activeBall) activeBall.classList.add('called');
});

socket.on('bingo-claimed', (data) => {
    playSound('win');
    const alertBox = document.getElementById('bingoAlert');
    alertBox.innerText = `🎁 ${data.playerName.toUpperCase()} CLAIMS BINGO! 🎁`;
    alertBox.style.display = 'flex';
});

// Resets layout visibility and clears out tracking colors instantly
socket.on('game-was-reset', () => {
    document.getElementById('currentBall').innerText = '--';
    document.getElementById('bingoAlert').style.display = 'none';
    generateBoardGrid();
});
