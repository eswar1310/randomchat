const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static assets from the current directory
app.use(express.static(__dirname));

// In-Memory Transient State (No DB required for anonymous ephemeral chat)
const onlineUsers = new Map(); // socket.id -> user details
const activeRooms = new Map(); // room.id -> room details
const matchingQueue = new Set(); // socket.ids of users waiting to match
const reports = []; // pending admin reports
const temporaryBans = new Map(); // nickname (lowercase) -> expiry time
const auditLog = []; // list of admin actions

// Admin Credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
let activeAdmins = new Set(); // socket.ids of logged-in admins

// Utility: Clean up expired bans
function clearExpiredBans() {
  const now = Date.now();
  for (const [nickname, expiry] of temporaryBans.entries()) {
    if (expiry <= now) {
      temporaryBans.delete(nickname);
    }
  }
}

// Utility: Log Admin Action
function logAdminAction(action) {
  auditLog.push({
    timestamp: Date.now(),
    action,
    admin: 'admin'
  });
  broadcastToAdmins('audit-logs-list', auditLog);
}

// Utility: Broadcast updates to admins
function broadcastToAdmins(event, data) {
  activeAdmins.forEach(adminSocketId => {
    io.to(adminSocketId).emit(event, data);
  });
}

function updateAdminDashboard() {
  clearExpiredBans();
  
  const usersArray = Array.from(onlineUsers.values());
  const roomsArray = Array.from(activeRooms.values()).map(r => ({
    id: r.id,
    user1Id: r.user1.id,
    user1Name: r.user1.nickname,
    user2Id: r.user2.id,
    user2Name: r.user2.nickname,
  }));
  const bansArray = Array.from(temporaryBans.entries()).map(([nickname, expiresAt]) => ({
    nickname,
    expiresAt
  }));

  broadcastToAdmins('dashboard-stats', {
    onlineUsers: usersArray.length,
    activeChats: roomsArray.length,
    matchingQueue: Array.from(matchingQueue).map(sid => onlineUsers.get(sid)).filter(Boolean).length,
    pendingReports: reports.length,
    bansCount: bansArray.length
  });

  broadcastToAdmins('online-users-list', usersArray);
  broadcastToAdmins('active-chats-list', roomsArray);
  broadcastToAdmins('reports-list', reports);
  broadcastToAdmins('bans-list', bansArray);
}

// Utility: Broadcast lobby states to users
function broadcastLobbyState() {
  const usersArray = Array.from(onlineUsers.values());
  // Emit global user count to everyone
  io.emit('online-count-update', usersArray.length);
  // Emit active users list specifically to users in 'lobby' or 'away' status
  io.emit('lobby-users-update', usersArray);
}

