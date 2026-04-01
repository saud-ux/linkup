/**
 * LinkUp — Video Chat App
 * Frontend: WebRTC + Socket.io signaling
 * Includes: interest tags, language filter, report, skip, stop, text chat
 */

'use strict';

// ============================================
// STATE
// ============================================
const state = {
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  socket: null,
  currentRoom: null,
  myId: null,
  partnerId: null,
  chatMode: 'video',
  tags: [],
  language: '',
  camEnabled: true,
  micEnabled: true,
  isSearching: false,
  isConnected: false,
  onlineCount: 1243,
};

// WebRTC config — using public STUN servers
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// ============================================
// DOM REFS
// ============================================
const $ = id => document.getElementById(id);
const dom = {
  termsModal: $('terms-modal'),
  acceptTermsBtn: $('accept-terms-btn'),
  landingPage: $('landing-page'),
  chatPage: $('chat-page'),
  startBtn: $('start-btn'),
  interestInput: $('interest-input'),
  tagsRow: $('tags-row'),
  tagChips: document.querySelectorAll('.tag-chip'),
  langFilter: $('lang-filter'),
  chatMode: $('chat-mode'),
  onlineCountNav: $('online-count-nav'),
  onlineCountChat: $('online-count-chat'),
  statOnline: $('stat-online'),
  localVideo: $('local-video'),
  remoteVideo: $('remote-video'),
  strangerOverlay: $('stranger-overlay'),
  overlayText: $('overlay-text'),
  liveBadge: $('live-badge'),
  strangerCountry: $('stranger-country'),
  statusText: $('status-text'),
  statusDot: document.querySelector('.status-dot'),
  skipBtn: $('skip-btn'),
  stopBtn: $('stop-btn'),
  endSessionBtn: $('end-session-btn'),
  chatInput: $('chat-input'),
  sendBtn: $('send-btn'),
  messagesArea: $('messages-area'),
  reportBtn: $('report-btn'),
  reportModal: $('report-modal'),
  cancelReport: $('cancel-report'),
  submitReport: $('submit-report'),
  tagsDisplay: $('tags-display'),
  toggleCam: $('toggle-cam'),
  toggleMic: $('toggle-mic'),
  toast: $('toast'),
  chatToggleBtn: $('chat-toggle-btn'),
  textChat: $('text-chat'),
  chatLayout: $('chat-layout'),
  videoArea: $('video-area'),
};

// ============================================
// UTILS
// ============================================
function showToast(msg, type = '') {
  dom.toast.textContent = msg;
  dom.toast.className = `toast ${type} show`;
  clearTimeout(dom.toast._timer);
  dom.toast._timer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 3000);
}

function setStatus(text, state_) {
  dom.statusText.textContent = text;
  dom.statusDot.className = 'status-dot';
  if (state_ === 'connected') dom.statusDot.classList.add('connected');
  if (state_ === 'searching') dom.statusDot.classList.add('searching');
}

function addMessage(text, type = 'system') {
  const div = document.createElement('div');
  if (type === 'system') {
    div.className = 'system-msg';
  } else {
    div.className = `message ${type}`;
  }
  div.textContent = text;
  dom.messagesArea.appendChild(div);
  dom.messagesArea.scrollTop = dom.messagesArea.scrollHeight;
}

function fmtCount(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toString();
}

function updateOnlineCount(n) {
  const fmt = n.toLocaleString();
  dom.onlineCountNav.textContent = fmt;
  dom.onlineCountChat.textContent = fmt;
  dom.statOnline.textContent = fmt;
}

// ============================================
// TERMS MODAL
// ============================================
dom.acceptTermsBtn.addEventListener('click', () => {
  dom.termsModal.classList.remove('active');
  setTimeout(() => {
    dom.termsModal.style.display = 'none';
    dom.landingPage.classList.remove('hidden');
    dom.landingPage.classList.add('visible');
  }, 300);
});

