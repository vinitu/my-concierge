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
const clearConversationButton = document.getElementById('clear-conversation-button');
const connectionStatus = document.getElementById('connection-status');
const connectionStatusLabel = document.getElementById('connection-status-label');
const sessionNameLabel = document.getElementById('session-name-label');
const maxComposerHeight = 180;
let thinkingTimer = null;
let thinkingMessage = null;

function resizeInput() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, maxComposerHeight)}px`;
}

function scrollMessagesToBottom() {
  messages.scrollTop = messages.scrollHeight;
  window.requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

function appendMessage(role, text) {
  const article = document.createElement('article');
  article.className = `message message-${role}`;
  article.textContent = text;
  messages.appendChild(article);
  scrollMessagesToBottom();
  return article;
}

function clearThinking() {
  if (thinkingTimer !== null) {
    window.clearTimeout(thinkingTimer);
    thinkingTimer = null;
  }

  if (thinkingMessage) {
    thinkingMessage.remove();
    thinkingMessage = null;
  }
}

function clearMessages() {
  clearThinking();
  messages.innerHTML = '';
  scrollMessagesToBottom();
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

function showThinking(seconds) {
  if (!thinkingMessage) {
    thinkingMessage = appendMessage('thinking', 'assistant is thinking...');
  }

  messages.appendChild(thinkingMessage);
  scrollMessagesToBottom();

  if (thinkingTimer !== null) {
    window.clearTimeout(thinkingTimer);
  }

  thinkingTimer = window.setTimeout(() => {
    clearThinking();
  }, Math.max(1, Number(seconds) || 1) * 1000);
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
  clearThinking();
  appendMessage('assistant', payload.message);
});

socket.on('assistant.thinking', (payload) => {
  showThinking(payload?.seconds);
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

clearConversationButton.addEventListener('click', async () => {
  clearConversationButton.disabled = true;

  try {
    const response = await fetch('/conversation', {
      method: 'DELETE',
    });

    if (!response.ok) {
      appendMessage('system', 'Failed to clear conversation');
      return;
    }

    clearMessages();
  } catch {
    appendMessage('system', 'Failed to clear conversation');
  } finally {
    clearConversationButton.disabled = false;
  }
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
scrollMessagesToBottom();
resizeInput();
