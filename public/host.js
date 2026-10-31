const socket = io();
const $ = (id) => document.getElementById(id);
let latestState = null;
let authenticated = false;

function setConnection(connected) {
  $("connection-label").textContent = connected ? "CONNECTED" : "RECONNECTING";
  $("connection-label").previousElementSibling.style.background = connected ? "var(--green)" : "var(--red)";
}

$("host-form").addEventListener("submit", (event) => {
  event.preventDefault();
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
  latestState = state;
  if (authenticated) renderState(state);
});

socket.on("competition-reset", () => {
  latestState = null;
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