// ============================================
// INTEREST TAGS
// ============================================
dom.interestInput.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ',') && dom.interestInput.value.trim()) {
    e.preventDefault();
    addTag(dom.interestInput.value.trim().replace(/,/g, ''));
    dom.interestInput.value = '';
  }
  if (e.key === 'Backspace' && !dom.interestInput.value && state.tags.length) {
    removeTag(state.tags[state.tags.length - 1]);
  }
});

dom.tagChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const tag = chip.dataset.tag;
    if (!state.tags.includes(tag)) {
      addTag(tag);
      chip.classList.add('used');
    }
  });
});

function addTag(tag) {
  tag = tag.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (!tag || state.tags.includes(tag) || state.tags.length >= 5) return;
  state.tags.push(tag);

  const item = document.createElement('div');
  item.className = 'tag-item';
  item.dataset.tag = tag;
  item.innerHTML = `${tag} <span class="remove-tag" onclick="removeTag('${tag}')">✕</span>`;
  dom.tagsRow.insertBefore(item, dom.interestInput);

  // Mark chip as used
  dom.tagChips.forEach(c => { if (c.dataset.tag === tag) c.classList.add('used'); });
}

function removeTag(tag) {
  state.tags = state.tags.filter(t => t !== tag);
  const item = dom.tagsRow.querySelector(`[data-tag="${tag}"]`);
  if (item) item.remove();
  dom.tagChips.forEach(c => { if (c.dataset.tag === tag) c.classList.remove('used'); });
}

window.removeTag = removeTag;

// ============================================
// START SESSION
// ============================================
dom.startBtn.addEventListener('click', async () => {
  state.chatMode = dom.chatMode.value;
  state.language = dom.langFilter.value;

  dom.landingPage.classList.add('hidden');
  dom.chatPage.classList.remove('hidden');

  await initLocalMedia();
  initSocket();
  renderTagsDisplay();
});

async function initLocalMedia() {
  try {
    const constraints = state.chatMode === 'text'
      ? { video: false, audio: true }
      : { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true };

    state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    dom.localVideo.srcObject = state.localStream;

    if (state.chatMode === 'text') {
      dom.videoArea.style.display = 'none';
    }
  } catch (err) {
    console.warn('Camera/mic access denied:', err);
    showToast('⚠ Camera/mic not available — text only mode', 'error');
    dom.videoArea.style.display = 'none';
    state.chatMode = 'text';
  }
}

function renderTagsDisplay() {
  dom.tagsDisplay.innerHTML = '';
  state.tags.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'tag-item';
    chip.style.fontSize = '10px';
    chip.style.padding = '2px 8px';
    chip.textContent = t;
    dom.tagsDisplay.appendChild(chip);
  });
}

