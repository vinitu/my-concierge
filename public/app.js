const bootstrap = window.__MYCONCIERGE_BOOTSTRAP__ ?? {
  history: [],
  sessionId: 'unknown',
};
const sessionId = bootstrap.sessionId;
const socket = io({
  auth: {
    sessionId,
  },
  path: '/ws',
  transports: ['websocket'],
});

const messages = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const connectionStatus = document.getElementById('connection-status');
const connectionStatusLabel = document.getElementById('connection-status-label');
const sessionNameLabel = document.getElementById('session-name-label');
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

socket.on('session.ready', (payload) => {
  if (payload?.sessionId) {
    sessionNameLabel.textContent = payload.sessionId;
  }
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
sessionNameLabel.textContent = sessionId;
for (const entry of bootstrap.history) {
  appendMessage(entry.role, entry.content);
}
resizeInput();
