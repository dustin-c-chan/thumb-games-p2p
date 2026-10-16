// Casino-table drawing kit for the card games: felt, cards (with deal/flip animation),
// chip stacks, pill buttons and badges. Everything draws in the 400x600 view space.
import { RANKS, SUITS, isRed } from '../shared/cards.js';
import { circle, roundRect, text } from './draw.js';

export const CARD_W = 66;
export const CARD_H = 94;
export const GOLD = '#e8c26a';
export const GOLD_DARK = '#9a7a2e';
export const SHOE = { x: 352, y: 132 };
const DEAL_MS = 320;
const FLIP_MS = 280;

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// --- Table -----------------------------------------------------------------------------

export function drawFelt(ctx, { tint = 'green' } = {}) {
  const [inner, outer] = tint === 'blue' ? ['#1f5f86', '#0b2236'] : tint === 'red' ? ['#7a2234', '#2a0910'] : ['#1f8a55', '#0a3a22'];
  ctx.fillStyle = '#0b0a10';
  ctx.fillRect(0, 0, 400, 600);
  // Padded rail.
  roundRect(ctx, 6, 6, 388, 588, 46, '#3b2414');
  roundRect(ctx, 10, 10, 380, 580, 42, '#5a3820');
  // Felt with a soft spotlight.
  const g = ctx.createRadialGradient(200, 300, 30, 200, 300, 380);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  roundRect(ctx, 18, 18, 364, 564, 36, g);
  // Gold pinstripe.
  ctx.strokeStyle = 'rgba(232,194,106,.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(28, 28, 344, 544, 30);
  ctx.stroke();
  // Subtle felt grain.
  ctx.fillStyle = 'rgba(255,255,255,.018)';
  for (let y = 22; y < 580; y += 4) ctx.fillRect(22, y, 356, 1);
}

export function feltText(ctx, str, x, y, size = 13) {
  text(ctx, str, x, y, { size, weight: 800, color: 'rgba(232,194,106,.5)' });
}

export function drawShoe(ctx, x = SHOE.x, y = SHOE.y) {
  roundRect(ctx, x - 26, y - 34, 52, 70, 8, '#2a1a0e', GOLD_DARK);
  for (let i = 3; i >= 0; i--) drawCardBack(ctx, x - 22 + i * 1.5, y - 30 - i * 1.5, 40, 56);
}

// --- Cards -----------------------------------------------------------------------------

function pipFace(ctx, x, y, w, h, card, color) {
  const suit = SUITS[card.s];
  if (card.r > 10) {
    // Court card: framed panel with a big letter and suit.
    roundRect(ctx, x + w * 0.2, y + h * 0.18, w * 0.6, h * 0.64, 4, isRed(card) ? '#fde8e8' : '#e8ecf8', color);
    text(ctx, RANKS[card.r], x + w / 2, y + h * 0.43, { size: w * 0.42, weight: 900, color });
    text(ctx, suit, x + w / 2, y + h * 0.66, { size: w * 0.26, weight: 700, color });
    ctx.fillStyle = GOLD;
    ctx.fillRect(x + w * 0.24, y + h * 0.22, w * 0.52, 2);
    ctx.fillRect(x + w * 0.24, y + h * 0.78 - 2, w * 0.52, 2);
  } else if (card.r === 1) {
    text(ctx, suit, x + w / 2, y + h / 2 + 2, { size: w * 0.62, weight: 700, color });
  } else {
    text(ctx, suit, x + w / 2, y + h / 2 + 2, { size: w * 0.5, weight: 700, color });
  }
}

