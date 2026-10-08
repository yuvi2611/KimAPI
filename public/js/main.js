/**
 * Kimi front end: entry point. Plain ES modules, no build step.
 * Read docs/ARCHITECTURE.md first for the map of folders.
 */
import { ALL_STORES, BATCH_SIZES, DEFAULT_BATCH } from './constants.js';
import { $ } from './lib/dom.js';
import { prefs } from './lib/prefs.js';
import { renderAll } from './render.js';
import { setRenderer } from './scheduler.js';
import { state } from './state.js';
import { search } from './actions/search.js';
import { checkSession } from './actions/session.js';
import { bindEvents } from './events.js';
import { renderRecent, startTyper } from './ui/home.js';

/** Restore choices from the URL (shareable links) first, then from saved preferences. */
function restoreSettings() {
  const saved = prefs.read();
  const url = new URLSearchParams(location.search);

  const storeList = (url.get('s') || (saved.stores || []).join(',')).split(',').filter((s) => ALL_STORES.includes(s));
  if (storeList.length) state.stores = ALL_STORES.filter((s) => storeList.includes(s));

  const fromUrl = Number(url.get('n'));
  state.batch = BATCH_SIZES.includes(fromUrl)
    ? fromUrl
    : BATCH_SIZES.includes(saved.batch)
      ? saved.batch
      : DEFAULT_BATCH;
  $('#limit').value = state.batch;

  document
    .querySelectorAll('.store-toggle')
    .forEach((b) => b.setAttribute('aria-pressed', String(state.stores.includes(b.dataset.store))));

  if (saved.view === 'gallery') {
    state.view = 'gallery';
    $('#vList').setAttribute('aria-pressed', 'false');
    $('#vGrid').setAttribute('aria-pressed', 'true');
  }
  $('meta[name=theme-color]').content = document.documentElement.dataset.theme === 'dark' ? '#09090a' : '#ffffff';
}

setRenderer(renderAll);
restoreSettings();
bindEvents();
renderRecent();
startTyper();
checkSession();

const q = new URLSearchParams(location.search).get('q');
if (q) search(q, { push: false });
else $('#q').focus({ preventScroll: true });
