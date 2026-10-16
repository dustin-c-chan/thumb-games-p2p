# 👍 Thumb Games

Open the page, tap **PLAY**, and you're instantly matched with another person in a random
head-to-head mini game. No sign up, no accounts — you get a random name like *Swift Otter*.

## Games

| Game | How it works | Controls |
| --- | --- | --- |
| ♞ **Mini Chess** | Gardner 5×5 chess (K, Q, R, B, N + 5 pawns). Checkmate wins. 30 s per move or a random move is played for you. | Tap a piece, tap a square |
| 🏒 **Pinball Hockey** | Each player defends a pinball drain with two flippers. Knock the puck between the opponent's flippers. First to 3. | Hold left / right half of the screen (or A/D, ←/→) |
| 🏀 **Arcade Hoops** | Side-by-side carnival lanes. Most baskets in 45 s wins; hoops start moving after 20 s. | Flick from the ball toward the hoop (Space on desktop) |
| ⛳ **Mini Golf** | A randomly generated hole, both players putting at the same time. Fewest strokes wins. | Drag back anywhere, release to putt |

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Open it in two browser tabs (or on two phones on the same network) and press PLAY in both.

- `?game=hockey` (or `chess`, `hoops`, `golf`) on the URL forces a game, handy while developing; both players need it.
- `FORCE_GAME=golf npm start` forces a game server-wide.
- `PORT=8080 npm start` changes the port. `/healthz` returns online and match counts.

```bash
npm test           # game logic + an end-to-end two-player WebSocket test
```

### No opponent? No server?

- On the "Finding an opponent…" screen, **Play the computer instead** starts a match against a bot
  right away. The match runs in your browser with the same game code.
- `?offline` on the URL (or `window.THUMB_OFFLINE = true`) turns the client into a pure static page
  where every match is against the computer. No server is needed for that mode.

## How it works

```
browser ──ws──┐                         ┌──ws── browser
  inputs  ───►│  server.js              │◄───  inputs
  state   ◄───│  queue → match → 60 Hz  │───►  state
              └─ game.step() loop ──────┘
```

- **Matchmaking:** a FIFO queue. When two players are waiting they're paired, given random seats,
  and a random game is picked (avoiding whatever either of them just played).
- **Server-authoritative:** players only send inputs (`flip`, `shoot`, `putt`, `move`). The server
  runs the simulation at 60 Hz and streams state back, so neither player can cheat and the two
  screens can't drift apart. Your own hockey flippers are predicted locally so they feel instant.
- **Shared code:** game rules and physics live in `public/shared/games/*.js` as plain ES modules,
  imported by the server (to simulate) and by the browser (for drawing and chess move hints).
- If a player leaves or disconnects mid-game, the other player wins by forfeit.

### Layout

```
server.js                  HTTP static server + WebSocket matchmaking + match loop
public/index.html          Single page: home → searching → game
public/js/main.js          Connection, screens, canvas scaling, input routing, render loop
public/js/games/*.js       Per-game renderer + touch/keyboard controls
public/js/local.js         In-browser match runner (vs computer)
public/js/bots.js          Computer opponents for each game
public/shared/games/*.js   Per-game rules/physics: create(), input(), step()
public/shared/physics.js   Tiny circle/segment/rect collision helpers
test/                      node:test suites
```

### Adding a game

1. Create `public/shared/games/<id>.js` exporting `{ id, name, blurb, controls, create(rng), input(config, state, seat, msg), step(config, state, dt) }`.
   Set `state.over = { winner: 0 | 1 | null, reason }` when the game ends.
2. Create `public/js/games/<id>.js` exporting `({ seat, config, names, send }) => ({ render(ctx, state, dt), pointerDown?, pointerMove?, pointerUp?, keyDown?, keyUp? })`.
   The canvas is a 400×600 logical space.
3. Register it in `public/shared/registry.js` and `public/js/main.js`.

## Deploying

It's a single Node process with no database. Any host that supports WebSockets works (Render,
Fly.io, Railway, a VPS…): run `npm start` and set `PORT`. Behind HTTPS the client switches to
`wss://` automatically.

**Render, from a phone:** sign in at [render.com](https://render.com) with GitHub, tap
**New → Blueprint**, pick this repo and branch, and accept. `render.yaml` sets everything up. You
get a public `https://thumb-games-….onrender.com` URL to share. (Free instances sleep after
~15 minutes idle, so the first visit after a nap takes ~30 s to wake up.)
