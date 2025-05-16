// Обновлённый server/index.js с логикой: таймер ожидания, поражение без вылета, победа с завершением игры

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

app.use(express.static("client/public", {
  extensions: ['html']
}));

const activeUsers = new Map();
const rooms = new Map();

io.on("connection", (socket) => {

  socket.on("setUsername", (username, cb) => {
    const taken = [...activeUsers.values()].includes(username);
    if (taken) return cb({ success: false, messageKey: "name_in_use" });
    activeUsers.set(socket.id, username);
    cb({ success: true });
  });

  socket.on("getRooms", () => {
    socket.emit("roomsList", Array.from(rooms.keys()));
  });

  socket.on("createRoom", ({ room, username }, callback) => {
    if (rooms.has(room)) {
      return callback({ success: false, messageKey: "room_exists" });
    }

    socket.join(room);

    const roomData = {
      players: [username],
      creator: username,
      points: { [username]: 10 },
      choices: {},
      started: false,
      roundNumber: 1,
      roundTimer: null,
      eliminated: new Set(),
      botsAdded: false,
      waitTimer: 180,
      waitInterval: null,
    };

    rooms.set(room, roomData);

    roomData.waitInterval = setInterval(() => {
      roomData.waitTimer--;
      io.to(room).emit("roomTimer", roomData.waitTimer);
      if (roomData.waitTimer <= 0) {
        clearInterval(roomData.waitInterval);
        startRound(room);
      }
    }, 1000);

    io.to(room).emit("updatePlayers",
      roomData.players.map(u => ({ username: u, points: roomData.points[u] }))
    );
    io.emit("roomsList", Array.from(rooms.keys()));
    callback({ success: true });
  });

  socket.on("joinRoom", ({ room, username }) => {
    const data = rooms.get(room);
    if (!data || data.started) {
      socket.emit("error", { messageKey: "game_already_started" });
      return;
    }
    socket.join(room);
    if (!data.players.includes(username)) {
      data.players.push(username);
      data.points[username] = 10;
    }
    socket.emit("roomInfo", {
      creator: data.creator,
      points: data.points,
      secondsLeft: data.waitTimer,
    });
    io.to(room).emit("updatePlayers",
      data.players.map(u => ({ username: u, points: data.points[u] }))
    );
  });

  socket.on("startGame", ({ room }) => {
    const user = activeUsers.get(socket.id);
    const data = rooms.get(room);
    if (!data || data.creator !== user || data.started) return;
    clearInterval(data.waitInterval);
    startRound(room);
  });

  socket.on("makeChoice", ({ room, choice }) => {
    const user = activeUsers.get(socket.id);
    const data = rooms.get(room);
    if (!data || !data.started || data.choices[user] != null || data.eliminated.has(user)) return;
    data.choices[user] = choice;
    const humans = data.players.filter(u => !u.startsWith("bot") && !data.eliminated.has(u));
    const allHumansDone = humans.every(u => data.choices[u] != null);
    if (allHumansDone) {
      clearInterval(data.roundTimer);
      finishRound(room);
    }
  });

  socket.on("disconnect", () => {
    const user = activeUsers.get(socket.id);
    activeUsers.delete(socket.id);
    for (const [roomName, data] of rooms.entries()) {
      data.players = data.players.filter(u => u !== user);
      delete data.points[user];
      io.to(roomName).emit("updatePlayers",
        data.players.map(u => ({ username: u, points: data.points[u] }))
      );
      const hasHuman = data.players.some(p => !p.startsWith("bot") && !data.eliminated.has(p));
      if (!hasHuman || data.players.length === 0) {
        clearInterval(data.roundTimer);
        clearInterval(data.waitInterval);
        rooms.delete(roomName);
        io.emit("roomsList", Array.from(rooms.keys()));
        io.to(roomName).emit("roomClosed");
      }
    }
  });

  function startRound(room) {
    const data = rooms.get(room);
    if (!data) return;

    if (!data.botsAdded) {
      while (data.players.length < 5) {
        let i = 1;
        while (data.players.includes(`bot${i}`)) i++;
        const botName = `bot${i}`;
        data.players.push(botName);
        data.points[botName] = 10;
      }
      data.botsAdded = true;
    }

    data.started = true;
    data.choices = {};
    io.to(room).emit("gameStarted");
    io.to(room).emit("roundInfo", { round: data.roundNumber });

    data.roundTimeLeft = 180;
    io.to(room).emit("roundTimer", data.roundTimeLeft);
    data.roundTimer = setInterval(() => {
      data.roundTimeLeft--;
      io.to(room).emit("roundTimer", data.roundTimeLeft);
      if (data.roundTimeLeft <= 0) {
        clearInterval(data.roundTimer);
        finishRound(room);
      }
    }, 1000);
  }

function finishRound(room) {
  const data = rooms.get(room);
  if (!data) return;

  const alivePlayers = data.players.filter(p => !data.eliminated.has(p));
  const choices = {};

  for (const p of alivePlayers) {
    if (data.choices[p] == null) {
      const lambda = 1 / 20;
      let x = -Math.log(1 - Math.random()) / lambda;
      if (x > 100) x = 100;
      choices[p] = Math.floor(x);
    } else {
      choices[p] = data.choices[p];
    }
  }

  const values = Object.values(choices);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const target = avg * 0.8;

  // Множественные победители
  let minDiff = Infinity;
  let winners = [];

  for (const [player, val] of Object.entries(choices)) {
    const diff = Math.abs(val - target);
    if (diff < minDiff) {
      minDiff = diff;
      winners = [player];
    } else if (diff === minDiff) {
      winners.push(player);
    }
  }

  const eliminatedNow = [];
  const playerCount = alivePlayers.length;

  for (const player of alivePlayers) {
    if (winners.includes(player)) continue;

    let penalty = 1;

    if (playerCount === 4) {
      const countThis = Object.values(choices).filter(v => v === choices[player]).length;
      if (countThis > 1) penalty = 1;
    }

    if (playerCount === 3 && winners.some(w => choices[w] === target) && choices[player] !== target) {
      penalty = 2;
    }

    if (playerCount === 2 && choices[player] === 0 && winners.some(w => choices[w] === 100)) {
      penalty = 1;
    }

    data.points[player] = Math.max(0, data.points[player] - penalty);
    if (data.points[player] === 0) eliminatedNow.push(player);
  }

  for (const name of eliminatedNow) {
    data.eliminated.add(name);
  }

  data.started = false;

  io.to(room).emit("updatePlayers",
    data.players.filter(p => !data.eliminated.has(p)).map(u => ({ username: u, points: data.points[u] }))
  );

  io.to(room).emit("roundResult", {
    round: data.roundNumber,
    choices,
    winners,
    eliminated: eliminatedNow,
    target: Math.round(target)
  });

  const survivors = data.players.filter(p => !data.eliminated.has(p));

  if (survivors.length <= 1) {
    const finalWinner = survivors[0];
    if (finalWinner) {
      io.to(room).emit("gameOver", { winner: finalWinner });
    }
    setTimeout(() => {
      io.to(room).emit("roomClosed");
      rooms.delete(room); // обязательно удаляем комнату!
      io.emit("roomsList", Array.from(rooms.keys()));
    }, 3000);
    return;
  }

  data.roundNumber++;
  setTimeout(() => startRound(room), 3000);
}

    
});

httpServer.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
