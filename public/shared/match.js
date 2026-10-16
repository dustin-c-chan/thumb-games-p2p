// Helpers shared by the real server and the in-browser (vs computer) match runner.

// Round floats and drop private `_` keys to keep the per-tick payload small.
export function stateReplacer(key, value) {
  if (key.startsWith('_')) return undefined;
  if (typeof value === 'number' && !Number.isInteger(value)) return Math.round(value * 100) / 100;
  return value;
}

export const snapshot = (state) => JSON.parse(JSON.stringify(state, stateReplacer));
