/** Results header: the status line under the title, and the Stop button. */
import { NAMES } from '../constants.js';
import { $, setHTML } from '../lib/dom.js';
import { esc } from '../lib/format.js';
import { state } from '../state.js';
import { loadedFor } from '../selectors.js';

export function renderMeta(vis) {
  const n = state.items.length;
  const filtered = vis.length !== (state.tab === 'all' ? n : loadedFor(state.tab));
  const text = state.busy
    ? `Fetching live from ${state.active.map((k) => NAMES[k]).join(' and ')}… ${n} loaded`
    : `${n} product${n === 1 ? '' : 's'} loaded${filtered ? ` · ${vis.length} match your filters` : ''}${state.finishedAt ? ` · live as of ${state.finishedAt}` : ''}`;
  setHTML($('#meta'), `<span class="dot ${state.busy ? 'busy' : ''}"></span><span>${esc(text)}</span>`);
  $('#stop').hidden = !state.busy;
}
