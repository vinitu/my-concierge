const socket = io({
  path: '/ws',
  transports: ['websocket'],
});

const messages = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const connectionStatus = document.getElementById('connection-status');
const connectionStatusLabel = document.getElementById('connection-status-label');
const maxComposerHeight = 180;

function resizeInput() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, maxComposerHeight)}px`;
}

function appendMessage(role, text) {
  const article = document.createElement('article');
  article.className = `message message-${role}`;
  article.textContent = text;
  messages.appendChild(article);
  messages.scrollTop = messages.scrollHeight;
}

function setConnectionStatus(status) {
  connectionStatus.classList.remove(
    'status-connected',
    'status-connecting',
    'status-disconnected',
  );
  connectionStatus.classList.add(`status-${status}`);
  connectionStatusLabel.textContent = status;
}

socket.on('connect', () => {
  setConnectionStatus('connected');
});

socket.on('connect_error', () => {
  setConnectionStatus('disconnected');
  appendMessage('system', 'WebSocket connection failed');
});

socket.on('disconnect', () => {
  setConnectionStatus('disconnected');
});

socket.on('assistant.message', (payload) => {
  appendMessage('assistant', payload.message);
});

socket.on('assistant.error', (payload) => {
  appendMessage('system', payload.message);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) {
    return;
  }

  appendMessage('user', message);
  socket.emit('chat.message', { message });
  input.value = '';
  resizeInput();
  input.focus();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener('input', () => {
  resizeInput();
});

setConnectionStatus('connecting');
resizeInput();
