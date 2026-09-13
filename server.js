require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET";

app.use(cors());
app.use(express.json());

/*
  =========================================
  PRO LIVE VOICE CHAT BACKEND
  =========================================

  Features:
  - Health check
  - User register/login demo API
  - JWT authentication
  - Voice room create/join/leave
  - WebSocket realtime room signaling
  - Realtime chat
  - Online user list
*/

const users = new Map();
const rooms = new Map();
const sockets = new Map();

/* -----------------------------
   BASIC ROUTES
------------------------------ */

app.get("/", (req, res) => {
  res.json({
    success: true,
    app: "Pro Live Voice Chat",
    status: "online",
    message: "Backend server is running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    time: new Date().toISOString()
  });
});

/* -----------------------------
   REGISTER
------------------------------ */

app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required"
    });
  }

  if (users.has(username)) {
    return res.status(409).json({
      success: false,
      message: "User already exists"
    });
  }

  const user = {
    id: "U" + Date.now(),
    username,
    diamonds: 0,
    beans: 0,
    createdAt: new Date().toISOString()
  };

  users.set(username, {
    ...user,
    password
  });

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );

  res.json({
    success: true,
    user,
    token
  });
});

/* -----------------------------
   LOGIN
------------------------------ */

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.get(username);

  if (!user || user.password !== password) {
    return res.status(401).json({
      success: false,
      message: "Invalid username or password"
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      diamonds: user.diamonds,
      beans: user.beans
    }
  });
});

/* -----------------------------
   AUTH MIDDLEWARE
------------------------------ */

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token required"
    });
  }

  const token = header.substring(7);

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
}

/* -----------------------------
   CREATE ROOM
------------------------------ */

app.post("/api/rooms", auth, (req, res) => {
  const {
    name = "Live Voice Room",
    maxSeats = 12
  } = req.body;

  const roomId =
    "ROOM-" +
    Date.now().toString(36).toUpperCase();

  const room = {
    id: roomId,
    name,
    ownerId: req.user.id,
    ownerUsername: req.user.username,
    maxSeats: Math.min(Number(maxSeats) || 12, 12),
    users: [],
    createdAt: new Date().toISOString()
  };

  rooms.set(roomId, room);

  res.json({
    success: true,
    room
  });
});

/* -----------------------------
   ROOM LIST
------------------------------ */

app.get("/api/rooms", (req, res) => {
  const list = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    ownerUsername: room.ownerUsername,
    users: room.users.length,
    maxSeats: room.maxSeats,
    createdAt: room.createdAt
  }));

  res.json({
    success: true,
    rooms: list
  });
});

/* -----------------------------
   ROOM DETAILS
------------------------------ */

app.get("/api/rooms/:roomId", (req, res) => {
  const room = rooms.get(req.params.roomId);

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Room not found"
    });
  }

  res.json({
    success: true,
    room
  });
});

/* -----------------------------
   DELETE ROOM
------------------------------ */

app.delete("/api/rooms/:roomId", auth, (req, res) => {
  const room = rooms.get(req.params.roomId);

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Room not found"
    });
  }

  if (room.ownerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Only room owner can delete this room"
    });
  }

  rooms.delete(req.params.roomId);

  broadcast(req.params.roomId, {
    type: "ROOM_CLOSED",
    roomId: req.params.roomId
  });

  res.json({
    success: true,
    message: "Room deleted"
  });
});

/* -----------------------------
   WEBSOCKET SERVER
------------------------------ */

const wss = new WebSocketServer({
  server
});