export function drawCardFace(ctx, x, y, w, h, card, { glow } = {}) {
  ctx.save();
  ctx.shadowColor = glow || 'rgba(0,0,0,.45)';
  ctx.shadowBlur = glow ? 18 : 6;
  ctx.shadowOffsetY = glow ? 0 : 3;
  roundRect(ctx, x, y, w, h, w * 0.1, '#fdfcf7');
  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, w * 0.1, null, 'rgba(0,0,0,.18)');
  const color = isRed(card) ? '#c8102e' : '#16161d';
  const rs = Math.max(10, w * 0.24);
  text(ctx, RANKS[card.r], x + w * 0.16, y + rs * 0.7, { size: rs, weight: 900, color });
  text(ctx, SUITS[card.s], x + w * 0.16, y + rs * 1.55, { size: rs * 0.8, weight: 700, color });
  ctx.save();
  ctx.translate(x + w, y + h);
  ctx.rotate(Math.PI);
  text(ctx, RANKS[card.r], w * 0.16, rs * 0.7, { size: rs, weight: 900, color });
  text(ctx, SUITS[card.s], w * 0.16, rs * 1.55, { size: rs * 0.8, weight: 700, color });
  ctx.restore();
  pipFace(ctx, x, y, w, h, card, color);
}

export function drawCardBack(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  roundRect(ctx, x, y, w, h, w * 0.1, '#fdfcf7');
  ctx.restore();
  const m = w * 0.07;
  roundRect(ctx, x + m, y + m, w - 2 * m, h - 2 * m, w * 0.06, '#8d1b2c');
  // Diamond lattice.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + m, y + m, w - 2 * m, h - 2 * m, w * 0.06);
  ctx.clip();
  ctx.strokeStyle = 'rgba(232,194,106,.45)';
  ctx.lineWidth = 1;
  const step = w * 0.16;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + i + h, y); ctx.lineTo(x + i, y + h); ctx.stroke();
  }
  ctx.restore();
  roundRect(ctx, x + m + 2, y + m + 2, w - 2 * m - 4, h - 2 * m - 4, w * 0.05, null, GOLD);
  circle(ctx, x + w / 2, y + h / 2, w * 0.14, '#8d1b2c', GOLD, 1.5);
  text(ctx, '★', x + w / 2, y + h / 2 + 1, { size: w * 0.16, color: GOLD });
}

// Tracks when each card id first appeared and when it turned face-up, so cards fly in
// from the shoe and flip over instead of popping into place.
export function createCardAnimator() {
  const seen = new Map(); // id -> { at, down }
  let batch = 0, batchAt = 0;
  return {
    // Draw `card` (or a face-down placeholder) whose resting top-left is (x, y).
    draw(ctx, card, x, y, { w = CARD_W, h = CARD_H, from = SHOE, glow } = {}) {
      const now = performance.now();
      let rec = seen.get(card.id);
      if (!rec) {
        // Stagger cards that show up in the same frame (a deal).
        if (now - batchAt > 50) { batch = 0; batchAt = now; }
        rec = { at: now + batch * 140, down: !!card.down, flipAt: 0 };
        batch++;
        seen.set(card.id, rec);
      }
      if (rec.down && !card.down) { rec.down = false; rec.flipAt = now; }
      const t = ease((now - rec.at) / DEAL_MS);
      if (now < rec.at) return; // still in the shoe
      const cx = from.x + (x + w / 2 - from.x) * t;
      const cy = from.y + (y + h / 2 - from.y) * t;
      const spin = (1 - t) * 0.5;
      const ft = rec.flipAt ? Math.min(1, (now - rec.flipAt) / FLIP_MS) : 1;
      const sx = rec.flipAt && ft < 1 ? Math.abs(Math.cos(ft * Math.PI)) : 1;
      const showFace = !card.down && (!rec.flipAt || ft >= 0.5);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      ctx.scale(Math.max(0.02, sx), 1);
      if (showFace) drawCardFace(ctx, -w / 2, -h / 2, w, h, card, { glow });
      else drawCardBack(ctx, -w / 2, -h / 2, w, h);
      ctx.restore();
    },
  };
}

// --- Chips, badges, buttons ------------------------------------------------------------

