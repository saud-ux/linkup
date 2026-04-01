/**
 * LinkUp — Signaling Server
 * Node.js + Socket.io for WebRTC matchmaking
 *
 * Run: node server.js
 * Requires: npm install express socket.io
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
});

// Trust Railway's proxy
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// ============================================
// STATE
// ============================================

/** @type {Map<string, {id: string, tags: string[], language: string, mode: string, inRoom: boolean}>} */
const waitingUsers = new Map(); // socketId -> user data

/** @type {Map<string, {users: string[], createdAt: number}>} */
const rooms = new Map(); // roomId -> room data

/** @type {Map<string, string>} */
const userRooms = new Map(); // socketId -> roomId

/** @type {Set<string>} */
const reportedPairs = new Set();

// ============================================
// MATCHING LOGIC
// ============================================

function findMatch(socket, userData) {
  let bestMatch = null;
  let bestScore = -1;

  for (const [waitId, waitData] of waitingUsers.entries()) {
    if (waitId === socket.id) continue;
    if (waitData.mode !== userData.mode) continue;

    // Language match required if specified by either user
    if (userData.language && waitData.language && userData.language !== waitData.language) continue;

    // Calculate interest overlap score
    let score = 0;
    for (const tag of userData.tags) {
      if (waitData.tags.includes(tag)) score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { id: waitId, data: waitData };
    }
  }

  return bestMatch;
}

function createRoom(socket1Id, socket2Id) {
  const roomId = crypto.randomUUID();
  rooms.set(roomId, {
    users: [socket1Id, socket2Id],
    createdAt: Date.now(),
  });
  userRooms.set(socket1Id, roomId);
  userRooms.set(socket2Id, roomId);
  return roomId;
}

function broadcastOnlineCount() {
  io.emit('online-count', io.engine.clientsCount);
}

// ============================================
// SOCKET EVENTS
// ============================================

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id} (total: ${io.engine.clientsCount})`);
  broadcastOnlineCount();

  // ── Find partner ──
  socket.on('find-partner', (data) => {
    const userData = {
      id: socket.id,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 5) : [],
      language: data.language || '',
      mode: data.mode || 'video',
      inRoom: false,
    };

    // Remove from any existing room
    leaveCurrentRoom(socket);

    const match = findMatch(socket, userData);

    if (match) {
      // Remove matched user from waiting
      waitingUsers.delete(match.id);
      waitingUsers.delete(socket.id);

      // Create room
      const roomId = createRoom(socket.id, match.id);

      // Join socket.io rooms
      socket.join(roomId);
      io.sockets.sockets.get(match.id)?.join(roomId);

      console.log(`[~] Matched: ${socket.id} <-> ${match.id} (room: ${roomId})`);

      // Notify both — one is initiator (creates offer)
      io.to(socket.id).emit('matched', {
        roomId,
        initiator: true,
        partner: match.id,
      });
      io.to(match.id).emit('matched', {
        roomId,
        initiator: false,
        partner: socket.id,
      });
    } else {
      // Add to waiting queue
      waitingUsers.set(socket.id, userData);
      console.log(`[?] Waiting: ${socket.id} (queue: ${waitingUsers.size})`);
    }
  });

  // ── WebRTC Signaling ──
  socket.on('signal', ({ roomId, signal }) => {
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    // Forward to the other user in the room
    const partnerId = room.users.find(id => id !== socket.id);
    if (partnerId) {
      io.to(partnerId).emit('signal', { signal, from: socket.id });
    }
  });

  // ── Chat message ──
  socket.on('chat-message', ({ roomId, text }) => {
    if (!roomId || !text || typeof text !== 'string') return;
    const sanitized = text.trim().slice(0, 500);
    const room = rooms.get(roomId);
    if (!room) return;

    const partnerId = room.users.find(id => id !== socket.id);
    if (partnerId) {
      io.to(partnerId).emit('chat-message', { text: sanitized });
    }
  });

  // ── Skip ──
  socket.on('skip', ({ roomId }) => {
    leaveCurrentRoom(socket, roomId);
  });

  // ── Leave ──
  socket.on('leave', ({ roomId }) => {
    leaveCurrentRoom(socket, roomId);
  });

  // ── Report ──
  socket.on('report', ({ roomId, partnerId, reason }) => {
    console.log(`[!] Report: ${socket.id} reported ${partnerId} for "${reason}" in room ${roomId}`);
    // In production: store in DB, review, ban repeat offenders
    const pairKey = [socket.id, partnerId].sort().join(':');
    reportedPairs.add(pairKey);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    waitingUsers.delete(socket.id);
    leaveCurrentRoom(socket);
    broadcastOnlineCount();
  });
});

// ============================================
// HELPERS
// ============================================

function leaveCurrentRoom(socket, explicitRoomId) {
  const roomId = explicitRoomId || userRooms.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room) {
    // Notify partner
    const partnerId = room.users.find(id => id !== socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner-disconnected');
      // Remove partner from room tracking so they can rejoin queue
      userRooms.delete(partnerId);
    }
    rooms.delete(roomId);
  }

  userRooms.delete(socket.id);
  socket.leave(roomId);
}

// Cleanup stale waiting users every 30s
setInterval(() => {
  const now = Date.now();
  for (const [id] of waitingUsers.entries()) {
    const sock = io.sockets.sockets.get(id);
    if (!sock || !sock.connected) {
      waitingUsers.delete(id);
    }
  }
}, 30000);

// ============================================
// START
// ============================================
server.listen(PORT, () => {
  console.log(`\n🔗 LinkUp Signaling Server`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   WebRTC signaling ready\n`);
});

module.exports = { app, server, io };