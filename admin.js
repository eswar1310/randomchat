document.addEventListener('DOMContentLoaded', () => {
  // --- State & DOM Elements ---
  let socket = null;
  
  const loginOverlay = document.getElementById('admin-login-overlay');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const loginForm = document.getElementById('admin-login-form');
  const usernameInput = document.getElementById('admin-username');
  const passwordInput = document.getElementById('admin-password');
  
  const dashboardContainer = document.getElementById('admin-dashboard-container');
  const btnLogout = document.getElementById('btn-admin-logout');
  const tabTitle = document.getElementById('tab-title');
  const clockEl = document.getElementById('admin-clock');

  // Stats Card Elements
  const statOnlineUsers = document.getElementById('stat-online-users');
  const statActiveChats = document.getElementById('stat-active-chats');
  const statMatchingQueue = document.getElementById('stat-matching-queue');
  const statPendingReports = document.getElementById('stat-pending-reports');
  const banCountVal = document.getElementById('ban-count-val');

  // Tables Tbodys
  const usersTbody = document.getElementById('users-tbody');
  const chatsTbody = document.getElementById('chats-tbody');
  const reportsTbody = document.getElementById('reports-tbody');
  const auditTbody = document.getElementById('audit-tbody');

  // Modal Detailed View
  const modalUserDetails = document.getElementById('modal-user-details');
  const btnCloseDetails = document.getElementById('btn-close-details');
  const userDetailsBody = document.getElementById('user-details-body');

  const navButtons = document.querySelectorAll('.nav-btn');
  const tabSections = document.querySelectorAll('.tab-section');

  let activeTab = 'overview';

  // Local state caches
  let onlineUsers = [];
  let activeChats = [];
  let reportsList = [];
  let bansList = [];
  let auditLogs = [];

  // --- Clock Ticker ---
  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // --- Socket.IO Event Setup ---
  function initSocket() {
    if (socket) return;
    
    socket = io();

    socket.on('connect', () => {
      // Re-login automatically if already marked logged in
      if (sessionStorage.getItem('chatibb_admin_logged_in') === 'true') {
        // Simple mock bypass or we store password in sessionStorage (transient)
        // Since it's a lite dashboard, we can just login with credentials or ask them to login again if they reload.
        // Let's store password in sessionStorage temporarily so auto-reconnect works.
        const cachedCreds = sessionStorage.getItem('chatibb_admin_creds');
        if (cachedCreds) {
          try {
            const { username, password } = JSON.parse(cachedCreds);
            socket.emit('admin-login', { username, password });
          } catch(e) {}
        }
      }
    });

    socket.on('admin-auth-success', () => {
      sessionStorage.setItem('chatibb_admin_logged_in', 'true');
      showDashboard();
    });

    socket.on('admin-auth-failed', () => {
      loginErrorMsg.classList.remove('hidden');
      passwordInput.value = '';
      sessionStorage.removeItem('chatibb_admin_logged_in');
      sessionStorage.removeItem('chatibb_admin_creds');
      hideDashboard();
    });

    socket.on('dashboard-stats', (stats) => {
      statOnlineUsers.textContent = stats.onlineUsers;
      statActiveChats.textContent = stats.activeChats;
      statMatchingQueue.textContent = stats.matchingQueue;
      statPendingReports.textContent = stats.pendingReports;
      banCountVal.textContent = stats.bansCount;
    });

    socket.on('online-users-list', (users) => {
      onlineUsers = users;
      if (activeTab === 'users') {
        renderOnlineUsersTable();
      }
    });

    socket.on('active-chats-list', (chats) => {
      activeChats = chats;
      if (activeTab === 'chats') {
        renderActiveChatsTable();
      }
    });

    socket.on('reports-list', (reports) => {
      reportsList = reports;
      if (activeTab === 'reports') {
        renderReportsTable();
      }
    });

    socket.on('bans-list', (bans) => {
      bansList = bans;
    });

    socket.on('audit-logs-list', (logs) => {
      auditLogs = logs;
      if (activeTab === 'audit') {
        renderAuditLog();
      }
    });

    socket.on('disconnect', () => {
      // Offline indicators if needed
    });
  }

  // --- Secure Admin Authentication Gate ---
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    initSocket();
    socket.emit('admin-login', { username, password });
    
    // Save transiently to handle reconnects
    sessionStorage.setItem('chatibb_admin_creds', JSON.stringify({ username, password }));
  });

  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('chatibb_admin_logged_in');
    sessionStorage.removeItem('chatibb_admin_creds');
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    hideDashboard();
  });

  function checkAuth() {
    if (sessionStorage.getItem('chatibb_admin_logged_in') === 'true') {
      initSocket();
      showDashboard();
    } else {
      hideDashboard();
    }
  }

  function showDashboard() {
    loginOverlay.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');
    loginErrorMsg.classList.add('hidden');
    usernameInput.value = '';
    passwordInput.value = '';
  }

  function hideDashboard() {
    loginOverlay.classList.remove('hidden');
    dashboardContainer.classList.add('hidden');
  }

  // --- Navigation Controls ---
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-tab');
      activeTab = targetTab;

      tabSections.forEach(section => section.classList.add('hidden'));
      document.getElementById(`tab-${targetTab}`).classList.remove('hidden');

      const tabNames = {
        'overview': 'Dashboard Overview',
        'users': 'Online Users Monitor',
        'chats': 'Active Chats Monitor',
        'reports': 'Reports Panel',
        'audit': 'Audit Log'
      };
      tabTitle.textContent = tabNames[targetTab] || 'Dashboard';
      
      // Refresh active view table
      if (targetTab === 'users') renderOnlineUsersTable();
      if (targetTab === 'chats') renderActiveChatsTable();
      if (targetTab === 'reports') renderReportsTable();
      if (targetTab === 'audit') renderAuditLog();
    });
  });

  // --- Render Tables ---
  const countryFlags = {
    'US': '🇺🇸', 'JP': '🇯🇵', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷',
    'CA': '🇨🇦', 'BR': '🇧🇷', 'IN': '🇮🇳', 'AU': '🇦🇺', 'ES': '🇪🇸'
  };

  function renderOnlineUsersTable() {
    usersTbody.innerHTML = '';

    if (onlineUsers.length === 0) {
      usersTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No users are currently online.</td></tr>`;
      return;
    }

    onlineUsers.forEach(user => {
      const flag = countryFlags[user.country] || '🌐';

      let statusDotClass = 'online';
      let statusLabel = 'Online';
      if (user.status === 'matching') {
        statusDotClass = 'searching';
        statusLabel = 'Searching';
      } else if (user.status === 'chatting') {
        statusDotClass = 'chatting';
        statusLabel = 'In Chat';
      } else if (user.status === 'away') {
        statusDotClass = 'away';
        statusLabel = 'Away';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="admin-avatar" style="width: 32px; height: 32px; font-size: 0.8rem; background: ${user.gender === 'Female' ? 'rgba(236,72,153,0.15)' : 'rgba(59,130,246,0.15)'}; border: 1px solid ${user.gender === 'Female' ? 'rgba(236,72,153,0.3)' : 'rgba(59,130,246,0.3)'}; color: ${user.gender === 'Female' ? 'var(--pink-glow)' : 'var(--blue-glow)'}; border-radius: 8px; box-shadow: none;">
              ${user.nickname.charAt(0).toUpperCase()}
            </div>
            <strong>${escapeHTML(user.nickname)}</strong>
          </div>
        </td>
        <td style="font-family: monospace; font-size: 0.8rem;">${user.id}</td>
        <td>${user.age} • ${user.gender}</td>
        <td>${flag} ${user.country}</td>
        <td>
          <span class="status-badge ${statusDotClass}">
            <span class="status-dot ${statusDotClass}"></span>
            ${statusLabel}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn btn-sm btn-primary" onclick="viewUserDetails('${user.id}')">Details</button>
            <button class="btn btn-sm btn-danger-outline" onclick="disconnectUser('${user.id}', '${escapeQuote(user.nickname)}')">Disconnect</button>
            <select class="action-select" onchange="banUser('${user.id}', '${escapeQuote(user.nickname)}', this)">
              <option value="" disabled selected>Ban User</option>
              <option value="1">1 Hour Ban</option>
              <option value="24">24 Hour Ban</option>
              <option value="168">7 Day Ban</option>
            </select>
          </div>
        </td>
      `;
      usersTbody.appendChild(tr);
    });
  }

  function renderActiveChatsTable() {
    chatsTbody.innerHTML = '';

    if (activeChats.length === 0) {
      chatsTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No active chat sessions.</td></tr>`;
      return;
    }

    activeChats.forEach(room => {
      const duration = parseRoomDuration(room.id);
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 0.8rem;">${room.id}</td>
        <td>
          <strong>${escapeHTML(room.user1Name)}</strong>
          <span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace; display:block;">ID: ${room.user1Id}</span>
        </td>
        <td>
          <strong>${escapeHTML(room.user2Name)}</strong>
          <span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace; display:block;">ID: ${room.user2Id}</span>
        </td>
        <td style="font-variant-numeric: tabular-nums;">${duration}</td>
        <td>
          <button class="btn btn-sm btn-danger-outline" onclick="disconnectChatSession('${room.id}')">Terminate Chat</button>
        </td>
      `;
      chatsTbody.appendChild(tr);
    });
  }

  function renderReportsTable() {
    reportsTbody.innerHTML = '';

    if (reportsList.length === 0) {
      reportsTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No user reports submitted today.</td></tr>`;
      return;
    }

    reportsList.forEach(report => {
      const timeStr = new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${escapeHTML(report.reportedNickname)}</strong>
          <span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace; display:block;">ID: ${report.reportedId}</span>
        </td>
        <td>
          <strong>${escapeHTML(report.reporterName)}</strong>
          <span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace; display:block;">ID: ${report.reporterId}</span>
        </td>
        <td><span class="info-badge blue">${escapeHTML(report.reason)}</span></td>
        <td style="font-variant-numeric: tabular-nums;">${timeStr}</td>
        <td>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn btn-sm btn-primary" onclick="warnUser('${report.reportedId}', '${escapeQuote(report.reportedNickname)}', '${report.id}')">Warn</button>
            <button class="btn btn-sm btn-danger-outline" onclick="dismissReport('${report.id}', '${escapeQuote(report.reportedNickname)}')">Ignore</button>
            <button class="btn btn-sm btn-danger-outline" style="background: rgba(239, 68, 68, 0.2);" onclick="disconnectUser('${report.reportedId}', '${escapeQuote(report.reportedNickname)}', '${report.id}')">Disconnect</button>
            <select class="action-select" onchange="banUser('${report.reportedId}', '${escapeQuote(report.reportedNickname)}', this, '${report.id}')">
              <option value="" disabled selected>Ban</option>
              <option value="1">1 Hr</option>
              <option value="24">24 Hr</option>
              <option value="168">7 Day</option>
            </select>
          </div>
        </td>
      `;
      reportsTbody.appendChild(tr);
    });
  }

  function renderAuditLog() {
    auditTbody.innerHTML = '';

    if (auditLogs.length === 0) {
      auditTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Audit log empty.</td></tr>`;
      return;
    }

    const reversedLog = [...auditLogs].reverse();
    reversedLog.forEach(entry => {
      const timeStr = new Date(entry.timestamp).toLocaleString();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-variant-numeric: tabular-nums; font-size: 0.8rem; color: var(--text-muted);">${timeStr}</td>
        <td><strong>${escapeHTML(entry.action)}</strong></td>
        <td><span class="info-badge green" style="text-transform:uppercase; font-size:0.7rem; font-weight:800;">${escapeHTML(entry.admin)}</span></td>
      `;
      auditTbody.appendChild(tr);
    });
  }

  // --- Parse Room Durations relative to timestamps encoded in roomId ---
  function parseRoomDuration(roomId) {
    const parts = roomId.split('_');
    if (parts.length >= 3) {
      const ts = parseInt(parts[2], 10);
      if (!isNaN(ts)) {
        const diffSec = Math.floor((Date.now() - ts) / 1000);
        const mins = Math.floor(diffSec / 60);
        const secs = diffSec % 60;
        return `${mins}m ${secs}s`;
      }
    }
    return '0m 0s';
  }

  // --- Modal Connections Detailed View ---
  window.viewUserDetails = function(userId) {
    const user = onlineUsers.find(u => u.id === userId);
    
    if (!user) {
      alert("User is no longer online.");
      return;
    }

    const flag = countryFlags[user.country] || '🌐';
    const flagName = countryFlags[user.country] ? user.country : 'Unknown';
    const joinedTime = new Date(user.joinedAt).toLocaleTimeString();
    const activeTime = new Date(user.lastActive).toLocaleTimeString();

    userDetailsBody.innerHTML = `
      <div class="meta-info-list">
        <div class="meta-item">
          <span class="meta-label">User Nickname:</span>
          <span class="meta-value">${escapeHTML(user.nickname)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Temporary User ID:</span>
          <span class="meta-value" style="font-family: monospace;">${user.id}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Session Metadata:</span>
          <span class="meta-value">${user.age} years old • ${user.gender}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Country:</span>
          <span class="meta-value">${flag} ${flagName}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Session State:</span>
          <span class="meta-value" style="text-transform: uppercase;">${user.status}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Connection Established:</span>
          <span class="meta-value" style="font-variant-numeric: tabular-nums;">${joinedTime}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Last Heartbeat Ping:</span>
          <span class="meta-value" style="font-variant-numeric: tabular-nums;">${activeTime}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Room Association:</span>
          <span class="meta-value" style="font-family: monospace;">${user.roomId || 'None'}</span>
        </div>
      </div>
    `;

    modalUserDetails.classList.add('active');
  };

  btnCloseDetails.addEventListener('click', () => {
    modalUserDetails.classList.remove('active');
  });

  modalUserDetails.addEventListener('click', (e) => {
    if (e.target === modalUserDetails) {
      modalUserDetails.classList.remove('active');
    }
  });

  // --- Moderation Action Broadcast methods ---
  
  // 1. Force Disconnect user session
  window.disconnectUser = function(userId, nickname, reportId = null) {
    if (!confirm(`Are you sure you want to disconnect ${nickname}'s session?`)) return;

    if (socket && socket.connected) {
      socket.emit('admin-disconnect-user', { userId, nickname });
      if (reportId) {
        socket.emit('admin-dismiss-report', { reportId, reportedNickname: nickname });
      }
    }
  };

  // 2. Warn User
  window.warnUser = function(userId, nickname, reportId = null) {
    const warningText = prompt(`Enter system moderation warning to display to ${nickname}:`, "Please keep conversations friendly and respectful.");
    if (warningText === null) return;
    if (!warningText.trim()) {
      alert("Warning text cannot be empty.");
      return;
    }

    if (socket && socket.connected) {
      socket.emit('admin-warn-user', { userId, nickname, warningText: warningText.trim() });
      if (reportId) {
        socket.emit('admin-dismiss-report', { reportId, reportedNickname: nickname });
      }
      alert(`System warning broadcast sent to ${nickname}.`);
    }
  };

  // 3. Ban User nickname temporarily
  window.banUser = function(userId, nickname, selectEl, reportId = null) {
    const hours = parseInt(selectEl.value, 10);
    if (isNaN(hours)) return;

    if (!confirm(`Are you sure you want to ban ${nickname} for ${hours} hours? This will terminate their current session.`)) {
      selectEl.value = '';
      return;
    }

    if (socket && socket.connected) {
      socket.emit('admin-ban-user', { userId, nickname, hours });
      if (reportId) {
        socket.emit('admin-dismiss-report', { reportId, reportedNickname: nickname });
      }
    }

    selectEl.value = '';
  };

  // 4. Terminate active chat session
  window.disconnectChatSession = function(roomId) {
    if (!confirm("Are you sure you want to forcefully terminate this chat session? Both users will be returned to the lobby.")) return;

    if (socket && socket.connected) {
      socket.emit('admin-terminate-chat', { roomId });
    }
  };

  // 5. Dismiss/Ignore submitted reports
  window.dismissReport = function(reportId, reportedNickname) {
    if (!confirm(`Ignore report against ${reportedNickname}?`)) return;

    if (socket && socket.connected) {
      socket.emit('admin-dismiss-report', { reportId, reportedNickname });
    }
  };

  // --- HTML Escaping Utilities ---
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  function escapeQuote(str) {
    return str.replace(/'/g, "\\'");
  }

  // Check auth initial status
  checkAuth();
});
