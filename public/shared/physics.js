// Tiny 2D collision helpers shared by the physics games.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return { x: ax + dx * t, y: ay + dy * t, t };
}

export function limitSpeed(b, max) {
  const s = Math.hypot(b.vx, b.vy);
  if (s > max) { b.vx *= max / s; b.vy *= max / s; }
}

// Push ball `b` (x,y,vx,vy) out of a point/capsule at (qx,qy) with combined radius `rad`.
// `svx,svy` is the surface velocity (for moving flippers). Returns true on contact.
export function resolveAgainstPoint(b, qx, qy, rad, e, svx = 0, svy = 0) {
  let nx = b.x - qx, ny = b.y - qy;
  const d = Math.hypot(nx, ny);
  if (d >= rad) return false;
  if (d < 1e-6) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
  b.x = qx + nx * rad;
  b.y = qy + ny * rad;
  const rvx = b.vx - svx, rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
  }
  return true;
}

export function resolveAgainstSegment(b, r, ax, ay, bx, by, thick, e, svx = 0, svy = 0) {
  const q = closestOnSegment(b.x, b.y, ax, ay, bx, by);
  return resolveAgainstPoint(b, q.x, q.y, r + thick, e, svx, svy) ? q : null;
}

// Axis-aligned rectangle {x,y,w,h}.
export function resolveAgainstRect(b, r, rect, e) {
  const qx = clamp(b.x, rect.x, rect.x + rect.w);
  const qy = clamp(b.y, rect.y, rect.y + rect.h);
  if (qx === b.x && qy === b.y) {
    // Center is inside the rect: shove out along the shallowest axis.
    const left = b.x - rect.x, right = rect.x + rect.w - b.x;
    const top = b.y - rect.y, bottom = rect.y + rect.h - b.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) { b.x = rect.x - r; b.vx = -Math.abs(b.vx) * e; }
    else if (m === right) { b.x = rect.x + rect.w + r; b.vx = Math.abs(b.vx) * e; }
    else if (m === top) { b.y = rect.y - r; b.vy = -Math.abs(b.vy) * e; }
    else { b.y = rect.y + rect.h + r; b.vy = Math.abs(b.vy) * e; }
    return true;
  }
  return resolveAgainstPoint(b, qx, qy, r, e);
}
