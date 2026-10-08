/** Insight tiles (lowest / average / highest / specials) and the price-spread strip. */
import { COLORS, NAMES } from '../constants.js';
import { $, setHTML } from '../lib/dom.js';
import { esc, money, offPct } from '../lib/format.js';
import { tween } from '../lib/tween.js';
import { state } from '../state.js';

/**
 * @param {object[]} vis     products currently shown
 * @param {object[]} priced  the subset of `vis` that has a price
 */
export function renderInsights(vis, priced) {
  const box = $('#insights');
  box.hidden = !priced.length;
  if (!priced.length) return;

  const prices = priced.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const cheapest = priced.find((p) => p.price === min);
  const dearest = priced.find((p) => p.price === max);
  const specials = vis.filter((p) => offPct(p) > 0);
  const bestDeal = specials.reduce((m, p) => Math.max(m, offPct(p)), 0);

  tween($('#inLow'), min, money);
  tween($('#inAvg'), avg, money);
  tween($('#inHigh'), max, money);
  tween($('#inSpec'), specials.length, (v) => String(Math.round(v)));
  $('#inLowS').textContent = `${cheapest.name} · ${cheapest.retailer}`;
  $('#inHighS').textContent = `${dearest.name} · ${dearest.retailer}`;
  $('#inAvgS').textContent = `across ${priced.length} product${priced.length === 1 ? '' : 's'}`;
  $('#inSpecS').textContent = specials.length ? `up to ${bestDeal}% off` : 'no discounts found';

  const spread = $('#spread');
  spread.hidden = priced.length < 2;
  if (priced.length < 2) return;

  // x position (%) of a price along the strip; inset so dots at the ends are not clipped
  const at = (v) => (max === min ? 50 : 1.5 + ((v - min) / (max - min)) * 97);
  setHTML(
    $('#track'),
    `<span class="avg" style="left:${at(avg)}%"><b>avg ${money(avg)}</b></span>` +
      priced
        .map(
          (p) =>
            `<span class="pt" style="left:${at(p.price)}%;background:${COLORS[p.source]}" title="${esc(p.name)} · ${money(p.price)}"></span>`,
        )
        .join(''),
  );
  $('#scMin').textContent = money(min);
  $('#scMax').textContent = money(max);
  setHTML(
    $('#legend'),
    state.active.map((k) => `<span><i style="background:${COLORS[k]}"></i>${NAMES[k]}</span>`).join(''),
  );
}
