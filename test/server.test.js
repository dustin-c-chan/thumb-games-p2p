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
    const i = waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const next = (type, ms = 5000) => {
    const i = inbox.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { type, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), ms);
    });
  };
  return { ws, next, send: (m) => ws.send(JSON.stringify(m)), open: once(ws, 'open') };
}

test('two anonymous players get matched, play, and the leaver forfeits', async (t) => {
  const proc = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT), FORCE_GAME: 'hockey' }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => proc.kill());
  await new Promise((resolve) => proc.stdout.on('data', (d) => String(d).includes('running') && resolve()));

  const a = client(), b = client();
  await Promise.all([a.open, b.open]);
  const [ha, hb] = await Promise.all([a.next('hello'), b.next('hello')]);
  assert.ok(ha.name && hb.name);

  a.send({ type: 'find' });
  b.send({ type: 'find' });
  const [ma, mb] = await Promise.all([a.next('match'), b.next('match')]);
  assert.equal(ma.game, 'hockey');
  assert.deepEqual([ma.seat, mb.seat].sort(), [0, 1]);
  assert.deepEqual(ma.names, mb.names);

  // State starts streaming after the countdown.
  const s = await a.next('state', 6000);
  assert.ok(s.state.puck);
  a.send({ type: 'input', input: { type: 'flip', side: 0, down: true } });

  a.send({ type: 'leave' });
  const [ea, eb] = await Promise.all([a.next('end'), b.next('end')]);
  assert.equal(eb.winner, mb.seat);
  assert.equal(ea.winner, mb.seat);

  // Both can immediately queue again and get a fresh match.
  a.send({ type: 'find' });
  b.send({ type: 'find' });
  await Promise.all([a.next('match'), b.next('match')]);
  a.ws.close();
  const end = await b.next('end');
  assert.equal(end.reason, 'Opponent disconnected');
  b.ws.close();
});
