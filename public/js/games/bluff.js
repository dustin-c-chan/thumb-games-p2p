import { BET, DECISION_SECONDS, HANDS, legalActions } from '../../shared/games/bluff.js';
import { COLORS, circle, text } from '../draw.js';
import { GOLD, badge, buttonRow, createCardAnimator, drawButtons, drawChipStack, drawFelt, feltText, hitButton, timerRing } from '../cards.js';

const CW = 84, CH = 120;
const FROM = { x: 200, y: 300 };

export default function bluffClient({ seat, names, send }) {
  const anim = createCardAnimator();
  let buttons = [];
  let pressed = null;

  function avatar(ctx, x, y, name, color) {
    circle(ctx, x, y, 30, 'rgba(0,0,0,.35)');
    circle(ctx, x, y - 2, 28, color, '#fff', 2);
    circle(ctx, x - 9, y - 6, 3.5, '#1b1a25');
    circle(ctx, x + 9, y - 6, 3.5, '#1b1a25');
    ctx.beginPath();
    ctx.arc(x, y + 4, 9, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = '#1b1a25';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    text(ctx, name, x, y + 44, { size: 13, weight: 800, color: '#fff' });
  }

  return {
    render(ctx, state) {
      const opp = 1 - seat;
      drawFelt(ctx, { tint: 'red' });
      feltText(ctx, 'HIGHER CARD WINS · ACES HIGH', 200, 300, 11);
      feltText(ctx, `HAND ${state.hand} OF ${HANDS}`, 200, 316, 10);

      // Opponent: their card is stuck to their forehead, and you can see it.
      if (state.cards[opp]) anim.draw(ctx, state.cards[opp], 200 - CW / 2, 40, { w: CW, h: CH, from: FROM });
      avatar(ctx, 200, 196, names[opp], '#ffb3c6');
      text(ctx, 'Their card ↑', 300, 100, { size: 12, weight: 700, color: 'rgba(255,255,255,.7)' });
      drawChipStack(ctx, 72, 196, state.chips[opp], { r: 11, maxPerStack: 8 });
      text(ctx, `${state.chips[opp]}`, 72, 222, { size: 14, weight: 900, color: GOLD });

      // Pot.
      if (state.pot) {
        drawChipStack(ctx, 318, 262, state.pot, { r: 13 });
        badge(ctx, `POT ${state.pot}`, 318, 228, { size: 12 });
      }

      // You: your card is face down until the showdown.
      const mine = state.cards[seat];
      if (mine) {
        anim.draw(ctx, mine, 200 - CW / 2, 338, { w: CW, h: CH, from: FROM });
        if (mine.down) {
          circle(ctx, 200, 398, 22, 'rgba(0,0,0,.55)', GOLD, 2);
          text(ctx, '?', 200, 400, { size: 26, weight: 900, color: GOLD });
        }
      }
      text(ctx, mine?.down ? 'Your card (hidden from you!)' : 'Your card', 200, 474, { size: 12, weight: 700, color: 'rgba(255,255,255,.75)' });
      drawChipStack(ctx, 72, 410, state.chips[seat], { r: 11, maxPerStack: 8 });
      text(ctx, `${state.chips[seat]}`, 72, 436, { size: 14, weight: 900, color: GOLD });
      text(ctx, 'You', 328, 400, { size: 14, weight: 800, color: COLORS.you });

      // Latest action, e.g. "Bets 2".
      const last = state.actions[state.actions.length - 1];
      if (last && state.phase === 'act') {
        const who = last.seat === seat ? 'You' : 'They';
        const verb = { check: 'check', bet: `bet ${state.betSize}`, call: 'call', fold: 'fold' }[last.type];
        badge(ctx, `${who} ${verb}`, last.seat === seat ? 328 : 300, last.seat === seat ? 430 : 150, { size: 12, bg: '#2a1a0e' });
      }

      // Turn timer.
      if (state.phase === 'act') {
        const y = state.toAct === seat ? 470 : 196;
        const x = state.toAct === seat ? 128 : 250;
        timerRing(ctx, x, y, 12, state.timer / DECISION_SECONDS);
      }

      const acts = legalActions(state, seat);
      const STY = { check: 'gray', bet: 'gold', call: 'green', fold: 'red' };
      buttons = buttonRow(acts.map((a) => ({ id: a, label: a.toUpperCase(), style: STY[a], sub: a === 'bet' ? `${Math.min(BET, state.chips[seat])} CHIPS` : a === 'call' ? `${state.betSize} CHIPS` : undefined })));
      drawButtons(ctx, buttons, pressed);
      if (!acts.length && state.phase === 'act') text(ctx, 'They’re reading your card…', 200, 540, { size: 15, weight: 700, color: 'rgba(255,255,255,.8)' });

      // Showdown banner.
      if (state.phase === 'showdown' && state.result) {
        const r = state.result;
        const youWon = r.winner === seat;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(18, 492, 364, 76);
        const head = r.winner == null ? 'Split pot' : youWon ? `You win ${r.pot}!` : `They win ${r.pot}`;
        text(ctx, head, 200, 518, { size: 22, weight: 900, color: r.winner == null ? '#fff' : youWon ? COLORS.good : COLORS.them });
        const folded = r.text === 'Fold';
        const who = folded ? (r.winner === seat ? 'They folded' : 'You folded') : r.text;
        text(ctx, who, 200, 546, { size: 13, weight: 700, color: 'rgba(255,255,255,.8)' });
      }
    },

    pointerDown(p) {
      const b = hitButton(buttons, p);
      if (!b) return;
      pressed = b.id;
      setTimeout(() => { pressed = null; }, 140);
      send({ type: b.id });
    },
  };
}
