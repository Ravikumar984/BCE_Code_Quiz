# BUZZ//CTRL — Live Quiz Buzzer

A coding-inspired, real-time quiz buzzer for multiple teams using phones or laptops.

## Features

- Team login with a team name only (no team password)
- Real-time buzzer presses across connected devices
- Server-side order of arrival; first press is rank 1
- One accepted buzz per team per round
- Live ranking on team screens and the host console
- Host can close/reopen the buzzer, start the next round, or reset the competition
- No database; state lives in server memory

## Requirements

- Node.js 18+ recommended
- Internet access for Google Fonts if you want the exact typeface (the app still works without it)

## Run locally

1. Install Node.js if it is not already installed.
2. Extract this project folder.
3. Open a terminal inside the folder and run:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env`.
5. Edit `.env` and choose a private host PIN.
6. Start the server:

   ```bash
   npm start
   ```

7. Open the team portal at `http://localhost:3000`.
8. Open the host dashboard at `http://localhost:3000/host`.

For testing with multiple devices on the same Wi-Fi, use the computer's local network IP instead of `localhost`, for example `http://192.168.1.25:3000`. Allow Node.js through your computer firewall if prompted.

## Put it online for an actual competition

Deploy the folder to a Node.js host that supports persistent WebSocket connections (Socket.IO), such as Render, Railway, or another Node-compatible service. Set `HOST_PIN` as an environment variable in the hosting dashboard. Share the deployed team URL with teams and the `/host` URL with the host.

Do not use a static-only host for this version: the Node server is required for cross-device live ranking.

## Important behavior / limitations

- No database is used. Restarting the server clears the competition state.
- The first press is determined by when the server receives the request. Network latency can affect extremely close presses; a server-side timestamp is more reliable than comparing phones' local clocks.
- Team names are unique for a competition session and remain reserved after disconnect, to avoid another device taking over a team's identity. A team that loses connection can reconnect only after its old socket is gone; if reconnect is blocked, ask the host to reset the competition. (For a production event, a team recovery code or host-managed reconnect is recommended.)
- The host console is protected by a PIN. Team login is intentionally passwordless.
- This is a practical starter project, not a hardened public-service deployment. Use a private host PIN and share the host URL only with organizers.

## Files

- `server.js` — Express + Socket.IO backend and in-memory competition state
- `public/index.html` — team portal
- `public/team.js` — team login, buzzer, live rankings
- `public/host.html` — host console
- `public/host.js` — host controls and ranking
- `public/styles.css` — visual design
- `.env.example` — configuration template
