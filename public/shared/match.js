// Helpers shared by the real server and the in-browser (vs computer) match runner.

// Round floats and drop private `_` keys to keep the per-tick payload small.
export function stateReplacer(key, value) {
  if (key.startsWith('_')) return undefined;
  if (typeof value === 'number' && !Number.isInteger(value)) return Math.round(value * 100) / 100;
  return value;
}

export const snapshot = (state) => JSON.parse(JSON.stringify(state, stateReplacer));

// Card games hide information (your hole card, the deck order). A game may define
// `view(state, seat)` returning only what that seat may see; everyone else sees it all.
export const viewFor = (game, state, seat) => (game.view ? game.view(state, seat) : state);
