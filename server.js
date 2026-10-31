require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST_PIN = process.env.HOST_PIN || "change-this-pin";

app.use(express.static(path.join(__dirname, "public")));

app.get("/host", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "host.html"));
});

let roundNumber = 1;
let roundOpen = true;
let buzzes = [];
let teams = new Map(); // teamName -> { teamName, socketIds: Set<string> }
const hostSockets = new Set();

function publicState() {
  return {
    roundNumber,
    roundOpen,
    buzzes: buzzes.map((b, index) => ({
      teamName: b.teamName,
      rank: index + 1,
      time: b.time
    })),
    teams: [...teams.keys()].sort((a, b) => a.localeCompare(b))
  };
}

function broadcastState() {
  io.emit("state", publicState());
}

function normalizeTeamName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 32);
}

io.on("connection", (socket) => {
  socket.emit("state", publicState());

  socket.on("join-team", (rawName, callback) => {
    const teamName = normalizeTeamName(rawName);
    if (!teamName) {
      return callback?.({ ok: false, error: "Enter a team name first." });
    }

    // Team names are case-insensitive and unique within this live session.
    const existingKey = [...teams.keys()].find(
      (name) => name.toLowerCase() === teamName.toLowerCase()
    );

    if (existingKey && !teams.get(existingKey).socketIds.has(socket.id)) {
      // Permit reconnects for the same team only when its prior sockets are gone.
      if (teams.get(existingKey).socketIds.size > 0) {
        return callback?.({
          ok: false,
          error: "That team name is already in use. Ask the host if you need to reconnect."
        });
      }
    }

    const finalName = existingKey || teamName;
    if (!teams.has(finalName)) {
      teams.set(finalName, { teamName: finalName, socketIds: new Set() });
    }
    teams.get(finalName).socketIds.add(socket.id);
    socket.data.teamName = finalName;
    socket.join("teams");

    callback?.({ ok: true, teamName: finalName });
    broadcastState();
  });

  socket.on("buzz", () => {
    const teamName = socket.data.teamName;
    if (!teamName || !roundOpen) return;
    if (buzzes.some((entry) => entry.teamName === teamName)) {
      socket.emit("buzz-result", { ok: false, message: "Your team has already buzzed this round." });
      return;
    }

    const time = Date.now();
    buzzes.push({ teamName, time });
    socket.emit("buzz-result", { ok: true, rank: buzzes.length, time });
    broadcastState();
  });

  socket.on("host-auth", (pin, callback) => {
    if (String(pin || "") !== HOST_PIN) {
      return callback?.({ ok: false, error: "Incorrect host PIN." });
    }
    hostSockets.add(socket.id);
    socket.data.isHost = true;
    socket.join("hosts");
    callback?.({ ok: true });
    socket.emit("state", publicState());
  });

  socket.on("host-toggle-round", () => {
    if (!socket.data.isHost) return;
    roundOpen = !roundOpen;
    broadcastState();
  });

  socket.on("host-next-round", () => {
    if (!socket.data.isHost) return;
    roundNumber += 1;
    buzzes = [];
    roundOpen = true;
    broadcastState();
  });

  socket.on("host-reset-all", () => {
    if (!socket.data.isHost) return;
    roundNumber = 1;
    roundOpen = true;
    buzzes = [];
    teams.clear();
    broadcastState();
    // Tell team clients to return to the join screen after a full reset.
    io.emit("competition-reset");
  });

  socket.on("disconnect", () => {
    hostSockets.delete(socket.id);
    const teamName = socket.data.teamName;
    if (teamName && teams.has(teamName)) {
      teams.get(teamName).socketIds.delete(socket.id);
      // Keep team names reserved for the duration of the competition to avoid
      // accidental takeover or ranking confusion after a brief disconnect.
    }
  });
});

server.listen(PORT, () => {
  console.log(`Quiz buzzer running at http://localhost:${PORT}`);
  console.log(`Team portal: http://localhost:${PORT}`);
  console.log(`Host dashboard: http://localhost:${PORT}/host`);
});
