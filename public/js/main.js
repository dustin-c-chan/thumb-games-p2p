// Client shell: the swipe-up feed of games. Handles the connection, the card slide
// transitions and swipe gestures, canvas sizing, input routing and the render loop.
import { GAMES } from '../shared/registry.js';
import chessClient from './games/chess.js';
import hoopsClient from './games/hoops.js';
import golfClient from './games/golf.js';
import pachinkoClient from './games/pachinko.js';
import blackjackClient from './games/blackjack.js';
import snapClient from './games/snap.js';
import bluffClient from './games/bluff.js';
import { startLocalMatch } from './local.js';

const CLIENTS = { chess: chessClient, hoops: hoopsClient, golf: golfClient, pachinko: pachinkoClient, blackjack: blackjackClient, snap: snapClient, bluff: bluffClient };
const ICONS = { chess: '♞', hoops: '🏀', golf: '⛳', pachinko: '✨', blackjack: '🂡', snap: '⚡', bluff: '🃏' };
const VIEW_W = 400;
const VIEW_H = 600;
const AUTO_NEXT_MS = 5000;

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const overlay = $('overlay');
const card = $('card');
const stage = $('stage');

let ws = null;
let local = null; // an in-browser match against the computer (offline mode or no connection)
let myName = '';
let inFeed = false;
let current = null; // { id, client, state, seat, names, gameId, startsAt, ended, vsBot, local }
let searching = null; // { timer: shuffle animation, start: pending local start }
let autoNext = null;
let reconnectDelay = 500;
const record = { w: 0, l: 0 };
const params = new URLSearchParams(location.search);
// `?game=blackjack` forces a specific game (handy for testing; both players need it).
const wantGame = params.get('game');
// Offline mode (no server, e.g. a static demo): every match is against the computer.
const OFFLINE = !!window.THUMB_OFFLINE || params.has('offline');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const online = () => !OFFLINE && ws?.readyState === WebSocket.OPEN;

// ---------------------------------------------------------------------------
// Screens & overlay
// ---------------------------------------------------------------------------

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  if (id === 'game') requestAnimationFrame(resize);
}

function setOverlay(html) {
  if (html == null) {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  } else {
    overlay.innerHTML = html;
    overlay.classList.remove('hidden');
  }
}

function setBanner(waiting) {
  const showIt = inFeed && waiting > 0 && !(current && !current.ended && !current.vsBot);
  $('banner').classList.toggle('hidden', !showIt);
  if (showIt) $('banner').textContent = waiting > 1 ? `🟢 ${waiting} real players are ready. Swipe up!` : '🟢 A real player is ready. Swipe up!';
}

function updateRecord() {
  $('record').textContent = `${record.w}–${record.l}`;
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    reconnectDelay = 500;
    $('play').disabled = false;
    $('play').textContent = 'PLAY';
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    $('play').textContent = 'Reconnecting…';
    if (current && !current.ended && !current.local) showResult({ id: current.id, winner: null, reason: 'Connection lost' });
    if (searching && inFeed) startLocal(); // keep the feed going against the computer
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(5000, reconnectDelay * 2);
  };
}

function send(msg) {
  if (local && !local.ended && current?.local) {
    if (msg.type === 'input') local.input(msg.input);
    return;
  }
  if (online()) ws.send(JSON.stringify(msg));
}

