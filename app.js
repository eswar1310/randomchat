document.addEventListener('DOMContentLoaded', () => {
  // --- Country Mapping Data ---
  const countryMap = {
    'US': { flag: '🇺🇸', name: 'United States' },
    'JP': { flag: '🇯🇵', name: 'Japan' },
    'GB': { flag: '🇬🇧', name: 'United Kingdom' },
    'DE': { flag: '🇩🇪', name: 'Germany' },
    'FR': { flag: '🇫🇷', name: 'France' },
    'CA': { flag: '🇨🇦', name: 'Canada' },
    'BR': { flag: '🇧🇷', name: 'Brazil' },
    'IN': { flag: '🇮🇳', name: 'India' },
    'AU': { flag: '🇦🇺', name: 'Australia' },
    'ES': { flag: '🇪🇸', name: 'Spain' }
  };

  // --- State Variables ---
  let socket = null;
  let currentRoomId = null;
  let currentPeer = null; // { id, nickname, age, gender, country }
  let cachedActiveUsers = []; // Online users cache from server
  let renderedMessageIds = new Set();
  let typingTimeout = null;
  let autoTriggerAction = null; 
  
  // UX State Indicators
  let lastUserInteraction = Date.now();
  let unreadCount = 0;
  let connectionBannerTimeout = null;

  // --- DOM Elements ---
  const connectionBanner = document.getElementById('connection-banner');
  const connectionBannerText = document.getElementById('connection-banner-text');

  // Headers & Counters
  const onlineCounterEl = document.getElementById('online-counter');
  const userSessionBadge = document.getElementById('user-session-badge');
  const sessionAvatar = document.getElementById('session-avatar');
  const sessionDisplayName = document.getElementById('session-display-name');
  const btnDisconnectHeader = document.getElementById('btn-disconnect-header');

  // Page Content Views
  const guestHeroContent = document.getElementById('guest-hero-content');
  const lobbyHeroContent = document.getElementById('lobby-hero-content');
  const chatView = document.getElementById('chat-view');
  
  // Lobby Dashboard Info
  const lobbyUsername = document.getElementById('lobby-username');
  const sessionIdVal = document.getElementById('session-id-val');
  const sessionAgeGenderVal = document.getElementById('session-age-gender-val');
  const sessionCountryVal = document.getElementById('session-country-val');
  
  // Lobby Interactive Elements
  const btnLobbyStart = document.getElementById('btn-lobby-start');
  const btnLobbyDisconnect = document.getElementById('btn-lobby-disconnect');
  const btnStartChat = document.getElementById('btn-start-chat');
  const btnBrowseUsers = document.getElementById('btn-browse-users');

  // Lobby Users List Controls
  const lobbyOnlineCount = document.getElementById('lobby-online-count');
  const filterGender = document.getElementById('filter-gender');
  const filterCountry = document.getElementById('filter-country');
  const sortOrder = document.getElementById('sort-order');
  const lobbyUsersGrid = document.getElementById('lobby-users-grid');
  const lobbyEmptyState = document.getElementById('lobby-empty-state');
  const btnEmptyRetry = document.getElementById('btn-empty-retry');
  const btnEmptyQueue = document.getElementById('btn-empty-queue');

  // Modal: Entry Form
  const modalEntry = document.getElementById('modal-entry');
  const btnCloseEntry = document.getElementById('btn-close-entry');
  const entryForm = document.getElementById('entry-form');
  const entryNicknameInput = document.getElementById('entry-nickname');
  const entryAgeInput = document.getElementById('entry-age');
  const entryGenderSelect = document.getElementById('entry-gender');
  const entryCountrySelect = document.getElementById('entry-country');
  const entryErrorMsg = document.getElementById('entry-error-msg');

  // Modal: Matchmaker (Radar & Success Containers)
  const modalMatch = document.getElementById('modal-match');
  const btnCloseMatch = document.getElementById('btn-close-match');
  const searchingContainer = document.getElementById('searching-container');
  const matchSuccessContainer = document.getElementById('match-success-container');
  const matchSuccessName = document.getElementById('match-success-name');
  
  const matchStatusText = document.getElementById('match-status-text');
  const matchStatusTip = document.getElementById('match-status-tip');
  const btnCancelMatch = document.getElementById('btn-cancel-match');
  const matchStatsOnline = document.getElementById('match-stats-online');
  const matchStatsWaiting = document.getElementById('match-stats-waiting');

  // Footer / Legals
  const modalAbout = document.getElementById('modal-about');
  const modalPrivacy = document.getElementById('modal-privacy');
  const modalTerms = document.getElementById('modal-terms');
  
  const btnCloseAbout = document.getElementById('btn-close-about');
  const btnClosePrivacy = document.getElementById('btn-close-privacy');
  const btnCloseTerms = document.getElementById('btn-close-terms');

  const linkAbout = document.getElementById('link-about');
  const linkPrivacy = document.getElementById('link-privacy');
  const linkTerms = document.getElementById('link-terms');
  const logoLink = document.getElementById('logo-link');

  // Slide-in Invite Notification
  const inviteNotification = document.getElementById('invite-notification');
  const inviteAvatar = document.getElementById('invite-avatar');
  const inviteSenderName = document.getElementById('invite-sender-name');
  const btnInviteAccept = document.getElementById('btn-invite-accept');
  const btnInviteDecline = document.getElementById('btn-invite-decline');

  // Chat View Elements
  const chatPeerAvatar = document.getElementById('chat-peer-avatar');
  const chatPeerName = document.getElementById('chat-peer-name');
  const chatPeerFlag = document.getElementById('chat-peer-flag');
  const chatPeerMeta = document.getElementById('chat-peer-meta');
  const chatPeerStatusText = document.getElementById('chat-peer-status-text');
  
  const chatMessagesArea = document.getElementById('chat-messages-area');
  const chatTypingRow = document.getElementById('chat-typing-row');
  const chatTypingName = document.getElementById('chat-typing-name');
  
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatEmojiBtn = document.getElementById('chat-emoji-btn');
  
  const offlineOverlay = document.getElementById('offline-overlay');
  const offlineTitle = document.getElementById('offline-title');
  const offlineDesc = document.getElementById('offline-desc');
  const btnOfflineWait = document.getElementById('btn-offline-wait');
  const btnOfflineLobby = document.getElementById('btn-offline-lobby');
  const btnOfflineNext = document.getElementById('btn-offline-next');
  
  const btnChatBlock = document.getElementById('btn-chat-block');
  const btnChatReport = document.getElementById('btn-chat-report');
  const btnChatLeave = document.getElementById('btn-chat-leave');
  const btnChatNext = document.getElementById('btn-chat-next');

  const allModals = [modalEntry, modalMatch, modalAbout, modalPrivacy, modalTerms];

  // Blocked List
  let blockedUserIds = new Set();
  try {
    const loadedBlocks = localStorage.getItem('chatibb_blocked_users');
    if (loadedBlocks) {
      blockedUserIds = new Set(JSON.parse(loadedBlocks));
    }
  } catch (err) {}

  function saveBlockedUsers() {
    localStorage.setItem('chatibb_blocked_users', JSON.stringify(Array.from(blockedUserIds)));
  }

  // --- Sound Synthesizer Engine (Web Audio API) ---
  function playAlertSound(type = 'message') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      const audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      if (type === 'message') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.16);
      } else if (type === 'match') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440.00, audioCtx.currentTime); // A4
        osc.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.1); // C#5
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2); // E5
        osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.3); // A5
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.6);
      }
    } catch (e) {
      // Audio Context blocked by browser permission policies
    }
  }

  // --- Connection Status Monitor ---
  function updateConnectionStatus(status) {
    if (connectionBannerTimeout) clearTimeout(connectionBannerTimeout);
    
    connectionBanner.className = 'connection-banner active';
    
    if (status === 'connected') {
      connectionBanner.classList.add('connected');
      connectionBannerText.textContent = "✓ Connected";
      
      connectionBannerTimeout = setTimeout(() => {
        connectionBanner.classList.remove('active');
      }, 1500);
    } else if (status === 'reconnecting') {
      connectionBanner.classList.add('reconnecting');
      connectionBannerText.textContent = "⚡ Reconnecting to Chatibb...";
    } else if (status === 'disconnected') {
      connectionBanner.classList.add('disconnected');
      connectionBannerText.textContent = "⚠️ Internet disconnected.";
    }
  }

  window.addEventListener('online', () => {
    updateConnectionStatus('connected');
    const user = getCurrentUser();
    if (user && socket) {
      socket.emit('register-user', { ...user, blockedUsers: Array.from(blockedUserIds) });
    }
  });

  window.addEventListener('offline', () => {
    updateConnectionStatus('disconnected');
  });

  // --- Inactivity Monitor (Away State) ---
  function resetActivityTimer() {
    lastUserInteraction = Date.now();
    const currentUser = getCurrentUser();
    
    // Resume to lobby if user was Away
    if (currentUser && currentUser.status === 'away') {
      updateUserStatusInPool('lobby');
    }
  }

  window.addEventListener('mousemove', resetActivityTimer);
  window.addEventListener('keydown', resetActivityTimer);
  window.addEventListener('click', resetActivityTimer);

  function checkUserInactivity() {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.status !== 'lobby') return;

    const inactivityThreshold = 180000; // 3 minutes
    if (Date.now() - lastUserInteraction > inactivityThreshold) {
      updateUserStatusInPool('away');
    }
  }

  function updateUserStatusInPool(statusName) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    currentUser.status = statusName;
    saveCurrentUser(currentUser);

    if (socket && socket.connected) {
      socket.emit('update-status', statusName);
    }
    renderAppState();
  }

  // --- Document Title Focus Ticker ---
  window.addEventListener('focus', () => {
    unreadCount = 0;
    document.title = "Chatibb | Meet Real People Instantly - Anonymous Chat";
  });

  // --- Modal Helpers ---
  function openModal(modal) {
    closeAllModals();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modal) {
    modal.classList.remove('active');
    const activeModals = allModals.filter(m => m.classList.contains('active'));
    if (activeModals.length === 0) {
      document.body.style.overflow = '';
    }
  }

  function closeAllModals() {
    allModals.forEach(modal => modal.classList.remove('active'));
    document.body.style.overflow = '';
  }

  // --- Session storage actions ---
  function getCurrentUser() {
    try {
      const sessionStr = sessionStorage.getItem('chatibb_current_user');
      return sessionStr ? JSON.parse(sessionStr) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCurrentUser(userObj) {
    sessionStorage.setItem('chatibb_current_user', JSON.stringify(userObj));
  }

  function removeCurrentUser() {
    sessionStorage.removeItem('chatibb_current_user');
  }

  function generateUniqueId() {
    return 'usr_' + Math.random().toString(36).substring(2, 11);
  }

  // --- Socket.IO Hub Connection & Handling ---
  function initSocketConnection() {
    if (socket) return;

    socket = io();

    socket.on('connect', () => {
      updateConnectionStatus('connected');
      const currentUser = getCurrentUser();
      if (currentUser) {
        socket.emit('register-user', { ...currentUser, blockedUsers: Array.from(blockedUserIds) });
      }
    });

    socket.on('disconnect', () => {
      updateConnectionStatus('disconnected');
    });

    socket.on('connect_error', () => {
      updateConnectionStatus('disconnected');
    });

    socket.on('registered', ({ socketId }) => {
      const currentUser = getCurrentUser();
      if (currentUser) {
        currentUser.socketId = socketId;
        saveCurrentUser(currentUser);
        
        // Sync original status
        if (currentUser.status === 'matching') {
          socket.emit('join-matching', { blockedUsers: Array.from(blockedUserIds) });
        } else if (currentUser.status === 'chatting' && currentRoomId) {
          // Reconnecting back to chat is currently reset on server side to lobby
          currentUser.status = 'lobby';
          currentUser.roomId = null;
          saveCurrentUser(currentUser);
          renderAppState();
        }
      }
    });

    socket.on('registration-error', (msg) => {
      showEntryError(msg);
      removeCurrentUser();
      renderAppState();
      openModal(modalEntry);
    });

    socket.on('online-count-update', (count) => {
      updateOnlineCounters(count);
    });

    socket.on('lobby-users-update', (usersList) => {
      cachedActiveUsers = usersList;
      renderLobbyUsers();
      refreshMatchingScreenStats();
    });

    socket.on('match-found', ({ roomId, peer }) => {
      triggerMatchFoundScreen(roomId, peer);
    });

    socket.on('message-received', (msg) => {
      const currentUser = getCurrentUser();
      if (!currentUser) return;

      const isMe = msg.senderId === currentUser.id;
      if (!renderedMessageIds.has(msg.id)) {
        appendMessageBubble(msg.text, isMe, msg.timestamp);
        renderedMessageIds.add(msg.id);

        if (!isMe) {
          playAlertSound('message');
          if (document.hidden) {
            unreadCount++;
            document.title = `(${unreadCount}) New Message | Chatibb`;
          }
        }
      }
    });

    socket.on('peer-typing', ({ senderId, isTyping }) => {
      if (currentPeer && senderId === currentPeer.id) {
        if (isTyping) {
          chatTypingName.textContent = currentPeer.nickname;
          chatTypingRow.classList.remove('hidden');
        } else {
          chatTypingRow.classList.add('hidden');
        }
      }
    });

    socket.on('peer-left', () => {
      showOfflineView();
    });

    socket.on('direct-chat-started', ({ roomId, peer }) => {
      joinRoom(roomId, peer);
    });

    socket.on('direct-chat-failed', (msg) => {
      alert(msg);
    });

    socket.on('admin-warning', (text) => {
      playAlertSound('message');
      alert(`⚠️ Admin Warning: ${text}`);
      appendSystemMessage(`⚠️ Admin Warning: ${text}`);
    });

    socket.on('session-terminated', (text) => {
      alert(text);
      disconnectSession();
    });
  }

  // --- Lobby and Header users list ---
  function renderLobbyUsers() {
    if (!lobbyUsersGrid) return;

    const currentUser = getCurrentUser();

    // Renders all users except current profile
    let displayUsers = cachedActiveUsers.filter(u => !currentUser || u.id !== currentUser.id);

    // Apply Gender Filter
    const selectedGender = filterGender.value;
    if (selectedGender !== 'all') {
      displayUsers = displayUsers.filter(u => u.gender === selectedGender);
    }

    // Apply Country Filter
    const selectedCountry = filterCountry.value;
    if (selectedCountry !== 'all') {
      displayUsers = displayUsers.filter(u => u.country === selectedCountry);
    }

    // Apply Sorting
    const selectedSort = sortOrder.value;
    if (selectedSort === 'newest') {
      displayUsers.sort((a, b) => b.joinedAt - a.joinedAt);
    } else if (selectedSort === 'oldest') {
      displayUsers.sort((a, b) => a.joinedAt - b.joinedAt);
    }

    lobbyUsersGrid.innerHTML = '';
    
    if (displayUsers.length === 0) {
      lobbyEmptyState.classList.remove('hidden');
      lobbyUsersGrid.style.display = 'none';
      
      const tipText = lobbyEmptyState.querySelector('.empty-state-tip');
      const lobbyUserCount = cachedActiveUsers.filter(u => !currentUser || u.id !== currentUser.id).length;
      
      if (lobbyUserCount === 0) {
        tipText.textContent = "Waiting for other users to connect online...";
      } else {
        tipText.textContent = "No other users are currently online matching your filters.";
      }
    } else {
      lobbyEmptyState.classList.add('hidden');
      lobbyUsersGrid.style.display = 'grid';

      displayUsers.forEach(user => {
        const countryInfo = countryMap[user.country] || { flag: '🌐', name: user.country };
        const avatarColor = user.gender === 'Female' ? 'pink' : 'blue';

        let statusClass = 'status-online';
        let statusLabel = 'Online';
        let isBusy = false;

        if (user.status === 'matching') {
          statusClass = 'status-searching';
          statusLabel = 'Searching';
        } else if (user.status === 'chatting') {
          statusClass = 'status-chatting';
          statusLabel = 'In Chat';
          isBusy = true;
        } else if (user.status === 'away') {
          statusClass = 'status-away';
          statusLabel = 'Away';
        }

        const card = document.createElement('div');
        card.className = 'lobby-user-card';
        card.innerHTML = `
          <div class="lobby-user-top">
            <div class="lobby-user-avatar ${avatarColor}">
              ${user.nickname.charAt(0).toUpperCase()}
            </div>
            <div class="lobby-user-details">
              <h4 title="${user.nickname}">${user.nickname} <span title="${countryInfo.name}">${countryInfo.flag}</span></h4>
              <p>Age: ${user.age} • ${countryInfo.name}</p>
            </div>
          </div>
          <div class="lobby-user-meta">
            <span class="lobby-user-gender">${user.gender}</span>
            <span class="lobby-user-status ${statusClass}">${statusLabel}</span>
          </div>
          <button class="btn-chat-action" data-id="${user.id}" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? 'Busy' : (user.status === 'away' ? 'Away' : 'Chat')}
          </button>
        `;

        if (!isBusy) {
          card.querySelector('.btn-chat-action').addEventListener('click', () => {
            sendChatInvitation(user);
          });
        }

        lobbyUsersGrid.appendChild(card);
      });
    }
  }

  // --- Matching Queue Actions ---
  function enterMatchingQueue() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    searchingContainer.classList.remove('hidden');
    matchSuccessContainer.classList.add('hidden');

    currentUser.status = 'matching';
    currentUser.roomId = null;
    saveCurrentUser(currentUser);

    if (socket && socket.connected) {
      socket.emit('join-matching', { blockedUsers: Array.from(blockedUserIds) });
    }

    openModal(modalMatch);
    refreshMatchingScreenStats();
  }

  function exitMatchingQueue() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    currentUser.status = 'lobby';
    currentUser.roomId = null;
    saveCurrentUser(currentUser);

    if (socket && socket.connected) {
      socket.emit('cancel-matching');
    }

    closeModal(modalMatch);
  }

  function refreshMatchingScreenStats() {
    const waitingCount = cachedActiveUsers.filter(u => u.status === 'matching').length;

    matchStatsOnline.textContent = cachedActiveUsers.length;
    matchStatsWaiting.textContent = waitingCount;

    if (waitingCount <= 1) {
      matchStatusText.textContent = "Waiting for another user to come online...";
      matchStatusTip.textContent = "We connect real people only. Zero bot matches.";
    } else {
      matchStatusText.textContent = "Finding someone online...";
      matchStatusTip.textContent = "Verifying network connection to ensure 100% human match.";
    }
  }

  // Match success transition animation
  function triggerMatchFoundScreen(roomId, peerObj) {
    playAlertSound('match');

    searchingContainer.classList.add('hidden');
    matchSuccessName.textContent = peerObj.nickname;
    matchSuccessContainer.classList.remove('hidden');

    setTimeout(() => {
      closeModal(modalMatch);
      joinRoom(roomId, peerObj);
    }, 1600);
  }

  // --- Chat Setup & Lifecycle ---
  function joinRoom(roomId, peerObj) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    currentRoomId = roomId;
    currentPeer = peerObj;
    renderedMessageIds.clear();

    currentUser.status = 'chatting';
    currentUser.roomId = roomId;
    saveCurrentUser(currentUser);

    renderAppState();
    offlineOverlay.classList.add('hidden');
    chatPeerStatusText.classList.remove('offline');
    chatPeerStatusText.textContent = "Online";

    chatPeerName.textContent = peerObj.nickname;
    chatPeerAvatar.textContent = peerObj.nickname.charAt(0).toUpperCase();
    chatPeerAvatar.className = 'chat-peer-avatar ' + (peerObj.gender === 'Female' ? 'pink' : 'blue');
    chatPeerFlag.textContent = countryMap[peerObj.country]?.flag || '🌐';
    chatPeerMeta.textContent = `${peerObj.age} • ${peerObj.gender}`;

    chatMessagesArea.innerHTML = '';
    appendSystemMessage("Private secure chat established cleanly. Messages are temporary.");
  }

  function showOfflineView() {
    offlineTitle.textContent = "Your chat partner has disconnected";
    offlineDesc.textContent = "The connection to your partner was lost. You can find another person right now or safely return to the lobby.";
    offlineOverlay.classList.remove('hidden');
    chatPeerStatusText.classList.add('offline');
    chatPeerStatusText.textContent = "Offline";
  }

  function leaveChat(nextAction = 'lobby') {
    if (!currentRoomId) return;

    if (socket && socket.connected) {
      socket.emit('leave-chat', { roomId: currentRoomId, nextAction });
    }

    currentRoomId = null;
    currentPeer = null;
    chatInput.value = '';

    const currentUser = getCurrentUser();
    if (currentUser) {
      currentUser.status = nextAction === 'matching' ? 'matching' : 'lobby';
      currentUser.roomId = null;
      saveCurrentUser(currentUser);
    }

    if (nextAction === 'matching') {
      enterMatchingQueue();
    } else {
      renderAppState();
    }
  }

  // --- Real-time Messaging ---
  let lastMessageTimes = [];

  function sendTextMessage() {
    if (!currentRoomId) return;
    const text = chatInput.value.trim();
    if (!text) return;

    // Rate Limiting (Flood Spam Prevention)
    const now = Date.now();
    lastMessageTimes = lastMessageTimes.filter(t => now - t < 2000);
    if (lastMessageTimes.length >= 3) {
      alert("⚠️ Slow down! You are sending messages too fast.");
      return;
    }
    lastMessageTimes.push(now);

    if (socket && socket.connected) {
      socket.emit('send-message', { roomId: currentRoomId, text });
    }

    chatInput.value = '';
    clearTypingIndicator();
  }

  function appendMessageBubble(text, isMe, timestamp) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble ' + (isMe ? 'sent' : 'received');

    const formattedTime = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    bubble.innerHTML = `
      <span>${escapeHTML(text)}</span>
      <span class="msg-meta">${formattedTime}</span>
    `;

    chatMessagesArea.appendChild(bubble);
    scrollToBottom();
  }

  function appendSystemMessage(text) {
    const sysMsg = document.createElement('div');
    sysMsg.className = 'msg-system';
    sysMsg.textContent = text;
    chatMessagesArea.appendChild(sysMsg);
    scrollToBottom();
  }

  function scrollToBottom() {
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // --- Typing Indicator ---
  function broadcastTyping(isTyping) {
    if (!currentRoomId || !socket || !socket.connected) return;
    socket.emit('typing-status', { roomId: currentRoomId, isTyping });
  }

  function clearTypingIndicator() {
    broadcastTyping(false);
    if (typingTimeout) clearTimeout(typingTimeout);
  }

  chatInput.addEventListener('input', () => {
    broadcastTyping(true);

    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      broadcastTyping(false);
    }, 1500);
  });

  // Message Send actions
  chatSendBtn.addEventListener('click', sendTextMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendTextMessage();
    }
  });

  chatEmojiBtn.addEventListener('click', () => {
    const emojis = ["😊", "👋", "😂", "👍", "🔥", "🤔", "😮", "💖"];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    chatInput.value += randomEmoji;
    chatInput.focus();
  });

  // --- Disconnect / Logout state cleanups ---
  function disconnectSession() {
    const user = getCurrentUser();
    if (user) {
      if (currentRoomId) {
        leaveChat('lobby');
      }
      removeCurrentUser();
    }
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    closeAllModals();
    renderAppState();
  }

  btnLobbyDisconnect.addEventListener('click', disconnectSession);
  btnDisconnectHeader.addEventListener('click', disconnectSession);

  // Chat Actions
  btnChatLeave.addEventListener('click', () => {
    if (confirm("Are you sure you want to leave the conversation? Your chat history will be deleted.")) {
      leaveChat('lobby');
    }
  });

  btnChatNext.addEventListener('click', () => {
    leaveChat('matching');
  });

  btnChatBlock.addEventListener('click', () => {
    if (currentPeer && confirm(`Block ${currentPeer.nickname}? You will disconnect and no longer match with them.`)) {
      blockedUserIds.add(currentPeer.id);
      saveBlockedUsers();
      leaveChat('lobby');
      alert("User blocked successfully.");
    }
  });

  btnChatReport.addEventListener('click', () => {
    if (currentPeer && confirm(`Report ${currentPeer.nickname} for inappropriate behavior?`)) {
      if (socket && socket.connected) {
        socket.emit('report-user', {
          reportedId: currentPeer.id,
          reportedNickname: currentPeer.nickname,
          reason: 'Spam or Abusive behavior'
        });
      }

      blockedUserIds.add(currentPeer.id);
      saveBlockedUsers();
      leaveChat('lobby');
      alert("Thank you. The report has been sent to Chatibb operators.");
    }
  });

  // Offline Overlay controls
  if (btnOfflineWait) {
    btnOfflineWait.addEventListener('click', () => {
      offlineOverlay.classList.add('hidden');
    });
  }

  btnOfflineLobby.addEventListener('click', () => {
    leaveChat('lobby');
  });

  btnOfflineNext.addEventListener('click', () => {
    leaveChat('matching');
  });

  // --- Modal Button Bindings ---
  btnStartChat.addEventListener('click', () => {
    if (getCurrentUser()) {
      enterMatchingQueue();
    } else {
      autoTriggerAction = 'match';
      openModal(modalEntry);
    }
  });

  btnBrowseUsers.addEventListener('click', () => {
    if (getCurrentUser()) {
      window.scrollTo({ top: lobbyHeroContent.offsetTop - 20, behavior: 'smooth' });
    } else {
      autoTriggerAction = 'browse';
      openModal(modalEntry);
    }
  });

  btnLobbyStart.addEventListener('click', enterMatchingQueue);

  btnEmptyRetry.addEventListener('click', () => {
    renderLobbyUsers();
  });

  btnEmptyQueue.addEventListener('click', () => {
    enterMatchingQueue();
  });

  btnCloseMatch.addEventListener('click', () => {
    exitMatchingQueue();
  });

  btnCancelMatch.addEventListener('click', () => {
    exitMatchingQueue();
  });

  btnCloseEntry.addEventListener('click', () => {
    autoTriggerAction = null;
    closeModal(modalEntry);
  });

  // Entry Form Session Submission Handler
  entryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = entryNicknameInput.value.trim();
    const age = parseInt(entryAgeInput.value.trim(), 10);
    const gender = entryGenderSelect.value;
    const country = entryCountrySelect.value;

    if (!nickname || nickname.length < 3 || nickname.length > 20 || !/^[a-zA-Z0-9_\-\s]+$/.test(nickname)) {
      showEntryError("Nickname must be 3-20 characters (alphanumeric, spaces, or _ -).");
      return;
    }

    if (isNaN(age) || age < 18) {
      showEntryError("Chatibb is 18+ only.");
      return;
    }

    if (!gender || !country) {
      showEntryError("All fields are required.");
      return;
    }

    const userId = generateUniqueId();
    const userObj = {
      id: userId,
      nickname: nickname,
      age: age,
      gender: gender,
      country: country,
      status: 'lobby',
      joinedAt: Date.now(),
      lastActive: Date.now()
    };

    saveCurrentUser(userObj);
    initSocketConnection();
    
    // Clear form inputs
    entryNicknameInput.value = '';
    entryAgeInput.value = '';
    entryGenderSelect.value = '';
    entryCountrySelect.value = '';
    entryErrorMsg.classList.add('hidden');

    closeModal(modalEntry);
    renderAppState();

    if (autoTriggerAction === 'match') {
      enterMatchingQueue();
    } else if (autoTriggerAction === 'browse') {
      window.scrollTo({ top: lobbyHeroContent.offsetTop - 20, behavior: 'smooth' });
    }
    autoTriggerAction = null;
  });

  // Controls Event Listeners
  filterGender.addEventListener('change', renderLobbyUsers);
  filterCountry.addEventListener('change', renderLobbyUsers);
  sortOrder.addEventListener('change', renderLobbyUsers);

  // --- Helper Moderation and Sync Functions ---
  function showEntryError(msg) {
    entryErrorMsg.textContent = msg;
    entryErrorMsg.classList.remove('hidden');
  }

  // Heartbeat loop timer (now just for inactivity checks, no sync logic)
  setInterval(() => {
    checkUserInactivity();
  }, 1000);

  // --- Direct Chat Handler ---
  function sendChatInvitation(targetUser) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    if (socket && socket.connected) {
      socket.emit('start-direct-chat', { targetUserId: targetUser.id });
    }
  }

  function cancelMatchSimulation() {
    // Obsolete for direct instant chats
  }

  // --- Legal Modals ---
  linkAbout.addEventListener('click', (e) => { e.preventDefault(); openModal(modalAbout); });
  linkPrivacy.addEventListener('click', (e) => { e.preventDefault(); openModal(modalPrivacy); });
  linkTerms.addEventListener('click', (e) => { e.preventDefault(); openModal(modalTerms); });

  btnCloseAbout.addEventListener('click', () => closeModal(modalAbout));
  btnClosePrivacy.addEventListener('click', () => closeModal(modalPrivacy));
  btnCloseTerms.addEventListener('click', () => closeModal(modalTerms));

  logoLink.addEventListener('click', (e) => {
    e.preventDefault();
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelMatchSimulation();
      exitMatchingQueue();
      closeAllModals();
    }
  });

  allModals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cancelMatchSimulation();
        exitMatchingQueue();
        closeModal(modal);
      }
    });
  });

  function renderAppState() {
    const currentUser = getCurrentUser();

    if (!currentUser) {
      guestHeroContent.classList.remove('hidden');
      lobbyHeroContent.classList.add('hidden');
      chatView.classList.add('hidden');
      userSessionBadge.classList.add('hidden');
      return;
    }

    userSessionBadge.classList.remove('hidden');
    sessionAvatar.textContent = currentUser.nickname.charAt(0).toUpperCase();
    sessionAvatar.className = 'user-avatar-mini ' + (currentUser.gender === 'Female' ? 'pink' : 'blue');
    sessionDisplayName.textContent = currentUser.nickname;

    lobbyUsername.textContent = currentUser.nickname;
    sessionIdVal.textContent = currentUser.id;
    sessionAgeGenderVal.textContent = `${currentUser.age} / ${currentUser.gender}`;
    
    const countryInfo = countryMap[currentUser.country] || { flag: '🌐', name: currentUser.country };
    sessionCountryVal.textContent = `${countryInfo.flag} ${countryInfo.name}`;

    if (currentUser.status === 'chatting') {
      guestHeroContent.classList.add('hidden');
      lobbyHeroContent.classList.add('hidden');
      chatView.classList.remove('hidden');
    } else {
      guestHeroContent.classList.add('hidden');
      lobbyHeroContent.classList.remove('hidden');
      chatView.classList.add('hidden');
    }
  }

  function updateOnlineCounters(count) {
    if (onlineCounterEl) onlineCounterEl.textContent = count;
    if (lobbyOnlineCount) lobbyOnlineCount.textContent = count;
  }

  // --- Initialize App ---
  const initialUser = getCurrentUser();
  if (initialUser) {
    initSocketConnection();
  }
  renderAppState();
});
