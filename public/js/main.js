// Client shell: connection, screens, canvas sizing, input routing, render loop.
import { GAMES } from '../shared/registry.js';
import chessClient from './games/chess.js';
import hockeyClient from './games/hockey.js';
import hoopsClient from './games/hoops.js';
import golfClient from './games/golf.js';

const CLIENTS = { chess: chessClient, hockey: hockeyClient, hoops: hoopsClient, golf: golfClient };
const VIEW_W = 400;
const VIEW_H = 600;

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const overlay = $('overlay');

let ws = null;
let myName = '';
let current = null; // { client, state, seat, names, gameId, startsAt, ended }
let reconnectDelay = 500;
// `?game=hockey` forces a specific game (handy for testing; both players need it).
const wantGame = new URLSearchParams(location.search).get('game');

// ---------------------------------------------------------------------------
// Screens
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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
    $('play').disabled = true;
    $('play').textContent = 'Reconnecting…';
    if (current && !current.ended) endCurrent();
    if (document.querySelector('.screen.active')?.id !== 'home') show('home');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(5000, reconnectDelay * 2);
  };
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function onMessage(msg) {
  switch (msg.type) {
    case 'hello':
      myName = msg.name;
      $('my-name').textContent = myName;
      break;
    case 'stats': {
      const txt = `${msg.online} online · ${msg.playing} playing · ${msg.waiting} waiting`;
      $('stats').textContent = txt;
      $('search-stats').textContent = txt;
      break;
    }
    case 'match':
      startMatch(msg);
      break;
    case 'state':
      if (current) current.state = msg.state;
      break;
    case 'end':
      if (current) showResult(msg);
      break;
  }
}

// ---------------------------------------------------------------------------
// Match lifecycle
// ---------------------------------------------------------------------------

function findMatch() {
  if (current) endCurrent();
  send({ type: 'find', game: wantGame || undefined });
  show('search');
}

function startMatch(msg) {
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
  current = { client, state: msg.state, seat: msg.seat, names: msg.names, gameId: msg.game, startsAt: performance.now() + msg.startsIn, ended: false };
  $('game-title').textContent = meta.name;
  $('vs').innerHTML = `<span class="y">You</span> vs <span class="t">${esc(opp)}</span>`;
  show('game');
  navigator.vibrate?.(60);
  runCountdown(meta, opp);
}

function runCountdown(meta, opp) {
  const tick = () => {
    if (!current || current.ended) return;
    const left = Math.ceil((current.startsAt - performance.now()) / 1000);
    if (left <= 0) { setOverlay(null); return; }
    setOverlay(`
      <div class="kicker">vs ${esc(opp)}</div>
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
  const cls = msg.winner == null ? '' : mine ? 'win' : 'lose';
  const label = msg.winner == null ? 'Draw!' : mine ? 'You win!' : 'You lose';
  navigator.vibrate?.(mine ? [60, 60, 120] : 200);
  setOverlay(`
    <div class="kicker">${esc(GAMES[current.gameId].name)}</div>
    <div class="result ${cls}">${label}</div>
    <p class="reason">${esc(msg.reason || '')}</p>
    <div class="row">
      <button class="big-btn" id="again">Next game</button>
    </div>
    <button class="ghost-btn" id="home-btn">Home</button>`);
  $('again').onclick = findMatch;
  $('home-btn').onclick = () => { endCurrent(); show('home'); };
}

function endCurrent() {
  if (!current) return;
  if (!current.ended) current.client.destroy?.();
  current = null;
  setOverlay(null);
}

$('play').onclick = findMatch;
$('cancel').onclick = () => { send({ type: 'cancel' }); show('home'); };
$('leave').onclick = () => {
  if (current && !current.ended && !confirm('Leave this match? It counts as a loss.')) return;
  send({ type: 'leave' });
  endCurrent();
  show('home');
};

// ---------------------------------------------------------------------------
// Canvas sizing & input
// ---------------------------------------------------------------------------

let scale = 1;
function resize() {
  const stage = $('stage');
  const w = stage.clientWidth - 8, h = stage.clientHeight - 8;
  if (w <= 0 || h <= 0) return;
  scale = Math.min(w / VIEW_W, h / VIEW_H);
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
window.addEventListener('keydown', (e) => { if (live() && !e.repeat) current.client.keyDown?.(e.key); });
window.addEventListener('keyup', (e) => { if (live()) current.client.keyUp?.(e.key); });

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (current) {
    const k = canvas.width / VIEW_W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    current.client.render(ctx, current.state, dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

connect();