function onMessage(msg) {
  switch (msg.type) {
    case 'hello':
      myName = msg.name;
      $('my-name').textContent = myName;
      break;
    case 'stats': {
      const humans = msg.online === 1 ? 'Just you online right now' : `${msg.online} people online`;
      $('stats').textContent = `${humans} · ${msg.playing} playing`;
      break;
    }
    case 'searching':
      if (inFeed) showSearching(msg.graceMs, msg.others);
      break;
    case 'humans':
      setBanner(msg.waiting);
      break;
    case 'match':
      if (inFeed) startMatch(msg);
      break;
    case 'state':
      if (current && msg.id === current.id) current.state = msg.state;
      break;
    case 'end':
      if (current && msg.id === current.id && !current.ended) showResult(msg);
      break;
  }
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

function clearTimers() {
  clearTimeout(autoNext);
  autoNext = null;
  if (searching) { clearInterval(searching.timer); clearTimeout(searching.start); }
  searching = null;
}

function dropCurrent() {
  if (!current) return;
  if (!current.ended) {
    // Skipping a live game against a real person counts as a loss.
    if (!current.vsBot && performance.now() >= current.startsAt) { record.l++; updateRecord(); }
    current.client.destroy?.();
  }
  if (current.local) local?.stop();
  current = null;
}

let lastNext = -Infinity;
function nextGame({ fromDy = 0, animate = true } = {}) {
  const now = performance.now();
  if (now - lastNext < 450) return;
  lastNext = now;
  if (animate) slideTransition(fromDy);
  clearTimers();
  dropCurrent();
  setBanner(0);
  $('game-title').textContent = '';
  $('vs').textContent = '';
  if (online()) {
    send({ type: 'next', game: wantGame || undefined });
    showSearching(1500, 0);
  } else {
    showSearching(350, 0);
    searching.start = setTimeout(startLocal, 350);
  }
}

function startLocal() {
  clearTimers();
  local = startLocalMatch({ myName, gameId: wantGame, onMessage: (m) => onMessage(m.type === 'match' ? { ...m, local: true } : m) });
}

// "Shuffling" card shown while the server looks for a real player.
function showSearching(graceMs, others) {
  if (searching) { clearInterval(searching.timer); clearTimeout(searching.start); }
  const icons = Object.values(ICONS);
  let i = 0;
  const until = performance.now() + graceMs;
  const paint = () => {
    const left = Math.max(0, Math.ceil((until - performance.now()) / 1000));
    setOverlay(`
      <div class="slot">${icons[i++ % icons.length]}</div>
      <h2>${others ? 'Looking for a real player…' : 'Shuffling games…'}</h2>
      <p class="tagline">${others ? `${others} other ${others === 1 ? 'person is' : 'people are'} online · bot in ${left}s` : 'Real players first, bots when it’s quiet'}</p>
      ${others ? '<button class="ghost-btn" id="bot-now">Play a bot now</button>' : ''}`);
    const b = $('bot-now');
    if (b) b.onclick = () => send({ type: 'botNow' });
  };
  paint();
  searching = { timer: setInterval(paint, 130) };
}

function startMatch(msg) {
  clearTimers();
  dropCurrent();
  const meta = GAMES[msg.game];
  const opp = msg.names[1 - msg.seat];
  const client = CLIENTS[msg.game]({
    seat: msg.seat,
    config: msg.config,
    names: msg.names,
    send: (input) => {
      if (current && !current.ended && performance.now() >= current.startsAt) send({ type: 'input', input });
    },
  });
  current = {
    id: msg.id, client, state: msg.state, seat: msg.seat, names: msg.names, gameId: msg.game,
    startsAt: performance.now() + msg.startsIn, ended: false, vsBot: !!msg.vsBot, local: !!msg.local,
  };
  $('game-title').textContent = `${ICONS[msg.game]} ${meta.name}`;
  $('vs').innerHTML = `vs <span class="t">${esc(opp)}</span>`;
  if (!current.vsBot) setBanner(0);
  navigator.vibrate?.(current.vsBot ? 30 : [40, 40, 40]);
  runCountdown(meta, opp);
}

function runCountdown(meta, opp) {
  const me = current;
  const tick = () => {
    if (current !== me || me.ended) return;
    const left = Math.ceil((me.startsAt - performance.now()) / 1000);
    if (left <= 0) { setOverlay(null); return; }
    setOverlay(`
      <div class="kicker">vs ${esc(opp)}</div>
      <p class="tagline ${me.vsBot ? '' : 'human'}">${me.vsBot ? 'Computer opponent · real players jump the line' : '🟢 Real player!'}</p>
      <div class="name">${esc(meta.name)}</div>
      <p class="blurb">${esc(meta.blurb)}</p>
      <p class="controls">${esc(meta.controls)}</p>
      <div class="count">${left}</div>`);
    setTimeout(tick, 100);
  };
  tick();
}

function showResult(msg) {
  current.ended = true;
  current.client.destroy?.();
  const mine = msg.winner === current.seat;
  if (msg.winner != null) { mine ? record.w++ : record.l++; updateRecord(); }
  const cls = msg.winner == null ? '' : mine ? 'win' : 'lose';
  const label = msg.winner == null ? 'Draw!' : mine ? 'You win!' : 'You lose';
  navigator.vibrate?.(mine ? [60, 60, 120] : 200);
  setOverlay(`
    <div class="kicker">${esc(GAMES[current.gameId].name)}</div>
    <div class="result ${cls}">${label}</div>
    <p class="reason">${esc(msg.reason || '')}</p>
    <div class="swipe-hint"><span class="chev">︿</span>Swipe up for the next game</div>
    <div class="autobar"><i style="animation-duration:${AUTO_NEXT_MS}ms"></i></div>
    <div class="row"><button class="ghost-btn" id="home-btn">Home</button></div>`);
  $('home-btn').onclick = goHome;
  clearTimeout(autoNext);
  autoNext = setTimeout(() => nextGame(), AUTO_NEXT_MS);
}

function startFeed() {
  inFeed = true;
  show('game');
  nextGame({ animate: false });
}

function goHome() {
  clearTimers();
  dropCurrent();
  inFeed = false;
  setBanner(0);
  setOverlay(null);
  send({ type: 'leave' });
  show('home');
}

$('play').onclick = startFeed;
$('handle').onclick = () => nextGame();
$('banner').onclick = () => nextGame();
// Leaving mid-game against a real person counts as a loss, so it takes two taps then.
let leaveArmed = 0;
$('leave').onclick = () => {
  const liveHuman = current && !current.ended && !current.vsBot;
  if (liveHuman && performance.now() - leaveArmed > 2500) {
    leaveArmed = performance.now();
    $('leave').textContent = 'Tap again to forfeit';
    setTimeout(() => { $('leave').textContent = '✕'; }, 2500);
    return;
  }
  $('leave').textContent = '✕';
  goHome();
};

// ---------------------------------------------------------------------------
// Swipe gestures & slide transition
// ---------------------------------------------------------------------------

// The canvas belongs to the game; everything else on the game screen (header, overlay,
// handle, banner, margins) is a swipe surface. The card follows your finger.
let drag = null;
$('game').addEventListener('pointerdown', (e) => {
  if (e.target === canvas || drag) return;
  drag = { id: e.pointerId, y: e.clientY, t: performance.now(), dy: 0 };
});
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.dy = Math.min(0, e.clientY - drag.y);
  card.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const { dy, t } = drag;
  drag = null;
  const v = dy / Math.max(1, performance.now() - t); // px per ms (negative = up)
  if (dy < -90 || (dy < -30 && v < -0.6)) {
    nextGame({ fromDy: dy });
  } else if (dy) {
    card.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
  }
  card.style.transform = '';
};
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
// Desktop: scroll wheel or "N" for next.
let wheelAt = 0;
window.addEventListener('wheel', (e) => {
  if (!inFeed || e.deltaY < 30 || performance.now() - wheelAt < 700) return;
  wheelAt = performance.now();
  nextGame();
}, { passive: true });

