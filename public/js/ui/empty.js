import { $ } from '../lib/dom.js';
import { esc } from '../lib/format.js';
import { ICON } from '../lib/icons.js';
import { state } from '../state.js';

/** Friendly message when nothing is shown. Three different reasons, three different messages. */
export function renderEmpty(vis) {
  const el = $('#empty');
  if (vis.length || state.busy) {
    el.hidden = true;
    return;
  }
  el.hidden = false;

  const everyStoreFailed = state.active.length > 0 && state.active.every((k) => state.src[k].state === 'error');
  if (state.items.length) {
    el.innerHTML = `${ICON.searchOff}<h3>Nothing matches these filters</h3><p>Try removing a filter to see the rest of what was loaded.</p><button class="btn" data-act="clear-filters">Clear filters</button>`;
  } else if (everyStoreFailed) {
    el.innerHTML = `${ICON.warnBig}<h3>Couldn’t get any results</h3><p>The messages above explain what went wrong with each store.</p>`;
  } else {
    el.innerHTML = `${ICON.searchOff}<h3>No products found for “${esc(state.q)}”</h3><p>Try a simpler or more general word, for example “soap” instead of “antibacterial hand soap”.</p>`;
  }
}
