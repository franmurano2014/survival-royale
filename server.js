
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const rooms = new Map();
const MAX_PLAYERS = 20;

function createCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

io.on("connection", socket => {
  socket.on("createRoom", ({ privateRoom = false } = {}, callback) => {
    let code = createCode();

    while (rooms.has(code)) code = createCode();

    const room = {
      code,
      privateRoom,
      players: new Map()
    };

    rooms.set(code, room);
    joinRoom(socket, room);

    callback?.({ ok: true, code });
    io.emit("roomsUpdated", getPublicRooms());
  });

  socket.on("joinRoom", (code, callback) => {
    const room = rooms.get(String(code).toUpperCase());

    if (!room) {
      return callback?.({ ok: false, error: "La sala no existe." });
    }

    if (room.players.size >= MAX_PLAYERS) {
      return callback?.({ ok: false, error: "La sala está llena." });
    }

    joinRoom(socket, room);
    callback?.({ ok: true, code: room.code });
  });

  socket.on("getPublicRooms", callback => {
    callback?.(getPublicRooms());
  });

  socket.on("playerMove", position => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;

    const x = Number(position?.x);
    const y = Number(position?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const player = room.players.get(socket.id);
    player.x = Math.max(0, Math.min(900, x));
    player.y = Math.max(0, Math.min(550, y));

    socket.to(room.code).emit("playerMoved", {
      id: socket.id,
      x: player.x,
      y: player.y
    });
  });

  socket.on("disconnect", () => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;

    room.players.delete(socket.id);
    io.to(room.code).emit("playerLeft", socket.id);

    if (room.players.size === 0) {
      rooms.delete(room.code);
    }

    io.emit("roomsUpdated", getPublicRooms());
  });
});

function joinRoom(socket, room) {
  socket.join(room.code);

  room.players.set(socket.id, {
    id: socket.id,
    x: 450,
    y: 275
  });

  socket.emit("roomJoined", {
    code: room.code,
    players: Array.from(room.players.values())
  });

  socket.to(room.code).emit("playerJoined", {
    id: socket.id,
    x: 450,
    y: 275
  });

  io.emit("roomsUpdated", getPublicRooms());
}

function findPlayerRoom(id) {
  for (const room of rooms.values()) {
    if (room.players.has(id)) return room;
  }
  return null;
}

function getPublicRooms() {
  return Array.from(rooms.values())
    .filter(room => !room.privateRoom)
    .map(room => ({
      code: room.code,
      players: room.players.size,
      maxPlayers: MAX_PLAYERS
    }));
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("SURVIVAL ROYALE funcionando en el puerto " + PORT);
});
