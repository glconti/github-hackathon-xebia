const statusDiv = document.getElementById('status');
const ws = new WebSocket(`ws://${window.location.host}`);

ws.onopen = () => {
  statusDiv.textContent = 'Verbunden! Warte auf weiteren Spieler...';
};

let yourTurn = false;
let board = Array.from({ length: 10 }, () => Array(10).fill(0));
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      ctx.strokeStyle = '#64748b';
      ctx.strokeRect(x * 30, y * 30, 30, 30);
      if (board[y][x] === 2) {
        ctx.fillStyle = 'red';
        ctx.fillRect(x * 30 + 5, y * 30 + 5, 20, 20);
      } else if (board[y][x] === 3) {
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(x * 30 + 15, y * 30 + 15, 8, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
}

drawBoard();

canvas.addEventListener('click', (e) => {
  if (!yourTurn) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / 30);
  const y = Math.floor((e.clientY - rect.top) / 30);
  if (x < 0 || x > 9 || y < 0 || y > 9) return;
  if (board[y][x] !== 0) return;
  ws.send(JSON.stringify({ type: 'shot', x, y }));
});

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'info') {
    statusDiv.textContent = data.message;
  } else if (data.type === 'start') {
    yourTurn = data.yourTurn;
    statusDiv.textContent = yourTurn ? 'Du bist am Zug!' : 'Gegner ist am Zug...';
    board = Array.from({ length: 10 }, () => Array(10).fill(0));
    drawBoard();
  } else if (data.type === 'shotResult') {
    yourTurn = data.yourTurn;
    statusDiv.textContent = yourTurn ? 'Du bist am Zug!' : 'Gegner ist am Zug...';
    board = data.board;
    drawBoard();
  } else if (data.type === 'gameover') {
    statusDiv.textContent = data.win ? 'Du hast gewonnen!' : 'Du hast verloren!';
    yourTurn = false;
  }
};

ws.onclose = () => {
  statusDiv.textContent = 'Verbindung getrennt.';
};
