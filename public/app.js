const bootstrap = window.__MYCONCIERGE_BOOTSTRAP__ ?? {
  conversationId: 'unknown',
  history: [],
  userId: 'unknown',
};
const userId = bootstrap.userId;
let conversationId = bootstrap.conversationId;
const appBasePath = window.location.pathname.startsWith('/gateway-web')
  ? '/gateway-web'
  : '';
let socket = null;

const messages = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const clearConversationButton = document.getElementById('clear-conversation-button');
const connectionStatus = document.getElementById('connection-status');
const connectionStatusLabel = document.getElementById('connection-status-label');
const userIdLabel = document.getElementById('user-id-label');
const conversationIdLabel = document.getElementById('conversation-id-label');
const maxComposerHeight = 180;
let thinkingTimer = null;
let thinkingMessage = null;
let lastToolEventSignature = null;
const pendingRunFrames = new Map();
const RUN_FLUSH_DELAY_MS = 60;

function resizeInput() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, maxComposerHeight)}px`;
}

function scrollMessagesToBottom() {
  const scroll = () => {
    messages.scrollTop = messages.scrollHeight;
    messages.scrollTo({
      top: messages.scrollHeight,
      behavior: 'auto',
    });

    if (messages.lastElementChild instanceof HTMLElement) {
      messages.lastElementChild.scrollIntoView({
        block: 'end',
        inline: 'nearest',
      });
    }
  };

  scroll();
  window.requestAnimationFrame(scroll);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(scroll);
  });
  window.setTimeout(scroll, 0);
}

function appendMessage(role, text) {
  const article = document.createElement('article');
  article.className = `message message-${role}`;
  article.textContent = text;
  messages.appendChild(article);
  scrollMessagesToBottom();
  return article;
}

function appendToolEventMessage(text) {
  const normalized = String(text ?? '').trim();
  if (!normalized) {
    return null;
  }

  if (lastToolEventSignature === normalized) {
    return null;
  }

  lastToolEventSignature = normalized;
  return appendMessage('system', normalized);
}

function isFailureMessage(text) {
  const normalized = String(text ?? '').toLowerCase();
  return (
    normalized.includes('assistant-orchestrator failed while processing the message') ||
    normalized.includes('run failed') ||
    normalized.includes('tool is disabled') ||
    normalized.includes('provider_error') ||
    normalized.includes('persistence_error')
  );
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
  lastToolEventSignature = null;
  pendingRunFrames.clear();
  messages.innerHTML = '';
  scrollMessagesToBottom();
}

function flushPendingRun(requestId) {
  const frame = pendingRunFrames.get(requestId);
  if (!frame) {
    return;
  }

  pendingRunFrames.delete(requestId);
  const items = frame.items.slice().sort((left, right) => left.sequence - right.sequence);
  for (const item of items) {
    item.render();
  }
}

function queueRunRender(requestId, sequence, render) {
  if (typeof requestId !== 'string' || !requestId.trim() || !Number.isFinite(sequence)) {
    render();
    return;
  }

  const normalizedRequestId = requestId.trim();
  const normalizedSequence = Math.floor(sequence);
  const current = pendingRunFrames.get(normalizedRequestId) ?? { items: [], timer: null };

  if (current.timer !== null) {
    window.clearTimeout(current.timer);
  }

  current.items.push({
    render,
    sequence: normalizedSequence,
  });
  current.timer = window.setTimeout(() => {
    flushPendingRun(normalizedRequestId);
  }, RUN_FLUSH_DELAY_MS);
  pendingRunFrames.set(normalizedRequestId, current);
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

function connectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.close();
  }

  socket = io({
    auth: {
      conversationId,
    },
    path: `${appBasePath}/ws`,
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    setConnectionStatus('connected');
  });

  socket.on('conversation.ready', (payload) => {
    if (payload?.conversationId) {
      conversationId = payload.conversationId;
      conversationIdLabel.textContent = conversationId;
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
    lastToolEventSignature = null;
    queueRunRender(payload?.request_id, payload?.sequence, () => {
      if (isFailureMessage(payload?.message)) {
        appendMessage('error', payload.message);
        return;
      }
      appendMessage('assistant', payload.message);
    });
  });

  socket.on('assistant.thinking', (payload) => {
    showThinking(payload?.seconds);
  });

  socket.on('assistant.error', (payload) => {
    clearThinking();
    lastToolEventSignature = null;
    queueRunRender(payload?.request_id, payload?.sequence, () => {
      appendMessage('error', payload.message);
    });
  });

  socket.on('assistant.event', (payload) => {
    const type = typeof payload?.type === 'string' ? payload.type : 'assistant.event';

    if (type.startsWith('tool.')) {
      const toolPayload =
        typeof payload?.payload === 'object' && payload.payload !== null ? payload.payload : {};
      const toolName =
        typeof toolPayload.tool_name === 'string' && toolPayload.tool_name.trim().length > 0
          ? toolPayload.tool_name
          : type.split('.')[1] || 'unknown_tool';
      const message =
        typeof payload?.message === 'string' && payload.message.trim().length > 0
          ? payload.message.trim()
          : type.endsWith('.ok')
            ? `Executed ${toolName}.`
            : type.endsWith('.failed')
              ? `Failed ${toolName}.`
              : `Tool event: ${toolName}.`;
      queueRunRender(payload?.request_id, payload?.sequence, () => {
        appendToolEventMessage(message);
      });
      return;
    }

    lastToolEventSignature = null;
    const message =
      typeof payload?.message === 'string' && payload.message.trim().length > 0
        ? payload.message
        : JSON.stringify(payload?.payload ?? {});
    appendMessage('system', `[${type}] ${message}`);
  });
}

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
    const response = await fetch(`${appBasePath}/conversation`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      appendMessage('system', 'Failed to clear conversation');
      return;
    }

    const payload = await response.json();
    if (payload?.conversation_id) {
      conversationId = payload.conversation_id;
      conversationIdLabel.textContent = conversationId;
      connectSocket();
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
userIdLabel.textContent = userId;
conversationIdLabel.textContent = conversationId;
connectSocket();
for (const entry of bootstrap.history) {
  appendMessage(entry.role, entry.content);
}
scrollMessagesToBottom();
resizeInput();
