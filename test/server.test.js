import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

const PORT = 3900 + Math.floor(Math.random() * 90);

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.type === msg.type && w.filter(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const next = (type, filter = () => true, ms = 6000) => {
    const i = inbox.findIndex((m) => m.type === type && filter(m));
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiters.push({ type, filter, resolve });
      setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), ms);
    });
  };
  const drop = (type) => { for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].type === type) inbox.splice(i, 1); };
  return { ws, next, drop, inbox, send: (m) => ws.send(JSON.stringify(m)), open: once(ws, 'open') };
}

test('the feed: bots when alone, humans first, forfeits on swipe/leave/disconnect', async (t) => {
  const proc = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), FORCE_GAME: 'pachinko', SOLO_GRACE_MS: '150', HUMAN_GRACE_MS: '3000' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => proc.kill());
  await new Promise((resolve) => proc.stdout.on('data', (d) => String(d).includes('running') && resolve()));

  // --- Alone: a bot match starts almost immediately and streams state. ---
  const a = client();
  await a.open;
  assert.ok((await a.next('hello')).name);
  a.send({ type: 'next' });
  const s1 = await a.next('searching');
  assert.equal(s1.others, 0);
  const m1 = await a.next('match');
  assert.equal(m1.vsBot, true);
  assert.match(m1.names[1 - m1.seat], /🤖/);
  const st = await a.next('state', (m) => m.id === m1.id);
  assert.ok(Array.isArray(st.state.balls));

  // Swiping mid-game moves on to a fresh match (no result screen for the skipped one).
  a.send({ type: 'next' });
  const m2 = await a.next('match', (m) => m.id !== m1.id);
  assert.equal(m2.vsBot, true);
  assert.ok(!a.inbox.some((m) => m.type === 'end' && m.id === m1.id));

  // --- A second human arrives: they wait for a partner, A is told a real player is ready. ---
  const b = client();
  await b.open;
  await b.next('hello');
  b.send({ type: 'next' });
  const sb = await b.next('searching');
  assert.equal(sb.others, 1);
  const hum = await a.next('humans', (m) => m.waiting === 1);
  assert.equal(hum.waiting, 1);

  // A swipes: the two humans are paired instead of either getting a bot.
  a.send({ type: 'next' });
  const [ma, mb] = await Promise.all([a.next('match', (m) => !m.vsBot), b.next('match')]);
  assert.equal(ma.id, mb.id);
  assert.equal(mb.vsBot, false);
  assert.deepEqual([ma.seat, mb.seat].sort(), [0, 1]);
  await a.next('state', (m) => m.id === ma.id);
  a.send({ type: 'input', input: { type: 'paddle', x: 120 } });

  // A swipes away mid-game: B wins.
  a.send({ type: 'next' });
  const eb = await b.next('end', (m) => m.id === mb.id);
  assert.equal(eb.winner, mb.seat);
  assert.equal(eb.reason, 'Opponent swiped to the next game');

  // B swipes while A is waiting -> paired again; then A disconnects.
  b.send({ type: 'next' });
  const [ma2, mb2] = await Promise.all([a.next('match', (m) => m.id !== ma.id && !m.vsBot), b.next('match', (m) => m.id !== mb.id)]);
  assert.equal(ma2.id, mb2.id);
  a.ws.close();
  const end = await b.next('end', (m) => m.id === mb2.id);
  assert.equal(end.reason, 'Opponent disconnected');
  assert.equal(end.winner, mb2.seat);

  // Back home: leaving the feed stops matchmaking for B.
  b.send({ type: 'leave' });
  b.ws.close();
});
