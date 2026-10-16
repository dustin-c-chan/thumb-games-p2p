import { BETS, DECISION_SECONDS, HANDS, legalActions, total } from '../../shared/games/blackjack.js';
import { COLORS, text } from '../draw.js';
import { CARD_H, CARD_W, GOLD, badge, buttonRow, createCardAnimator, drawButtons, drawChipStack, drawFelt, drawShoe, feltText, hitButton, timerRing } from '../cards.js';

const TOP_Y = 92;
const BOTTOM_Y = 318;
const SHOE = { x: 350, y: 268 };

function layoutHand(cards, y) {
  const n = cards.length;
  const step = n <= 1 ? 0 : Math.min(CARD_W + 8, 250 / (n - 1));
  const width = CARD_W + step * (n - 1);
  return cards.map((c, i) => ({ c, x: 200 - width / 2 + i * step, y }));
}

export default function blackjackClient({ seat, names, send }) {
  const anim = createCardAnimator();
  let buttons = [];
  let pressed = null;
  let lastState = null;

  return {
    render(ctx, state) {
      lastState = state;
      const meDealer = state.dealer === seat;
      const myCards = meDealer ? state.cards.dealer : state.cards.player;
      const theirCards = meDealer ? state.cards.player : state.cards.dealer;

      drawFelt(ctx);
      drawShoe(ctx, SHOE.x, SHOE.y);
      feltText(ctx, 'BLACKJACK PAYS 3 TO 2', 200, 262, 12);
      feltText(ctx, 'DEALER CHOOSES TO HIT OR STAND', 200, 280, 10);
      feltText(ctx, `HAND ${state.hand} OF ${HANDS}`, 200, 300, 11);

      // Opponent (top) and you (bottom): name, role, chips.
      const roleOf = (s) => (s === state.dealer ? 'DEALER' : 'PLAYER');
      const header = (s, y, mine) => {
        badge(ctx, roleOf(s), 84, y, { bg: s === state.dealer ? '#2a1a0e' : 'rgba(0,0,0,.55)', color: s === state.dealer ? GOLD : '#fff', size: 12 });
        text(ctx, mine ? 'You' : names[s], 132, y, { align: 'left', size: 14, weight: 800, color: mine ? COLORS.you : COLORS.them });
        drawChipStack(ctx, 312, y + 4, state.chips[s], { r: 10, unit: 25, maxPerStack: 6 });
        text(ctx, String(state.chips[s]), 352, y, { align: 'left', size: 14, weight: 900, color: GOLD });
      };
      header(1 - seat, 52, false);
      header(seat, 488, true);

      // Hands.
      const hand = (cards, y) => layoutHand(cards, y).forEach(({ c, x, y: cy }) => anim.draw(ctx, c, x, cy, { from: SHOE }));
      hand(theirCards, TOP_Y);
      hand(myCards, BOTTOM_Y);
      const totalBadge = (cards, y, mine) => {
        if (!cards.length) return;
        const t = total(cards);
        const hidden = cards.some((c) => c.down);
        const label = t.sum > 21 ? `${t.sum} BUST` : `${t.soft && t.sum < 21 ? 'soft ' : ''}${t.sum}${hidden ? ' + ?' : ''}`;
        badge(ctx, label, 200, y, { bg: t.sum > 21 ? '#7a1020' : t.sum === 21 ? '#1f6b3a' : 'rgba(0,0,0,.65)', border: mine ? COLORS.you : GOLD, size: 14 });
      };
      totalBadge(theirCards, TOP_Y + CARD_H + 18, false);
      totalBadge(myCards, BOTTOM_Y + CARD_H + 18, true);

      // The bet in the middle of the table.
      if (state.bet) {
        drawChipStack(ctx, 62, 284, state.bet, { r: 13, unit: 25, maxPerStack: 6 });
        text(ctx, `BET ${state.bet}${state.doubled ? ' ×2' : ''}`, 62, 306, { size: 11, weight: 900, color: GOLD });
      }

      // Whose move it is, with a countdown ring.
      const actor = state.phase === 'bet' || state.phase === 'player' ? state.player : state.phase === 'dealer' ? state.dealer : null;
      if (actor != null) {
        const y = actor === seat ? 488 : 52;
        timerRing(ctx, 38, y, 12, state.timer / DECISION_SECONDS);
      }

      // Buttons for whatever you can do right now.
      const acts = legalActions(state, seat);
      const pt = total(state.cards.player).sum;
      if (acts[0]?.startsWith('bet:')) {
        buttons = buttonRow(BETS.map((b) => ({ id: `bet:${b}`, label: String(b), sub: 'BET', style: b === 100 ? 'gold' : b === 50 ? 'blue' : 'green' })));
        text(ctx, 'You’re the player. Place your bet', 200, 232, { size: 15, weight: 800, color: '#fff' });
      } else if (acts.length) {
        buttons = buttonRow(acts.map((a) => ({
          id: a, label: a.toUpperCase(),
          style: a === 'hit' ? 'green' : a === 'stand' ? 'red' : 'gold',
          sub: a === 'double' ? `BET ${state.bet * 2}` : undefined,
        })));
        if (meDealer) text(ctx, `Player stands on ${pt}. Beat it, tie it, or bust`, 200, 232, { size: 14, weight: 800, color: '#fff' });
      } else {
        buttons = [];
        const waiting = {
          bet: 'Player is choosing a bet…',
          deal: 'Dealing…',
          player: meDealer ? 'Player is deciding…' : '',
          reveal: 'Revealing the hole card…',
          dealer: meDealer ? '' : 'Dealer is deciding…',
        }[state.phase];
        if (waiting) text(ctx, waiting, 200, 545, { size: 15, weight: 700, color: 'rgba(255,255,255,.8)' });
      }
      drawButtons(ctx, buttons, pressed);

      // Hand result.
      if (state.phase === 'settle' && state.result) {
        const youGain = state.player === seat ? state.result.amount : -state.result.amount;
        const col = youGain > 0 ? COLORS.good : youGain < 0 ? COLORS.them : '#fff';
        ctx.fillStyle = 'rgba(8,20,14,.88)';
        ctx.fillRect(18, 238, 364, 74);
        ctx.fillStyle = GOLD;
        ctx.fillRect(18, 238, 364, 1.5);
        ctx.fillRect(18, 310.5, 364, 1.5);
        text(ctx, state.result.text, 200, 258, { size: 16, weight: 800, color: '#fff' });
        text(ctx, youGain > 0 ? `+${youGain}` : youGain < 0 ? `−${-youGain}` : 'Push', 200, 288, { size: 26, weight: 900, color: col });
      }
    },

    pointerDown(p) {
      const b = hitButton(buttons, p);
      if (!b || !lastState) return;
      pressed = b.id;
      setTimeout(() => { pressed = null; }, 140);
      if (b.id.startsWith('bet:')) send({ type: 'bet', amount: Number(b.id.slice(4)) });
      else send({ type: b.id });
    },
  };
}
