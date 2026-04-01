# 🔗 LinkUp — Random Video Chat

A fully-featured random video chat platform similar to Omegle/Chatroulette, built with WebRTC + Socket.io.

## Features
- 📹 Live WebRTC peer-to-peer video chat
- 💬 Real-time text chat alongside video
- 🏷️ Interest tag matching
- 🌐 Language/country filter
- ⏭ Skip & ⏹ Stop controls
- 📊 Live online user count
- ⚑ Report & block system
- 📱 Fully mobile responsive
- 🌙 Dark modern UI

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Run the server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 3. Open in browser
```
http://localhost:3000
```

> **Note:** The frontend works standalone (opens `index.html` directly) in **Demo Mode** — it simulates partner matching without a real server. For real peer-to-peer video you need the Node.js server running.

## Architecture

```
index.html      → Landing page + Chat UI
style.css       → Dark modern UI styles
app.js          → WebRTC logic + Socket.io client
server.js       → Node.js signaling server (Socket.io)
```

### How WebRTC Matchmaking Works
1. User A clicks "Start Chatting" → joins waiting queue on server
2. User B clicks "Start Chatting" → server finds a match
3. Server sends `matched` event to both users
4. User A (initiator) creates an SDP offer → sends via Socket.io
5. User B receives offer → creates answer → sends back
6. ICE candidates exchanged via server
7. Direct P2P video connection established ✓

## Deployment

Deploy to any Node.js host (Railway, Render, Fly.io, Heroku):

```bash
# Set PORT env variable (default: 3000)
PORT=8080 npm start
```

For HTTPS (required for camera access on production):
- Use a reverse proxy (nginx) with SSL
- Or deploy to a platform that provides HTTPS automatically

## TURN Server (for NAT traversal)
For users behind strict firewalls, add TURN servers to `RTC_CONFIG` in `app.js`:

```javascript
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'user',
      credential: 'password'
    }
  ]
};
```

Free TURN services: Metered.ca, Xirsys, Twilio (paid)
