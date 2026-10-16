// Runs a match entirely in the browser against a computer opponent. It speaks the same
// messages as the real server ('match', 'state', 'end'), so the rest of the client
// doesn't care which one it is talking to.
import { GAMES, GAME_IDS } from '../shared/registry.js';
import { makeRng } from '../shared/rng.js';
import { snapshot } from '../shared/match.js';
import { makeBot, BOT_NAMES } from './bots.js';

const COUNTDOWN_MS = 1500;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
let lastGame = null;

export function startLocalMatch({ myName, gameId, onMessage }) {
  if (!GAMES[gameId]) {
    const fresh = GAME_IDS.filter((id) => id !== lastGame);
    gameId = pick(fresh);
  }
  lastGame = gameId;
  const game = GAMES[gameId];
  const seat = Math.random() < 0.5 ? 0 : 1;
  const botSeat = 1 - seat;
  const names = [];
  names[seat] = myName;
  names[botSeat] = `${pick(BOT_NAMES)} 🤖`;
  const { config, state } = game.create(makeRng(Math.floor(Math.random() * 2 ** 32)));
  const bot = makeBot(gameId, botSeat);
  let running = false;
  let ended = false;
  let timer = null;
  const id = `local-${Math.random().toString(36).slice(2, 8)}`;

  const emit = (msg) => onMessage(msg);
  const finish = (winner, reason) => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    clearInterval(timer);
    emit({ type: 'end', id, winner, reason });
  };

  emit({ type: 'match', id, game: gameId, seat, names, config, state: snapshot(state), startsIn: COUNTDOWN_MS, vsBot: true });

  timer = setTimeout(() => {
    if (ended) return;
    running = true;
    let last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try {
        bot(config, state, dt, (msg) => game.input(config, state, botSeat, msg));
        game.step(config, state, dt);
      } catch (err) {
        console.error(err);
        finish(null, 'Game error');
        return;
      }
      emit({ type: 'state', id, state: snapshot(state) });
      if (state.over) finish(state.over.winner, state.over.reason);
    }, 1000 / 60);
  }, COUNTDOWN_MS);

  return {
    input(msg) { if (running && !ended) game.input(config, state, seat, msg); },
    // Quietly stop (used when swiping away: no result screen for a game you skipped).
    stop() { ended = true; clearTimeout(timer); clearInterval(timer); },
    get ended() { return ended; },
  };
}
