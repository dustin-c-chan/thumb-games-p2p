// Thumb Games server: serves the web client, runs the swipe-for-the-next-game feed
// (pairing anonymous humans first, bots otherwise), picks a random game, and runs each
// match authoritatively (both players send inputs, the server
// simulates and streams state back) so neither side can cheat or desync.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GAMES, GAME_IDS } from './public/shared/registry.js';
import { makeRng } from './public/shared/rng.js';
import { snapshot, stateReplacer } from './public/shared/match.js';
import { makeBot, BOT_NAMES } from './public/js/bots.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TICK_MS = 1000 / 60;
const COUNTDOWN_MS = 2500;
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

// The feed: every swipe asks for the next game. Humans who just swiped are paired
// first; if nobody is free we start a server-side bot match so play is instant, and
// anyone playing a bot is nudged ("a real player is ready") when a human shows up.
const HUMAN_GRACE_MS = Number(process.env.HUMAN_GRACE_MS) || 3500; // wait this long if other humans could join
const SOLO_GRACE_MS = Number(process.env.SOLO_GRACE_MS) || 500; // nobody else around: bot almost at once
const BOT_COUNTDOWN_MS = 1500;

const queue = []; // humans who just swiped and are waiting for a partner
const matches = new Set();

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG_BYTES });

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

const humans = () => [...wss.clients].filter((c) => c.readyState === c.OPEN);
// Could this person join a human match if they swiped now? (In the feed, not already vs a human.)
const available = (ws) => ws.inFeed && !queue.includes(ws) && (!ws.match || ws.match.vsBot);

function broadcastStats() {
  const playing = [...matches].reduce((n, m) => n + m.players.filter(Boolean).length, 0);
  const msg = JSON.stringify({ type: 'stats', online: wss.clients.size, waiting: queue.length, playing });
  for (const ws of wss.clients) send(ws, msg);
}

// Tell everyone who could swipe how many real players are waiting for a partner.
function broadcastHumans() {
  for (const ws of humans()) {
    if (!available(ws)) continue;
    const waiting = queue.filter((q) => q !== ws).length;
    if (waiting !== ws.lastHumansSent) {
      ws.lastHumansSent = waiting;
      send(ws, { type: 'humans', waiting });
    }
  }
}

function removeFromQueue(ws) {
  const i = queue.indexOf(ws);
  if (i >= 0) queue.splice(i, 1);
  clearTimeout(ws.botTimer);
}

function chooseGame(players, forced) {
  if (forced && GAMES[forced]) return forced;
  // Avoid repeating the game anyone just played, when possible.
  const recent = new Set(players.flatMap((p) => p?.recentGames || []));
  const fresh = GAME_IDS.filter((id) => !recent.has(id));
  return pick(fresh.length ? fresh : GAME_IDS);
}

function requestNext(ws, wantGame) {
  ws.inFeed = true;
  ws.wantGame = typeof wantGame === 'string' && GAMES[wantGame] ? wantGame : null;
  leaveMatch(ws, 'Opponent swiped to the next game');
  removeFromQueue(ws);

  const partner = queue.find((q) => q.readyState === q.OPEN);
  if (partner) {
    removeFromQueue(partner);
    startMatch([ws, partner]);
  } else {
    queue.push(ws);
    const others = humans().filter((c) => c !== ws && available(c)).length;
    const grace = others ? HUMAN_GRACE_MS : SOLO_GRACE_MS;
    send(ws, { type: 'searching', graceMs: grace, others });
    ws.botTimer = setTimeout(() => {
      if (!queue.includes(ws)) return;
      removeFromQueue(ws);
      startMatch([ws, null]);
    }, grace);
  }
  broadcastHumans();
  broadcastStats();
}

function startMatch(pair) {
  // Randomize who gets seat 0 (moves first in chess, etc.).
  const players = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
  const vsBot = players.includes(null);
  const botSeat = players.indexOf(null);
  const gameId = chooseGame(players, process.env.FORCE_GAME || players.find((p) => p?.wantGame)?.wantGame);
  const game = GAMES[gameId];
  const rng = makeRng(Math.floor(Math.random() * 2 ** 32));
  const { config, state } = game.create(rng);
  const countdown = vsBot ? BOT_COUNTDOWN_MS : COUNTDOWN_MS;
  const match = {
    id: Math.random().toString(36).slice(2, 10), gameId, game, config, state, players, vsBot,
    bot: vsBot ? makeBot(gameId, botSeat) : null, botSeat,
    timer: null, lastSent: '', running: false, ended: false,
  };
  matches.add(match);
  players.forEach((ws, seat) => {
    if (!ws) return;
    ws.match = match;
    ws.seat = seat;
    ws.recentGames = [gameId, ...(ws.recentGames || [])].slice(0, 2);
  });
  const names = players.map((p) => p?.name ?? `${pick(BOT_NAMES)} 🤖`);
  const initial = snapshot(state);
  players.forEach((ws, seat) =>
    send(ws, { type: 'match', id: match.id, game: gameId, seat, names, config, state: initial, startsIn: countdown, vsBot }));
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
  }, countdown);
  broadcastHumans();
}

function tick(match, dt) {
  try {
    if (match.bot) match.bot(match.config, match.state, dt, (msg) => match.game.input(match.config, match.state, match.botSeat, msg));
    match.game.step(match.config, match.state, dt);
  } catch (err) {
    console.error(`[match ${match.id}] step failed`, err);
    endMatch(match, null, 'Game error');
    return;
  }
  const payload = `{"type":"state","id":"${match.id}","state":${JSON.stringify(match.state, stateReplacer)}}`;
  if (payload !== match.lastSent) {
    match.lastSent = payload;
    for (const ws of match.players) send(ws, payload);
  }
  if (match.state.over) endMatch(match, match.state.over.winner, match.state.over.reason);
}

function endMatch(match, winner, reason, skip = null) {
  if (match.ended) return;
  match.ended = true;
  clearTimeout(match.timer);
  clearInterval(match.timer);
  matches.delete(match);
  for (const ws of match.players) {
    if (!ws) continue;
    if (ws !== skip) send(ws, { type: 'end', id: match.id, winner, reason });
    if (ws.match === match) ws.match = null;
  }
  console.log(`[match ${match.id}] over: winner=${winner} (${reason})`);
  broadcastHumans();
  broadcastStats();
}

// Leaving a match early hands the win to the other side.
function leaveMatch(ws, reason) {
  const match = ws.match;
  if (!match) return;
  endMatch(match, 1 - ws.seat, reason, ws);
}

wss.on('connection', (ws) => {
  ws.name = `${pick(ADJ)} ${pick(ANIMAL)}`;
  ws.isAlive = true;
  ws.match = null;
  ws.inFeed = false;
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { type: 'hello', name: ws.name, games: GAME_IDS.map((id) => ({ id, name: GAMES[id].name })) });
  broadcastStats();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'next':
      case 'find':
        requestNext(ws, msg.game);
        break;
      case 'botNow':
        // Skip the wait for a human.
        if (queue.includes(ws)) { removeFromQueue(ws); startMatch([ws, null]); broadcastHumans(); }
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
        // Back to the home screen: out of the feed entirely.
        ws.inFeed = false;
        removeFromQueue(ws);
        leaveMatch(ws, 'Opponent left');
        broadcastHumans();
        broadcastStats();
        break;
    }
  });

  ws.on('close', () => {
    removeFromQueue(ws);
    leaveMatch(ws, 'Opponent disconnected');
    // Stats broadcast after the client set updates.
    setImmediate(() => { broadcastHumans(); broadcastStats(); });
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
