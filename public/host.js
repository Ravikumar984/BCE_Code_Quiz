const socket = io();
const $ = (id) => document.getElementById(id);
let latestState = null;
let authenticated = false;
let lastBuzzCount = 0;

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

function playFirstBuzz() {
  tone(660, 0.00, 0.12, "square", 0.10);
  tone(880, 0.10, 0.12, "square", 0.10);
  tone(1320, 0.20, 0.30, "triangle", 0.18);
  flash("first");
}

function playTick() {
  tone(520, 0, 0.08, "triangle", 0.08);
}

/* ---------- Connection ---------- */
function setConnection(connected) {
  $("connection-label").textContent = connected ? "CONNECTED" : "RECONNECTING";
  $("connection-label").previousElementSibling.style.background = connected ? "var(--green)" : "var(--red)";
}

$("host-form").addEventListener("submit", (event) => {
  event.preventDefault();
  getAudio(); // unlock audio on a user gesture
  $("auth-error").textContent = "";
  socket.emit("host-auth", $("host-pin").value, (result) => {
    if (!result?.ok) {
      $("auth-error").textContent = result?.error || "Could not authenticate.";
      return;
    }
    authenticated = true;
    $("auth-screen").classList.add("hidden");
    $("host-screen").classList.remove("hidden");
    renderState(latestState);
  });
});

$("toggle-round").addEventListener("click", () => {
  if (authenticated) socket.emit("host-toggle-round");
});

$("next-round").addEventListener("click", () => {
  if (!authenticated) return;
  if (confirm("Start the next round and clear the current buzzer order?")) {
    socket.emit("host-next-round");
  }
});

$("reset-all").addEventListener("click", () => {
  if (!authenticated) return;
  if (confirm("Reset the entire competition? This clears the round, rankings, and registered teams.")) {
    socket.emit("host-reset-all");
    authenticated = false;
    $("host-screen").classList.add("hidden");
    $("auth-screen").classList.remove("hidden");
    $("host-pin").value = "";
  }
});

socket.on("connect", () => setConnection(true));
socket.on("disconnect", () => setConnection(false));

socket.on("state", (state) => {
  const count = state.buzzes.length;
  if (authenticated && count > lastBuzzCount) {
    lastBuzzCount === 0 ? playFirstBuzz() : playTick();
  }
  lastBuzzCount = count; // always track, so unlocking never replays old buzzes
  latestState = state;
  if (authenticated) renderState(state);
});

socket.on("competition-reset", () => {
  latestState = null;
  lastBuzzCount = 0;
});

function renderState(state) {
  if (!state) return;
  $("host-round").textContent = String(state.roundNumber).padStart(2, "0");
  $("team-total").textContent = state.teams.length;
  $("buzz-total").textContent = state.buzzes.length;
  $("status-value").textContent = state.roundOpen ? "OPEN" : "CLOSED";
  $("round-status").classList.toggle("closed", !state.roundOpen);
  $("round-status").innerHTML = `<span class="state-dot"></span> ${state.roundOpen ? "ROUND OPEN" : "BUZZER CLOSED"}`;
  $("toggle-round").textContent = state.roundOpen ? "CLOSE BUZZER" : "REOPEN BUZZER";
  $("host-buzz-count").textContent = `${state.buzzes.length} ENTR${state.buzzes.length === 1 ? "Y" : "IES"}`;
  $("registered-count").textContent = `${state.teams.length} TEAM${state.teams.length === 1 ? "" : "S"}`;

  const list = $("host-ranking-list");
  if (!state.buzzes.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">⌁</span><span>No buzzes yet.</span><small>Results will appear here in real time.</small></div>`;
  } else {
    list.innerHTML = state.buzzes.map((entry) => `
      <div class="rank-row">
        <span class="rank-number">#${String(entry.rank).padStart(2, "0")}</span>
        <span class="rank-team">${escapeHtml(entry.teamName)}</span>
        <span class="rank-tag">${entry.rank === 1 ? "FIRST HIT" : "LOGGED"}</span>
      </div>`).join("");
  }

  $("registered-teams").innerHTML = state.teams.length
    ? state.teams.map((name) => `<span class="team-chip">${escapeHtml(name)}</span>`).join("")
    : `<span class="muted">Waiting for teams to join…</span>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}