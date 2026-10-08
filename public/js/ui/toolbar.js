/** Store tabs (with live counts) and the per-store problem notices under the toolbar. */
import { COLORS, NAMES } from '../constants.js';
import { $, setHTML } from '../lib/dom.js';
import { esc, num } from '../lib/format.js';
import { ICON } from '../lib/icons.js';
import { state } from '../state.js';
import { loadedFor } from '../selectors.js';

export function renderTabs() {
  const tabs = [{ key: 'all', label: 'All stores', count: String(state.items.length) }].concat(
    state.active.map((key) => {
      const s = state.src[key];
      const loaded = loadedFor(key);
      return {
        key,
        label: NAMES[key],
        count: s.total != null ? `${loaded} of ${num(s.total)}` : String(loaded),
        state: s.state,
      };
    }),
  );

  setHTML(
    $('#tabs'),
    tabs
      .map((t) => {
        let lead = '';
        if (t.key !== 'all') {
          if (t.state === 'searching' || t.state === 'found') lead = '<span class="spin" aria-hidden="true"></span>';
          else if (t.state === 'error')
            lead = `<span class="warn" title="Problem loading this store">${ICON.warn}</span>`;
          else lead = `<i style="background:${COLORS[t.key]}"></i>`;
        }
        return `<button class="tab" role="tab" data-tab="${t.key}" aria-selected="${state.tab === t.key}">${lead}${esc(t.label)} <span class="n">${esc(t.count)}</span></button>`;
      })
      .join(''),
  );
}

export function renderNotices() {
  const out = [];
  for (const key of state.active) {
    const s = state.src[key];
    if (s.state === 'error') {
      out.push(
        `<div class="notice err" role="alert"><p><b>${NAMES[key]}:</b> ${esc(s.message)}</p><button class="btn sm" data-act="again" data-k="${key}">Try again</button></div>`,
      );
    } else {
      for (const text of [s.note, s.warning].filter(Boolean)) {
        out.push(`<div class="notice info"><p><b>${NAMES[key]}:</b> ${esc(text)}</p></div>`);
      }
    }
  }
  setHTML($('#notices'), out.join(''));
}