function send(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(roomId, data, exceptWs = null) {
  const room = rooms.get(roomId);

  if (!room) return;

  for (const user of room.users) {
    const ws = sockets.get(user.id);

    if (ws && ws !== exceptWs) {
      send(ws, data);
    }
  }
}

function roomUsers(roomId) {
  const room = rooms.get(roomId);

  if (!room) return [];

  return room.users.map(user => ({
    id: user.id,
    username: user.username,
    seat: user.seat,
    muted: user.muted
  }));
}

wss.on("connection", (ws, req) => {
  console.log("WebSocket connected");

  let currentUser = null;
  let currentRoom = null;

  send(ws, {
    type: "CONNECTED",
    message: "Connected to Pro Live Voice Chat"
  });

  ws.on("message", message => {
    try {
      const data = JSON.parse(message.toString());

      /* -------------------------
         AUTHENTICATE
      -------------------------- */

      if (data.type === "AUTH") {
        try {
          const decoded = jwt.verify(
            data.token,
            JWT_SECRET
          );

          currentUser = decoded;

          sockets.set(currentUser.id, ws);

          send(ws, {
            type: "AUTH_SUCCESS",
            user: currentUser
          });
        } catch (error) {
          send(ws, {
            type: "ERROR",
            message: "Invalid authentication token"
          });
        }

        return;
      }

      if (!currentUser) {
        send(ws, {
          type: "ERROR",
          message: "Authenticate first"
        });

        return;
      }

      /* -------------------------
         JOIN ROOM
      -------------------------- */

      if (data.type === "JOIN_ROOM") {
        const room = rooms.get(data.roomId);

        if (!room) {
          send(ws, {
            type: "ERROR",
            message: "Room not found"
          });

          return;
        }

        if (
          room.users.length >= room.maxSeats
        ) {
          send(ws, {
            type: "ERROR",
            message: "Room is full"
          });

          return;
        }

        if (
          room.users.some(
            user => user.id === currentUser.id
          )
        ) {
          send(ws, {
            type: "ERROR",
            message: "Already joined"
          });

          return;
        }

        const usedSeats = new Set(
          room.users.map(user => user.seat)
        );

        let seat = 1;

        while (usedSeats.has(seat)) {
          seat++;
        }

        const roomUser = {
          id: currentUser.id,
          username: currentUser.username,
          seat,
          muted: false
        };

        room.users.push(roomUser);

        currentRoom = room.id;

        send(ws, {
          type: "ROOM_JOINED",
          room,
          users: roomUsers(room.id)
        });

        broadcast(
          room.id,
          {
            type: "USER_JOINED",
            user: roomUser,
            users: roomUsers(room.id)
          },
          ws
        );

        return;
      }

      /* -------------------------
         LEAVE ROOM
      -------------------------- */

      if (data.type === "LEAVE_ROOM") {
        leaveRoom();

        return;
      }

      /* -------------------------
         CHAT MESSAGE
      -------------------------- */

      if (data.type === "CHAT") {
        if (!currentRoom) return;

        const chat = {
          type: "CHAT",
          userId: currentUser.id,
          username: currentUser.username,
          message: String(data.message || "").substring(0, 500),
          time: new Date().toISOString()
        };

        broadcast(currentRoom, chat);

        send(ws, chat);

        return;
      }

      /* -------------------------
         MIC ON/OFF
      -------------------------- */

      if (data.type === "MIC_STATE") {
        if (!currentRoom) return;

        const room = rooms.get(currentRoom);

        if (!room) return;

        const user = room.users.find(
          u => u.id === currentUser.id
        );

        if (!user) return;

        user.muted = Boolean(data.muted);

        broadcast(currentRoom, {
          type: "MIC_STATE",
          userId: currentUser.id,
          muted: user.muted
        });

        return;
      }

      /* -------------------------
         WEBRTC SIGNALING
      -------------------------- */

      if (data.type === "OFFER") {
        forwardSignal(data, currentUser);
        return;
      }

      if (data.type === "ANSWER") {
        forwardSignal(data, currentUser);
        return;
      }

      if (data.type === "ICE_CANDIDATE") {
        forwardSignal(data, currentUser);
        return;
      }

      /* -------------------------
         PING
      -------------------------- */

      if (data.type === "PING") {
        send(ws, {
          type: "PONG",
          time: Date.now()
        });
      }
    } catch (error) {
      console.error("WebSocket error:", error);

      send(ws, {
        type: "ERROR",
        message: "Invalid message"
      });
    }
  });

  function forwardSignal(data, sender) {
    const targetId = data.targetUserId;

    if (!targetId) return;

    const targetWs = sockets.get(targetId);

    if (!targetWs) {
      send(ws, {
        type: "ERROR",
        message: "Target user is offline"
      });

      return;
    }

    send(targetWs, {
      ...data,
      fromUserId: sender.id,
      fromUsername: sender.username
    });
  }

  function leaveRoom() {
    if (!currentRoom || !currentUser) return;

    const room = rooms.get(currentRoom);

    if (!room) {
      currentRoom = null;
      return;
    }

    room.users = room.users.filter(
      user => user.id !== currentUser.id
    );

    broadcast(currentRoom, {
      type: "USER_LEFT",
      userId: currentUser.id,
      username: currentUser.username,
      users: roomUsers(currentRoom)
    });

    currentRoom = null;
  }

  ws.on("close", () => {
    leaveRoom();

    if (currentUser) {
      sockets.delete(currentUser.id);
    }

    console.log("WebSocket disconnected");
  });

  ws.on("error", error => {
    console.error("WebSocket error:", error);
  });
});

/* -----------------------------
   START SERVER
------------------------------ */

server.listen(PORT, () => {
  console.log(
    `Pro Live Voice Chat server running on port ${PORT}`
  );
});