// Core Matching Coordinator
function runMatchingCoordinator() {
  if (matchingQueue.size < 2) return;

  const queueArray = Array.from(matchingQueue);
  
  for (let i = 0; i < queueArray.length; i++) {
    const socketId1 = queueArray[i];
    const user1 = onlineUsers.get(socketId1);
    if (!user1 || user1.status !== 'matching') continue;

    for (let j = i + 1; j < queueArray.length; j++) {
      const socketId2 = queueArray[j];
      const user2 = onlineUsers.get(socketId2);
      if (!user2 || user2.status !== 'matching') continue;

      // Check blocks / report status if tracking blocklists on user
      // We will read the client-side block list, or just pair them up directly.
      // (For absolute reliability, let's pair them up, but we can verify neither has blocked the other's user id if passed).
      const blocked1 = user1.blockedUsers || [];
      const blocked2 = user2.blockedUsers || [];
      if (blocked1.includes(user2.id) || blocked2.includes(user1.id)) {
        continue;
      }

      // Match Found!
      matchingQueue.delete(socketId1);
      matchingQueue.delete(socketId2);

      const roomId = `room_match_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      user1.status = 'chatting';
      user1.roomId = roomId;
      user2.status = 'chatting';
      user2.roomId = roomId;

      // Create server-side room
      activeRooms.set(roomId, {
        id: roomId,
        user1: { ...user1, socketId: socketId1 },
        user2: { ...user2, socketId: socketId2 },
        messages: [],
        createdAt: Date.now()
      });

      // Join sockets to room
      const s1 = io.sockets.sockets.get(socketId1);
      const s2 = io.sockets.sockets.get(socketId2);
      
      if (s1) s1.join(roomId);
      if (s2) s2.join(roomId);

      // Emit to both
      io.to(socketId1).emit('match-found', { roomId, peer: user2 });
      io.to(socketId2).emit('match-found', { roomId, peer: user1 });

      break;
    }
  }

  broadcastLobbyState();
  updateAdminDashboard();
}

// Socket Connections
io.on('connection', (socket) => {
  // Check if client is admin
  let isAdmin = false;

  socket.on('register-user', (userPayload) => {
    // Check if user nickname is temporarily banned
    clearExpiredBans();
    const bannedExpiry = temporaryBans.get(userPayload.nickname.toLowerCase());
    if (bannedExpiry && bannedExpiry > Date.now()) {
      socket.emit('registration-error', `This nickname is suspended. Try again later.`);
      return;
    }

    // Register user metadata
    onlineUsers.set(socket.id, {
      ...userPayload,
      socketId: socket.id,
      joinedAt: userPayload.joinedAt || Date.now(),
      lastActive: Date.now(),
      blockedUsers: userPayload.blockedUsers || []
    });

    socket.emit('registered', { socketId: socket.id });
    broadcastLobbyState();
    updateAdminDashboard();
  });

  socket.on('update-status', (newStatus) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    user.status = newStatus;
    user.lastActive = Date.now();

    if (newStatus !== 'matching') {
      matchingQueue.delete(socket.id);
    }

    broadcastLobbyState();
    updateAdminDashboard();
  });

  socket.on('join-matching', (data = {}) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    user.status = 'matching';
    user.roomId = null;
    user.blockedUsers = data.blockedUsers || [];
    matchingQueue.add(socket.id);

    broadcastLobbyState();
    updateAdminDashboard();

    // Trigger match engine
    runMatchingCoordinator();
  });

  socket.on('cancel-matching', () => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    user.status = 'lobby';
    matchingQueue.delete(socket.id);

    broadcastLobbyState();
    updateAdminDashboard();
  });

  socket.on('send-message', ({ roomId, text }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || !roomId) return;

    const room = activeRooms.get(roomId);
    if (!room) return;

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: user.id,
      senderName: user.nickname,
      text: text,
      timestamp: Date.now()
    };

    room.messages.push(message);

    // Relay to sockets in room
    io.to(roomId).emit('message-received', message);
  });

  socket.on('typing-status', ({ roomId, isTyping }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || !roomId) return;

    socket.to(roomId).emit('peer-typing', { senderId: user.id, isTyping });
  });

  socket.on('leave-chat', ({ roomId, nextAction = 'lobby' }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || !roomId) return;

    const room = activeRooms.get(roomId);
    if (room) {
      // Notify peer that other user left
      socket.to(roomId).emit('peer-left');
      
      // Remove room & sockets leave channel
      const s1 = io.sockets.sockets.get(room.user1.socketId);
      const s2 = io.sockets.sockets.get(room.user2.socketId);
      if (s1) s1.leave(roomId);
      if (s2) s2.leave(roomId);

      activeRooms.delete(roomId);
    }

    user.status = nextAction === 'matching' ? 'matching' : 'lobby';
    user.roomId = null;

    if (nextAction === 'matching') {
      user.status = 'matching';
      matchingQueue.add(socket.id);
      broadcastLobbyState();
      updateAdminDashboard();
      runMatchingCoordinator();
    } else {
      broadcastLobbyState();
      updateAdminDashboard();
    }
  });

  // Direct Invitations Setup
  socket.on('send-invite', ({ targetUserId }) => {
    const sender = onlineUsers.get(socket.id);
    if (!sender) return;

    // Find target user socket
    let targetSocketId = null;
    let targetUser = null;
    for (const [sid, user] of onlineUsers.entries()) {
      if (user.id === targetUserId) {
        targetSocketId = sid;
        targetUser = user;
        break;
      }
    }

    if (targetSocketId && targetUser && targetUser.status === 'lobby') {
      const roomId = `room_direct_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      io.to(targetSocketId).emit('incoming-invite', {
        id: inviteId,
        senderId: sender.id,
        senderName: sender.nickname,
        senderAge: sender.age,
        senderGender: sender.gender,
        senderCountry: sender.country,
        roomId: roomId
      });

      // Keep sender updated
      socket.emit('invite-sent', { inviteId, targetUserId, roomId });
    } else {
      socket.emit('invite-failed', "User is unavailable or offline.");
    }
  });

  socket.on('respond-invite', ({ inviteId, senderId, status, roomId }) => {
    const responder = onlineUsers.get(socket.id);
    if (!responder) return;

    // Find sender socket ID
    let senderSocketId = null;
    for (const [sid, user] of onlineUsers.entries()) {
      if (user.id === senderId) {
        senderSocketId = sid;
        break;
      }
    }

    if (status === 'accepted') {
      const sender = onlineUsers.get(senderSocketId);
      if (sender && sender.status === 'lobby' && responder.status === 'lobby') {
        sender.status = 'chatting';
        sender.roomId = roomId;
        responder.status = 'chatting';
        responder.roomId = roomId;

        activeRooms.set(roomId, {
          id: roomId,
          user1: { ...sender, socketId: senderSocketId },
          user2: { ...responder, socketId: socket.id },
          messages: [],
          createdAt: Date.now()
        });

        const s1 = io.sockets.sockets.get(senderSocketId);
        if (s1) s1.join(roomId);
        socket.join(roomId);

        io.to(senderSocketId).emit('invite-response', { inviteId, status: 'accepted', peer: responder });
        socket.emit('invite-response', { inviteId, status: 'accepted', peer: sender });

        broadcastLobbyState();
        updateAdminDashboard();
      } else {
        socket.emit('invite-failed', "Sender is no longer available.");
        if (senderSocketId) {
          io.to(senderSocketId).emit('invite-failed', "Session established failed.");
        }
      }
    } else {
      if (senderSocketId) {
        io.to(senderSocketId).emit('invite-response', { inviteId, status: 'declined' });
      }
    }
  });

  // Client Reports User
  socket.on('report-user', ({ reportedId, reportedNickname, reason }) => {
    const sender = onlineUsers.get(socket.id);
    const report = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      reportedId,
      reportedNickname,
      reporterId: sender ? sender.id : 'anonymous',
      reporterName: sender ? sender.nickname : 'anonymous',
      reason,
      timestamp: Date.now()
    };

    reports.push(report);
    updateAdminDashboard();
  });

  // --- Administrator Channels ---
  socket.on('admin-login', ({ username, password }) => {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      isAdmin = true;
      activeAdmins.add(socket.id);
      socket.emit('admin-auth-success');
      
      // Send initial data sets
      socket.emit('audit-logs-list', auditLog);
      updateAdminDashboard();
    } else {
      socket.emit('admin-auth-failed');
    }
  });

  // Admin: Force Disconnect User
  socket.on('admin-disconnect-user', ({ userId, nickname }) => {
    if (!isAdmin) return;

    let targetSocketId = null;
    for (const [sid, user] of onlineUsers.entries()) {
      if (user.id === userId) {
        targetSocketId = sid;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('session-terminated', "Your session was terminated by an administrator.");
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.disconnect(true);
      }
    }

    logAdminAction(`Disconnected user: ${nickname} (ID: ${userId})`);
    updateAdminDashboard();
  });

  // Admin: Warn User
  socket.on('admin-warn-user', ({ userId, nickname, warningText }) => {
    if (!isAdmin) return;

    let targetSocketId = null;
    for (const [sid, user] of onlineUsers.entries()) {
      if (user.id === userId) {
        targetSocketId = sid;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('admin-warning', warningText);
    }

    logAdminAction(`Sent warning to ${nickname} (ID: ${userId}): "${warningText}"`);
  });

  // Admin: Ban User Nickname
  socket.on('admin-ban-user', ({ userId, nickname, hours }) => {
    if (!isAdmin) return;

    const expiryTime = Date.now() + (hours * 60 * 60 * 1000);
    temporaryBans.set(nickname.toLowerCase(), expiryTime);

    // Disconnect user session if they are currently online
    let targetSocketId = null;
    for (const [sid, user] of onlineUsers.entries()) {
      if (user.id === userId) {
        targetSocketId = sid;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('session-terminated', `Your nickname has been temporarily banned for ${hours} hours.`);
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.disconnect(true);
      }
    }

    logAdminAction(`Banned ${nickname} (ID: ${userId}) for ${hours} hours.`);
    updateAdminDashboard();
  });

  // Admin: Terminate Chat Room
  socket.on('admin-terminate-chat', ({ roomId }) => {
    if (!isAdmin) return;

    const room = activeRooms.get(roomId);
    if (room) {
      io.to(roomId).emit('session-terminated', "This chat was forcefully terminated by an administrator.");
      
      const s1 = io.sockets.sockets.get(room.user1.socketId);
      const s2 = io.sockets.sockets.get(room.user2.socketId);
      if (s1) {
        s1.leave(roomId);
        const u1 = onlineUsers.get(room.user1.socketId);
        if (u1) {
          u1.roomId = null;
          u1.status = 'lobby';
        }
      }
      if (s2) {
        s2.leave(roomId);
        const u2 = onlineUsers.get(room.user2.socketId);
        if (u2) {
          u2.roomId = null;
          u2.status = 'lobby';
        }
      }

      activeRooms.delete(roomId);
      broadcastLobbyState();
    }

    logAdminAction(`Terminated chat room: ${roomId}`);
    updateAdminDashboard();
  });

  // Admin: Dismiss Report
  socket.on('admin-dismiss-report', ({ reportId, reportedNickname }) => {
    if (!isAdmin) return;

    const reportIndex = reports.findIndex(r => r.id === reportId);
    if (reportIndex !== -1) {
      reports.splice(reportIndex, 1);
    }

    logAdminAction(`Dismissed report against ${reportedNickname}`);
    updateAdminDashboard();
  });

  // Disconnections
  socket.on('disconnect', () => {
    if (isAdmin) {
      activeAdmins.delete(socket.id);
      return;
    }

    const user = onlineUsers.get(socket.id);
    if (!user) return;

    // Remove from matching queue
    matchingQueue.delete(socket.id);

    // If in chat, notify peer
    if (user.roomId) {
      const room = activeRooms.get(user.roomId);
      if (room) {
        socket.to(user.roomId).emit('peer-left');
        
        // Remove room
        const peerSocketId = room.user1.socketId === socket.id ? room.user2.socketId : room.user1.socketId;
        const peerSocket = io.sockets.sockets.get(peerSocketId);
        if (peerSocket) peerSocket.leave(user.roomId);

        const peerUser = onlineUsers.get(peerSocketId);
        if (peerUser) {
          peerUser.status = 'lobby';
          peerUser.roomId = null;
        }

        activeRooms.delete(user.roomId);
      }
    }

    onlineUsers.delete(socket.id);
    
    broadcastLobbyState();
    updateAdminDashboard();
  });
});

server.listen(PORT, () => {
  console.log(`Chatibb server running in real-time mode on port ${PORT}`);
});
