// Thumb Games server: serves the web client, pairs anonymous players, picks a random
// game, and runs the match authoritatively (both players send inputs, the server
// simulates and streams state back) so neither side can cheat or desync.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GAMES, GAME_IDS } from './public/shared/registry.js';
import { makeRng } from './public/shared/rng.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TICK_MS = 1000 / 60;
const COUNTDOWN_MS = 3000;
const MAX_MSG_BYTES = 2048;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, online: wss.clients.size, matches: matches.size }));
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

// ---------------------------------------------------------------------------
// Players & matchmaking
// ---------------------------------------------------------------------------

const ADJ = ['Swift', 'Sneaky', 'Lucky', 'Mighty', 'Fuzzy', 'Turbo', 'Cosmic', 'Jolly', 'Brave', 'Zippy', 'Sly', 'Bouncy', 'Groovy', 'Nimble', 'Wild'];
const ANIMAL = ['Otter', 'Panda', 'Falcon', 'Llama', 'Gecko', 'Badger', 'Koala', 'Moose', 'Narwhal', 'Fox', 'Yak', 'Penguin', 'Lynx', 'Walrus', 'Bee'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const queue = [];
const matches = new Set();

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG_BYTES });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

function broadcastStats() {
  const msg = JSON.stringify({ type: 'stats', online: wss.clients.size, waiting: queue.length, playing: matches.size * 2 });
  for (const ws of wss.clients) send(ws, msg);
}

function removeFromQueue(ws) {
  const i = queue.indexOf(ws);
  if (i >= 0) queue.splice(i, 1);
}

function tryMatchmake() {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    if (a.readyState !== a.OPEN) { queue.unshift(b); continue; }
    if (b.readyState !== b.OPEN) { queue.unshift(a); continue; }
    startMatch(a, b);
  }
  broadcastStats();
}

function chooseGame(a, b, forced) {
  if (forced && GAMES[forced]) return forced;
  // Avoid repeating the game either player just played, when possible.
  const fresh = GAME_IDS.filter((id) => id !== a.lastGame && id !== b.lastGame);
  return pick(fresh.length ? fresh : GAME_IDS);
}

// Round floats and drop private `_` keys to keep the per-tick payload small.
function stateReplacer(key, value) {
  if (key.startsWith('_')) return undefined;
  if (typeof value === 'number' && !Number.isInteger(value)) return Math.round(value * 100) / 100;
  return value;
}

function startMatch(a, b) {
  // Randomize who gets seat 0 (moves first in chess, etc.).
  const players = Math.random() < 0.5 ? [a, b] : [b, a];
  const gameId = chooseGame(a, b, process.env.FORCE_GAME || a.wantGame || b.wantGame);
  const game = GAMES[gameId];
  const rng = makeRng(Math.floor(Math.random() * 2 ** 32));
  const { config, state } = game.create(rng);
  const match = { id: Math.random().toString(36).slice(2, 10), gameId, game, config, state, players, timer: null, lastSent: '', running: false, ended: false };
  matches.add(match);
  players.forEach((ws, seat) => {
    ws.match = match;
    ws.seat = seat;
    ws.lastGame = gameId;
  });
  const names = players.map((p) => p.name);
  const initial = JSON.parse(JSON.stringify(state, stateReplacer));
  players.forEach((ws, seat) =>
    send(ws, { type: 'match', game: gameId, seat, names, config, state: initial, startsIn: COUNTDOWN_MS }));
  console.log(`[match ${match.id}] ${gameId}: ${names[0]} vs ${names[1]}`);

  match.timer = setTimeout(() => {
    if (match.ended) return;
    match.running = true;
    let last = performance.now();
    match.timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(match, dt);
    }, TICK_MS);
  }, COUNTDOWN_MS);
}

function tick(match, dt) {
  try {
    match.game.step(match.config, match.state, dt);
  } catch (err) {
    console.error(`[match ${match.id}] step failed`, err);
    endMatch(match, null, 'Game error');
    return;
  }
  const payload = `{"type":"state","state":${JSON.stringify(match.state, stateReplacer)}}`;
  if (payload !== match.lastSent) {
    match.lastSent = payload;
    for (const ws of match.players) send(ws, payload);
  }
  if (match.state.over) endMatch(match, match.state.over.winner, match.state.over.reason);
}

function endMatch(match, winner, reason) {
  if (match.ended) return;
  match.ended = true;
  clearTimeout(match.timer);
  clearInterval(match.timer);
  matches.delete(match);
  for (const ws of match.players) {
    send(ws, { type: 'end', winner, reason });
    ws.match = null;
  }
  console.log(`[match ${match.id}] over: winner=${winner} (${reason})`);
  broadcastStats();
}

function forfeit(ws, reason) {
  const match = ws.match;
  if (!match) return;
  endMatch(match, 1 - ws.seat, reason);
}

wss.on('connection', (ws) => {
  ws.name = `${pick(ADJ)} ${pick(ANIMAL)}`;
  ws.isAlive = true;
  ws.match = null;
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { type: 'hello', name: ws.name, games: GAME_IDS.map((id) => ({ id, name: GAMES[id].name })) });
  broadcastStats();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'find':
        if (ws.match || queue.includes(ws)) return;
        ws.wantGame = typeof msg.game === 'string' && GAMES[msg.game] ? msg.game : null;
        queue.push(ws);
        tryMatchmake();
        break;
      case 'cancel':
        removeFromQueue(ws);
        broadcastStats();
        break;
      case 'input':
        if (ws.match?.running && msg.input && typeof msg.input === 'object') {
          try {
            ws.match.game.input(ws.match.config, ws.match.state, ws.seat, msg.input);
          } catch (err) {
            console.error(`[match ${ws.match.id}] bad input`, err);
          }
        }
        break;
      case 'leave':
        forfeit(ws, 'Opponent left');
        break;
    }
  });

  ws.on('close', () => {
    removeFromQueue(ws);
    forfeit(ws, 'Opponent disconnected');
    // Stats broadcast after the client set updates.
    setImmediate(broadcastStats);
  });
});

// Drop dead connections so they don't sit in the queue.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Thumb Games running at http://localhost:${PORT}`);
});

export { server, wss };
