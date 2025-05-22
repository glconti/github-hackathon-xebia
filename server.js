const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const games = [];

function createEmptyBoard() {
  return Array.from({ length: 10 }, () => Array(10).fill(0));
}

function placeShipsRandomly(board) {
  // Für Demo: 1 Schiff mit Länge 4, 2 Schiffe mit Länge 3
  const ships = [4, 3, 3];
  for (const len of ships) {
    let placed = false;
    while (!placed) {
      const dir = Math.random() < 0.5 ? 'H' : 'V';
      const x = Math.floor(Math.random() * (dir === 'H' ? 10 - len : 10));
      const y = Math.floor(Math.random() * (dir === 'V' ? 10 - len : 10));
      let fits = true;
      for (let i = 0; i < len; i++) {
        if (board[y + (dir === 'V' ? i : 0)][x + (dir === 'H' ? i : 0)] !== 0) {
          fits = false;
          break;
        }
      }
      if (fits) {
        for (let i = 0; i < len; i++) {
          board[y + (dir === 'V' ? i : 0)][x + (dir === 'H' ? i : 0)] = 1;
        }
        placed = true;
      }
    }
  }
}

function getOpponent(game, ws) {
  return game.players.find(p => p !== ws);
}

function checkGameOver(board) {
  return board.flat().filter(x => x === 1).length === 0;
}

wss.on('connection', (ws) => {
  // Spieler zu Spiel zuweisen
  let game = games.find(g => g.players.length === 1);
  if (!game) {
    game = { players: [], boards: {}, hits: {}, turn: 0 };
    games.push(game);
  }
  game.players.push(ws);
  const playerIndex = game.players.length - 1;
  game.boards[playerIndex] = createEmptyBoard();
  placeShipsRandomly(game.boards[playerIndex]);
  game.hits[playerIndex] = createEmptyBoard();

  ws.send(JSON.stringify({ type: 'info', message: 'Warte auf zweiten Spieler...' }));
  if (game.players.length === 2) {
    game.players.forEach((p, idx) => {
      p.send(JSON.stringify({ type: 'start', yourTurn: idx === game.turn }));
    });
  }

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    if (data.type === 'shot' && game.players.length === 2) {
      if (game.players[game.turn] !== ws) return;
      const opponentIdx = 1 - game.turn;
      const { x, y } = data;
      if (game.hits[game.turn][y][x] !== 0) return;
      const hit = game.boards[opponentIdx][y][x] === 1;
      game.hits[game.turn][y][x] = hit ? 2 : 3;
      if (hit) game.boards[opponentIdx][y][x] = 2;
      // Antwort an beide Spieler
      game.players.forEach((p, idx) => {
        p.send(JSON.stringify({
          type: 'shotResult',
          x, y,
          hit,
          yourTurn: idx === (hit ? game.turn : 1 - game.turn),
          board: game.hits[idx],
        }));
      });
      // Sieg prüfen
      if (checkGameOver(game.boards[opponentIdx])) {
        game.players[game.turn].send(JSON.stringify({ type: 'gameover', win: true }));
        game.players[opponentIdx].send(JSON.stringify({ type: 'gameover', win: false }));
      } else if (!hit) {
        game.turn = 1 - game.turn;
      }
    }
  });

  ws.on('close', () => {
    // Spiel entfernen, falls ein Spieler geht
    game.players.forEach(p => {
      if (p !== ws && p.readyState === WebSocket.OPEN) {
        p.send(JSON.stringify({ type: 'info', message: 'Gegner hat das Spiel verlassen.' }));
      }
    });
    game.players = game.players.filter(p => p !== ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
