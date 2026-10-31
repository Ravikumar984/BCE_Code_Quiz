const socket = io();
const $ = (id) => document.getElementById(id);

let currentTeam = "";
let hasBuzzed = false;
let latestState = null;

/* ---------- Sound & flash ---------- */
let audioCtx = null;

function getAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (_) {
    audioCtx = null;
  }
  return audioCtx;
}

function tone(freq, start, dur, type = "sine", vol = 0.16) {
  const ctx = getAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function flash(kind) {
  const el = document.createElement("div");
  el.className = `screen-flash ${kind}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch (_) {}
}

function playFirst() {
  tone(660, 0.00, 0.12, "square", 0.10);
  tone(880, 0.10, 0.12, "square", 0.10);
  tone(1320, 0.20, 0.30, "triangle", 0.18);
  flash("first");
  vibrate([60, 40, 120]);
}

function playOk() {
  tone(700, 0, 0.14, "triangle", 0.16);
  flash("ok");
  vibrate(40);
}

function playDeny() {
  tone(180, 0, 0.22, "sawtooth", 0.10);
  flash("deny");
  vibrate([30, 30, 30]);
}

/* ---------- Connection / screens ---------- */
function setConnection(connected) {
  $("connection-label").textContent = connected ? "CONNECTED" : "RECONNECTING";
  $("connection-label").previousElementSibling.style.background = connected ? "var(--green)" : "var(--red)";
}

function showJoin(error = "") {
  $("join-screen").classList.remove("hidden");
  $("team-screen").classList.add("hidden");
  $("join-error").textContent = error;
}

function showTeam() {
  $("join-screen").classList.add("hidden");
  $("team-screen").classList.remove("hidden");
  $("welcome-team").textContent = currentTeam;
  renderState(latestState);
}

$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  getAudio(); // unlock audio on a user gesture
  const name = $("team-name").value.trim();
  if (!name) return;
  $("join-error").textContent = "";
  socket.emit("join-team", name, (result) => {
    if (!result?.ok) {
      $("join-error").textContent = result?.error || "Could not join. Try again.";
      return;
    }
    currentTeam = result.teamName;
    hasBuzzed = false;
    showTeam();
  });
});

$("buzz-button").addEventListener("click", () => {
  getAudio(); // make sure audio is ready before the result comes back
  if (!currentTeam || hasBuzzed || !latestState?.roundOpen) return;
  $("buzz-button").disabled = true;
  $("buzz-feedback").textContent = "SIGNAL SENT…";
  socket.emit("buzz");
});

$("leave-button").addEventListener("click", () => {
  currentTeam = "";
  hasBuzzed = false;
  $("team-name").value = "";
  showJoin();
});

socket.on("connect", () => setConnection(true));
socket.on("disconnect", () => setConnection(false));

socket.on("state", (state) => {
  latestState = state;
  $("round-label").textContent = `ROUND ${String(state.roundNumber).padStart(2, "0")}`;
  if (currentTeam) renderState(state);
});

socket.on("buzz-result", (result) => {
  if (result.ok) {
    hasBuzzed = true;
    $("buzz-feedback").textContent = `LOCKED IN — YOU ARE #${result.rank}`;
    $("buzz-feedback").className = "buzz-feedback success";
    result.rank === 1 ? playFirst() : playOk();
  } else {
    $("buzz-feedback").textContent = result.message || "Buzz not accepted.";
    $("buzz-feedback").className = "buzz-feedback warning";
    playDeny();
  }
  renderState(latestState);
});

socket.on("competition-reset", () => {
  currentTeam = "";
  hasBuzzed = false;
  $("team-name").value = "";
  showJoin("Competition reset by host. Join again when ready.");
});

function renderState(state) {
  if (!state || !currentTeam) return;
  $("round-label").textContent = `ROUND ${String(state.roundNumber).padStart(2, "0")}`;
  const myEntry = state.buzzes.find((entry) => entry.teamName === currentTeam);
  hasBuzzed = Boolean(myEntry);
  $("buzz-button").disabled = !state.roundOpen || hasBuzzed;
  $("buzzer-state").classList.toggle("closed", !state.roundOpen);
  $("buzzer-state").innerHTML = `<span class="state-dot"></span> ${!state.roundOpen ? "CLOSED" : hasBuzzed ? "LOCKED" : "ARMED"}`;

  if (!state.roundOpen) {
    $("buzz-feedback").textContent = myEntry ? `LOCKED IN — YOU ARE #${myEntry.rank}` : "BUZZER CLOSED — WAIT FOR THE NEXT ROUND.";
    $("buzz-feedback").className = "buzz-feedback warning";
  } else if (myEntry) {
    $("buzz-feedback").textContent = `LOCKED IN — YOU ARE #${myEntry.rank}`;
    $("buzz-feedback").className = "buzz-feedback success";
  } else {
    $("buzz-feedback").textContent = "Waiting for the host to read the question.";
    $("buzz-feedback").className = "buzz-feedback";
  }

  $("buzz-count").textContent = `${state.buzzes.length} TEAM${state.buzzes.length === 1 ? "" : "S"} BUZZED`;
  const list = $("ranking-list");
  if (!state.buzzes.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">⌁</span><span>No buzzes yet.</span><small>Be ready when the question drops.</small></div>`;
    return;
  }
  list.innerHTML = state.buzzes.map((entry) => `
    <div class="rank-row">
      <span class="rank-number">#${String(entry.rank).padStart(2, "0")}</span>
      <span class="rank-team">${escapeHtml(entry.teamName)}${entry.teamName === currentTeam ? ' <span class="accent-text">(YOU)</span>' : ""}</span>
      <span class="rank-tag">${entry.rank === 1 ? "FIRST HIT" : "LOGGED"}</span>
    </div>`).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}