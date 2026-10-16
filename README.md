# 👍 Thumb Games

TikTok for mini games. Tap **PLAY** once, then **swipe up** for the next head-to-head game.
Real players are matched first; when it's quiet you play a bot instantly, and you get a
"🟢 a real player is ready" nudge the moment someone shows up. No sign up, no accounts. You get
a random name like *Swift Otter*.

## Games

| Game | How it works | Controls |
| --- | --- | --- |
| ♞ **Mini Chess** | Gardner 5×5 chess (K, Q, R, B, N + 5 pawns). Checkmate wins. 30 s per move or a random move is played for you. | Tap a piece, tap a square |
| 🏒 **Pinball Hockey** | Each player defends a pinball drain with two flippers. Knock the puck between the opponent's flippers. First to 3. | Hold left / right half of the screen (or A/D, ←/→) |
| 🏀 **Hot Shot Hoops** | Two tabletop arcade basketball machines side by side, in 3D perspective. 3 balls each roll back down the court to your launcher. Most baskets in 45 s wins. | Hold to charge the launcher, release to shoot |
| ⛳ **Mini Golf** | A randomly generated island hole (rails, logs, bumpers, sand, water hazards), both players putting at the same time. Water costs a stroke. Fewest strokes wins. | Drag back anywhere, release to putt |
| ✨ **Pachinko Pong** | Pong through a pachinko board: steel balls ricochet off pins while you guard your end with a paddle. Balls past your opponent score for you. First to 7. | Slide your finger left/right (or ←/→) |

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Open it in two browser tabs (or on two phones on the same network) and press PLAY in both.

- `?game=hockey` (or `chess`, `hoops`, `golf`, `pachinko`) on the URL forces a game, handy while developing; both players need it.
- `FORCE_GAME=golf npm start` forces a game server-wide.
- `PORT=8080 npm start` changes the port. `/healthz` returns online and match counts.

```bash
npm test           # game logic + an end-to-end two-player WebSocket test
```

### The feed and matchmaking

- Swipe up anywhere except the game area itself (the header, the swipe handle, intro and result
  cards), use the mouse wheel, or press **N**. Results auto-advance after 5 s.
- When you swipe, the server pairs you with anyone else who just swiped. If nobody is waiting:
  - if other people are in the feed playing bots, you wait up to `HUMAN_GRACE_MS` (3.5 s) while
    they see a "real player is ready" banner, and a bot match starts if nobody swipes in time;
  - if you're alone, a bot match starts after `SOLO_GRACE_MS` (0.5 s).
- Bot matches run on the server, so you stay matchable while you play one. Skipping or leaving a
  game against a real person counts as a loss (and a win for them).
- `?offline` on the URL (or `window.THUMB_OFFLINE = true`) turns the client into a pure static page
  where the feed runs in the browser against bots. No server is needed for that mode.

## How it works

```
browser ──ws──┐                         ┌──ws── browser
  inputs  ───►│  server.js              │◄───  inputs
  state   ◄───│  queue → match → 60 Hz  │───►  state
              └─ game.step() loop ──────┘
```

- **Matchmaking:** humans first, bots as a fallback (see above). Seats are random and the game is
  picked at random, avoiding the last two games either player played.
- **Server-authoritative:** players only send inputs (`flip`, `shoot`, `putt`, `move`). The server
  runs the simulation at 60 Hz and streams state back, so neither player can cheat and the two
  screens can't drift apart. Your own hockey flippers are predicted locally so they feel instant.
- **Shared code:** game rules and physics live in `public/shared/games/*.js` as plain ES modules,
  imported by the server (to simulate) and by the browser (for drawing and chess move hints).
- If a player leaves or disconnects mid-game, the other player wins by forfeit.

### Layout

```
server.js                  HTTP static server + WebSocket matchmaking + match loop
public/index.html          Single page: home → the feed
public/js/main.js          Feed: connection, swipe gestures, slide transitions, canvas, input, render loop
public/js/games/*.js       Per-game renderer + touch/keyboard controls
public/js/local.js         In-browser match runner (offline feed)
public/js/bots.js          Computer opponents for each game (used by the server and offline)
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