// ============================================
// SOCKET.IO SIGNALING
// ============================================
function initSocket() {
  try {
    state.socket = io(window.SIGNALING_SERVER || window.location.origin, {
      timeout: 10000,
      transports: ['websocket', 'polling'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    setupSocketEvents();
  } catch (e) {
    showServerError();
  }
}

function setupSocketEvents() {
  const socket = state.socket;

  socket.on('connect', () => {
    state.myId = socket.id;
    console.log('Connected to signaling server:', state.myId);
    findPartner();
  });

  socket.on('connect_error', () => {
    console.warn('Signaling server not available.');
    showServerError();
  });

  socket.on('online-count', count => {
    state.onlineCount = count;
    updateOnlineCount(count);
  });

  socket.on('matched', async ({ roomId, initiator, partner }) => {
    state.currentRoom = roomId;
    state.partnerId = partner;
    addMessage('🔗 Connected to a stranger!');
    setStatus('Connected', 'connected');
    dom.strangerOverlay.classList.add('hidden-overlay');
    dom.liveBadge.style.display = 'inline-flex';
    state.isConnected = true;

    await createPeerConnection(initiator);

    if (initiator) {
      const offer = await state.peerConnection.createOffer();
      await state.peerConnection.setLocalDescription(offer);
      socket.emit('signal', { roomId, signal: { type: 'offer', sdp: offer } });
    }
  });

  socket.on('signal', async ({ signal }) => {
    if (!state.peerConnection) return;
    try {
      if (signal.type === 'offer') {
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await state.peerConnection.createAnswer();
        await state.peerConnection.setLocalDescription(answer);
        socket.emit('signal', { roomId: state.currentRoom, signal: { type: 'answer', sdp: answer } });
      } else if (signal.type === 'answer') {
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'candidate') {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (e) {
      console.error('Signal error:', e);
    }
  });

  socket.on('partner-disconnected', () => {
    handlePartnerLeft();
  });

  socket.on('chat-message', ({ text }) => {
    addMessage(text, 'theirs');
  });
}

function findPartner() {
  setStatus('Searching…', 'searching');
  setOverlay(true, 'Finding someone…');
  state.isSearching = true;
  state.isConnected = false;

  if (state.socket && state.socket.connected) {
    state.socket.emit('find-partner', {
      tags: state.tags,
      language: state.language,
      mode: state.chatMode,
    });
  }
}

async function createPeerConnection(initiator) {
  cleanupPeerConnection();
  state.peerConnection = new RTCPeerConnection(RTC_CONFIG);

  // Add local tracks
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => {
      state.peerConnection.addTrack(track, state.localStream);
    });
  }

  // Remote stream
  state.remoteStream = new MediaStream();
  dom.remoteVideo.srcObject = state.remoteStream;

  state.peerConnection.ontrack = e => {
    e.streams[0]?.getTracks().forEach(track => state.remoteStream.addTrack(track));
  };

  state.peerConnection.onicecandidate = e => {
    if (e.candidate && state.socket) {
      state.socket.emit('signal', {
        roomId: state.currentRoom,
        signal: { type: 'candidate', candidate: e.candidate },
      });
    }
  };

  state.peerConnection.onconnectionstatechange = () => {
    const s = state.peerConnection.connectionState;
    console.log('PeerConnection state:', s);
    if (s === 'disconnected' || s === 'failed') handlePartnerLeft();
  };
}

function cleanupPeerConnection() {
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }
  dom.remoteVideo.srcObject = null;
  state.remoteStream = null;
}

function handlePartnerLeft() {
  if (!state.isConnected && !state.isSearching) return;
  state.isConnected = false;
  addMessage('👋 Stranger disconnected.');
  setStatus('Disconnected', '');
  dom.liveBadge.style.display = 'none';
  setOverlay(true, 'Stranger left. Finding next…');
  cleanupPeerConnection();

  // Auto-reconnect after 1.5s
  setTimeout(() => {
    if (state.socket && state.socket.connected) {
      findPartner();
    } else {
      showServerError();
    }
  }, 1500);
}

function setOverlay(show, text = '') {
  if (show) {
    dom.strangerOverlay.classList.remove('hidden-overlay');
    dom.overlayText.textContent = text;
    dom.liveBadge.style.display = 'none';
  } else {
    dom.strangerOverlay.classList.add('hidden-overlay');
    dom.liveBadge.style.display = 'inline-flex';
  }
}

// ============================================
// SERVER ERROR — no fake fallback, ever
// ============================================
function showServerError() {
  setStatus('Server offline', '');
  setOverlay(true, '');
  dom.overlayText.innerHTML = `
    <span style="font-size:32px">⚠️</span><br>
    <strong style="color:var(--text-primary);font-size:15px">Cannot connect to server</strong><br>
    <span style="font-size:12px;color:var(--text-muted);margin-top:6px;display:block">
      Please refresh the page and try again.
    </span>
  `;
  showToast('⚠ Cannot connect to server', 'error');
}

// ============================================
// SKIP / STOP
// ============================================
dom.skipBtn.addEventListener('click', skipPartner);
dom.stopBtn.addEventListener('click', stopSession);
dom.endSessionBtn.addEventListener('click', stopSession);

function skipPartner() {
  if (state.socket && state.socket.connected) {
    state.socket.emit('skip', { roomId: state.currentRoom });
  }
  addMessage('⏭ Skipped. Looking for next…');
  setStatus('Searching…', 'searching');
  setOverlay(true, 'Finding someone…');
  cleanupPeerConnection();
  dom.liveBadge.style.display = 'none';
  state.isConnected = false;
  dom.strangerCountry.textContent = 'Stranger';

  // Clear messages except first system msg
  const systemMsgs = dom.messagesArea.querySelectorAll('.system-msg');
  dom.messagesArea.innerHTML = '';
  addMessage('⏭ Finding next stranger…');

  if (state.socket && state.socket.connected) {
    setTimeout(findPartner, 500);
  } else {
    showServerError();
  }
}

function stopSession() {
  if (state.socket) {
    state.socket.emit('leave', { roomId: state.currentRoom });
    state.socket.disconnect();
  }
  cleanupPeerConnection();
  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
  }
  state.isConnected = false;
  state.isSearching = false;

  // Return to landing
  dom.chatPage.classList.add('hidden');
  dom.landingPage.classList.remove('hidden');
  dom.messagesArea.innerHTML = '<div class="system-msg">👋 You\'re connected. Say hello!</div>';
  dom.strangerCountry.textContent = 'Stranger';
  setOverlay(true, 'Finding someone…');
  showToast('Session ended', 'success');
}

// ============================================
// TEXT CHAT
// ============================================
dom.sendBtn.addEventListener('click', sendMessage);
dom.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text) return;

  addMessage(text, 'mine');
  dom.chatInput.value = '';

  if (state.socket && state.socket.connected && state.currentRoom) {
    state.socket.emit('chat-message', { roomId: state.currentRoom, text });
  }
}

