const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const ROOM_HISTORY_LIMIT = 500;
const roomHistory = new Map();

io.on('connection', (socket) => {
  socket.on('join room', ({ username, roomCode }) => {
    if (!username || !roomCode) {
      socket.emit('error', 'Username and code word are required!');
      return;
    }
    socket.username = username;
    socket.roomCode = roomCode;
    socket.join(roomCode);

    const hist = roomHistory.get(roomCode) || [];
    const CHUNK = 50;
    const recent = hist.slice(Math.max(0, hist.length - CHUNK));
    socket.emit('history', recent);

    const joinMsg = { sender: 'System', content: `${username} joined the room`, ts: Date.now() };
    appendToHistory(roomCode, joinMsg);
    socket.to(roomCode).emit('chat message', joinMsg);

    socket.emit('joined', `You joined the room: ${roomCode}`);
  });

  socket.on('chat message', (text) => {
    const username = socket.username;
    const roomCode = socket.roomCode;
    if (!username || !roomCode) {
      socket.emit('error', 'You must join a room first!');
      return;
    }
    const msg = { sender: username, content: String(text).slice(0, 5000), ts: Date.now() };
    appendToHistory(roomCode, msg);
    io.to(roomCode).emit('chat message', msg);
  });

  socket.on('load older', ({ roomCode, beforeTs, limit = 50 }) => {
    const hist = roomHistory.get(roomCode) || [];
    if (hist.length === 0) {
      socket.emit('older messages', { messages: [], done: true });
      return;
    }
 
    let idx;
    if (!beforeTs) {
      idx = hist.length;
    } else {
      idx = hist.findIndex(m => m.ts >= beforeTs);
      if (idx === -1) {
        idx = hist.length;
      }
    }
    const end = Math.max(0, idx); 
    const start = Math.max(0, end - limit);
    const slice = hist.slice(start, end); 
    const done = start === 0; 
    socket.emit('older messages', { messages: slice, done });
  });

  socket.on('disconnect', () => {
    const username = socket.username;
    const roomCode = socket.roomCode;
    if (username && roomCode) {
      const leftMsg = { sender: 'System', content: `${username} left the room`, ts: Date.now() };
      appendToHistory(roomCode, leftMsg);
      socket.to(roomCode).emit('chat message', leftMsg);
    }
  });

  socket.on('ping', () => socket.emit('pong'));
});

function appendToHistory(roomCode, msgObj) {
  const arr = roomHistory.get(roomCode) || [];
  arr.push(msgObj);
  if (arr.length > ROOM_HISTORY_LIMIT) arr.splice(0, arr.length - ROOM_HISTORY_LIMIT);
  roomHistory.set(roomCode, arr);
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
