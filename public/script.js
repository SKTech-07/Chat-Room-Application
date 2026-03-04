const socket = io();

const joinDiv = document.getElementById('join-room');
const chatDiv = document.getElementById('chat-room');
const usernameInput = document.getElementById('username');
const roomInput = document.getElementById('room_code');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const messages = document.getElementById('messages');

let joined = false;
let currentUsername = null;
let currentRoom = null;
let loadingOlder = false;
let doneOlder = false;
const DOM_PRUNE_LIMIT = 1200; 

function joinRoom() {
  const username = usernameInput.value.trim();
  const roomCode = roomInput.value.trim();
  if (!username || !roomCode) {
    alert('Please enter both username and code word!');
    return;
  }
  currentUsername = username;
  currentRoom = roomCode;
  loadingOlder = false;
  doneOlder = false;
  socket.emit('join room', { username, roomCode });
}

document.getElementById('join-btn').addEventListener('click', joinRoom);
[usernameInput, roomInput].forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') joinRoom();
  });
});

socket.on('history', (hist) => {
  messages.innerHTML = '';
  (hist || []).forEach(m => renderMessage(m, false));
  messages.scrollTop = messages.scrollHeight;
});

socket.on('joined', (msg) => {
  if (joined) return;
  joined = true;
  alert(msg);
  joinDiv.style.display = 'none';
  chatDiv.style.display = 'block';
});

socket.on('error', (msg) => alert(msg));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const txt = input.value.trim();
  if (!txt) return;
  socket.emit('chat message', txt); 
  input.value = '';
});

socket.on('chat message', (msg) => {
  renderMessage(msg, false);
  scrollToBottom();
});

socket.on('older messages', ({ messages: olderMsgs, done }) => {
  loadingOlder = false;
  if (!olderMsgs || olderMsgs.length === 0) {
    if (done) doneOlder = true;
    return;
  }

  const prevScrollHeight = messages.scrollHeight;
  olderMsgs.forEach(m => renderMessage(m, true));
  const newScrollHeight = messages.scrollHeight;
  messages.scrollTop = newScrollHeight - prevScrollHeight;

  if (done) doneOlder = true;
});

messages.addEventListener('scroll', () => {
  if (!joined || !currentRoom) return;
  if (loadingOlder || doneOlder) return;
  if (messages.scrollTop <= 6) {
    requestOlder();
  }
});

function requestOlder() {
  if (loadingOlder || doneOlder) return;
  const firstLi = messages.querySelector('li[data-ts]');
  let beforeTs = null;
  if (firstLi) beforeTs = Number(firstLi.getAttribute('data-ts'));
  loadingOlder = true;
  socket.emit('load older', { roomCode: currentRoom, beforeTs, limit: 50 });
}

function renderMessage(m, prepend = false) {
  let msg = m;
  if (typeof m === 'string') {
    const idx = m.indexOf(':');
    if (idx === -1) msg = { sender: 'System', content: m, ts: Date.now() };
    else msg = { sender: m.slice(0, idx).trim(), content: m.slice(idx + 1).trim(), ts: Date.now() };
  }

  const li = document.createElement('li');
  li.classList.add('message');
  li.setAttribute('data-ts', msg.ts || Date.now());

  if (msg.sender === 'System') {
    li.classList.add('system');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.content;
    li.appendChild(bubble);
    insertLI(li, prepend);
    pruneIfNeeded();
    return;
  }

  const isMine = currentUsername && msg.sender === currentUsername;
  li.classList.add(isMine ? 'mine' : 'other');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (!isMine) {
    const senderDiv = document.createElement('div');
    senderDiv.className = 'msg-sender';
    senderDiv.textContent = msg.sender;
    bubble.appendChild(senderDiv);
  }

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = msg.content;
  bubble.appendChild(body);

  const ts = document.createElement('div');
  ts.className = 'msg-time';
  ts.textContent = new Date(msg.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  bubble.appendChild(ts);

  li.appendChild(bubble);
  insertLI(li, prepend);
  pruneIfNeeded();
}

function insertLI(li, prepend) {
  if (prepend) messages.insertBefore(li, messages.firstChild);
  else messages.appendChild(li);
}

function scrollToBottom() {
  const distanceFromBottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop;
  const nearBottom = distanceFromBottom < 120;
  if (nearBottom) messages.scrollTop = messages.scrollHeight;
}

function pruneIfNeeded() {
  const lis = messages.querySelectorAll('li');
  if (lis.length <= DOM_PRUNE_LIMIT) return;
  const removeCount = lis.length - Math.floor(DOM_PRUNE_LIMIT * 0.9);
  for (let i = 0; i < removeCount; i++) {
    const first = messages.querySelector('li');
    if (first) messages.removeChild(first);
  }
}

setInterval(() => socket.emit('ping'), 20000);