const CHIP_COLORS = [
  [100, '#1c1c24', '#e8c26a'],
  [25, '#1f6b3a', '#ffffff'],
  [5, '#b3202f', '#ffffff'],
  [1, '#f2f2f2', '#2a5bd7'],
];

export function drawChip(ctx, x, y, r, base, edge) {
  ctx.beginPath();
  ctx.ellipse(x, y + 2, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.setLineDash([r * 0.35, r * 0.35]);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, r - 2, (r - 2) * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// A stack (or a few stacks) of chips adding up to roughly `amount`.
export function drawChipStack(ctx, x, y, amount, { r = 14, unit = 1, maxPerStack = 10 } = {}) {
  const stacks = [];
  let left = Math.max(0, Math.round(amount / unit));
  for (const [v, base, edge] of CHIP_COLORS) {
    const n = Math.floor(left / v);
    if (n) stacks.push({ n: Math.min(maxPerStack, n), base, edge });
    left -= n * v;
  }
  stacks.slice(0, 3).forEach((s, i) => {
    const sx = x + (i - (Math.min(3, stacks.length) - 1) / 2) * r * 2.1;
    for (let k = 0; k < s.n; k++) drawChip(ctx, sx, y - k * 4, r, s.base, s.edge);
  });
}

export function badge(ctx, str, x, y, { bg = 'rgba(0,0,0,.6)', color = '#fff', border = GOLD, size = 15 } = {}) {
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  const w = Math.max(34, ctx.measureText(str).width + 20);
  roundRect(ctx, x - w / 2, y - size * 0.9, w, size * 1.8, size * 0.9, bg, border);
  text(ctx, str, x, y + 1, { size, weight: 800, color });
}

const BTN_STYLES = {
  gold: ['#ffe28a', '#d9a42b', '#5a3d00'],
  green: ['#5fe08a', '#1f9a4d', '#062b12'],
  red: ['#ff7a7a', '#c62a35', '#ffffff'],
  gray: ['#e9e7f2', '#9a96b5', '#1b1a25'],
  blue: ['#7cc8ff', '#2a77d9', '#ffffff'],
};

// Buttons are drawn on the canvas and hit-tested by the game client.
export function drawButtons(ctx, buttons, pressedId) {
  for (const b of buttons) {
    const [top, bottom, fg] = BTN_STYLES[b.style || 'gold'];
    const pressed = pressedId === b.id;
    const y = b.y + (pressed ? 3 : 0);
    roundRect(ctx, b.x, b.y + 5, b.w, b.h, b.h / 2, 'rgba(0,0,0,.45)');
    const g = ctx.createLinearGradient(0, y, 0, y + b.h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    roundRect(ctx, b.x, y, b.w, b.h, b.h / 2, g);
    roundRect(ctx, b.x + 6, y + 3, b.w - 12, b.h * 0.38, b.h / 3, 'rgba(255,255,255,.28)');
    text(ctx, b.label, b.x + b.w / 2, y + b.h / 2 + (b.sub ? -6 : 1), { size: b.size || 17, weight: 900, color: fg });
    if (b.sub) text(ctx, b.sub, b.x + b.w / 2, y + b.h / 2 + 11, { size: 11, weight: 800, color: fg });
  }
}

export const hitButton = (buttons, p) => buttons.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y - 4 && p.y <= b.y + b.h + 6);

// Lay out `n` buttons across the bottom of the table.
export function buttonRow(specs, y = 506, h = 52) {
  const gap = 10, total = 344;
  const w = (total - gap * (specs.length - 1)) / specs.length;
  return specs.map((s, i) => ({ ...s, x: 28 + i * (w + gap), y, w, h }));
}

// A circular countdown ring around a point, for decision timers.
export function timerRing(ctx, x, y, r, frac, color = GOLD) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, frac));
  ctx.strokeStyle = frac < 0.3 ? '#ff5c6a' : color;
  ctx.stroke();
}