// ============================================
// MEDIA CONTROLS
// ============================================
dom.toggleCam.addEventListener('click', () => {
  if (!state.localStream) return;
  const track = state.localStream.getVideoTracks()[0];
  if (!track) return;
  state.camEnabled = !state.camEnabled;
  track.enabled = state.camEnabled;
  dom.toggleCam.classList.toggle('muted', !state.camEnabled);
  dom.toggleCam.textContent = state.camEnabled ? '📷' : '🚫';
  showToast(state.camEnabled ? 'Camera on' : 'Camera off');
});

dom.toggleMic.addEventListener('click', () => {
  if (!state.localStream) return;
  const track = state.localStream.getAudioTracks()[0];
  if (!track) return;
  state.micEnabled = !state.micEnabled;
  track.enabled = state.micEnabled;
  dom.toggleMic.classList.toggle('muted', !state.micEnabled);
  dom.toggleMic.textContent = state.micEnabled ? '🎙️' : '🔇';
  showToast(state.micEnabled ? 'Mic on' : 'Mic muted');
});

// ============================================
// REPORT
// ============================================
dom.reportBtn.addEventListener('click', () => {
  dom.reportModal.classList.add('active');
});
dom.cancelReport.addEventListener('click', () => {
  dom.reportModal.classList.remove('active');
});
dom.submitReport.addEventListener('click', () => {
  const selected = document.querySelector('input[name="report"]:checked');
  if (!selected) {
    showToast('Please select a reason', 'error');
    return;
  }
  dom.reportModal.classList.remove('active');
  showToast('✓ Report submitted. Thank you.', 'success');

  if (state.socket && state.socket.connected) {
    state.socket.emit('report', {
      roomId: state.currentRoom,
      partnerId: state.partnerId,
      reason: selected.value,
    });
  }

  // Skip after report
  setTimeout(skipPartner, 800);
});

// ============================================
// ONLINE COUNT — real from server only
// ============================================
dom.onlineCountNav.textContent = '—';
dom.onlineCountChat.textContent = '—';
dom.statOnline.textContent = '—';

// ============================================
// CHAT TOGGLE
// ============================================
dom.chatToggleBtn.addEventListener('click', () => {
  dom.textChat.classList.toggle('open');
  dom.chatToggleBtn.style.background = dom.textChat.classList.contains('open')
    ? 'var(--accent)' : '';
  dom.chatToggleBtn.style.color = dom.textChat.classList.contains('open')
    ? '#000' : '';
});

// ============================================
// INIT
// ============================================
console.log('%cLinkUp 🔗 Ready — Real users only', 'color: #00e5ff; font-size: 16px; font-weight: bold;');