function slideTransition(fromDy) {
  // Freeze the outgoing card as a picture and fling it up while the new card rises.
  if (canvas.width && canvas.height) {
    const ghost = document.createElement('canvas');
    ghost.className = 'ghost';
    ghost.width = canvas.width;
    ghost.height = canvas.height;
    ghost.getContext('2d').drawImage(canvas, 0, 0);
    ghost.style.width = canvas.style.width;
    ghost.style.height = canvas.style.height;
    ghost.style.left = `${card.offsetLeft}px`;
    ghost.style.top = `${card.offsetTop}px`;
    stage.appendChild(ghost);
    const out = ghost.animate(
      [{ transform: `translateY(${fromDy}px)`, opacity: 1 }, { transform: `translateY(-${card.offsetTop + canvas.clientHeight + 20}px)`, opacity: 0.4 }],
      { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
    out.onfinish = () => ghost.remove();
  }
  card.animate([{ transform: `translateY(${stage.clientHeight}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
}

// ---------------------------------------------------------------------------
// Canvas sizing & game input
// ---------------------------------------------------------------------------

function resize() {
  const w = stage.clientWidth - 8, h = stage.clientHeight - $('handle').offsetHeight - 6;
  if (w <= 0 || h <= 0) return;
  const scale = Math.min(w / VIEW_W, h / VIEW_H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  canvas.width = Math.round(VIEW_W * scale * dpr);
  canvas.height = Math.round(VIEW_H * scale * dpr);
}
window.addEventListener('resize', resize);

function toView(e) {
  const r = canvas.getBoundingClientRect();
  return { id: e.pointerId, x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
}

const live = () => current && !current.ended;
canvas.addEventListener('pointerdown', (e) => {
  if (!live()) return;
  canvas.setPointerCapture(e.pointerId);
  current.client.pointerDown?.(toView(e));
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => { if (live()) current.client.pointerMove?.(toView(e)); });
const up = (e) => { if (live()) current.client.pointerUp?.(toView(e)); };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (inFeed && (e.key === 'n' || e.key === 'N')) { nextGame(); return; }
  if (live() && !e.repeat) current.client.keyDown?.(e.key);
});
window.addEventListener('keyup', (e) => { if (live()) current.client.keyUp?.(e.key); });

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

let lastFrame = performance.now();
let idleT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const k = canvas.width / VIEW_W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (current) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    current.client.render(ctx, current.state, dt);
  } else if (inFeed) {
    // Between games: a soft animated backdrop under the "shuffling" card.
    idleT += dt;
    const g = ctx.createLinearGradient(0, 0, VIEW_W, VIEW_H);
    g.addColorStop(0, '#1d1830');
    g.addColorStop(1, '#101a2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(255,204,51,.06)';
    for (let i = 0; i < 12; i++) {
      const y = ((i * 60 + idleT * 120) % 720) - 60;
      ctx.fillRect(0, VIEW_H - y, VIEW_W, 18);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (OFFLINE) {
  const ADJ = ['Swift', 'Sneaky', 'Lucky', 'Mighty', 'Fuzzy', 'Turbo', 'Cosmic', 'Jolly'];
  const ANIMAL = ['Otter', 'Panda', 'Falcon', 'Llama', 'Gecko', 'Badger', 'Koala', 'Moose'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  myName = `${pick(ADJ)} ${pick(ANIMAL)}`;
  $('my-name').textContent = myName;
  $('play').disabled = false;
  $('play').textContent = 'PLAY';
  $('stats').textContent = 'Demo mode: every opponent is the computer. Real players need the game server.';
} else {
  connect();
}
