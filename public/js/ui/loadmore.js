/** Per-store "Load more" panels with honest progress ("12 of 334 loaded"). */
import { COLORS, NAMES } from '../constants.js';
import { $, setHTML } from '../lib/dom.js';
import { num } from '../lib/format.js';
import { state } from '../state.js';
import { loadedFor } from '../selectors.js';

export function renderLoadMore() {
  const more = state.active.filter((k) => state.src[k].state === 'done' && state.src[k].hasMore);

  const panels = more.map((key) => {
    const s = state.src[key];
    const loaded = loadedFor(key);
    const left = s.total != null ? s.total - s.next : null;
    const nextCount = Math.min(state.batch, left ?? state.batch);
    const percent = s.total ? Math.min(100, Math.round((loaded / s.total) * 100)) : 0;
    return `<div class="lm">
      <div class="lm-top"><b><i style="background:${COLORS[key]}"></i>${NAMES[key]}</b><span>${s.total != null ? `${num(loaded)} of ${num(s.total)} loaded` : `${num(loaded)} loaded`}</span></div>
      ${s.total != null ? `<div class="bar" aria-hidden="true"><i style="width:${percent}%"></i></div>` : ''}
      <button class="btn" data-act="more" data-k="${key}" ${state.busy ? 'disabled' : ''}>Load ${num(nextCount)} more${left != null ? ` · ${num(left)} left` : ''}</button>
    </div>`;
  });

  if (more.length > 1) {
    panels.push(
      `<button class="btn primary" data-act="more-all" ${state.busy ? 'disabled' : ''}>Load more from all stores</button>`,
    );
  }
  if (!panels.length && state.items.length && !state.busy) {
    panels.push('<div class="lm-end">That’s everything these stores will show for this search.</div>');
  }
  setHTML($('#loadmore'), panels.join(''));
}
