/**
 * Every DOM event listener in the app, in one place. Listeners only translate a click or key
 * into an action (actions/*.js); they hold no logic of their own.
 *
 * Buttons inside lists use event delegation: they carry `data-act="..."` and ONE listener on the
 * container handles them, so rows can be rebuilt freely without re-attaching listeners.
 */
import { ALL_STORES } from './constants.js';
import { $ } from './lib/dom.js';
import { prefs } from './lib/prefs.js';
import { toast } from './lib/toast.js';
import { schedule } from './scheduler.js';
import { state } from './state.js';
import { goHome, run, search, setLayout, stop } from './actions/search.js';
import { clearFilters, pick, selectAllShown, toggleExpanded, toggleSelected } from './actions/selection.js';
import { exportSelected, retryProduct } from './actions/products.js';
import { checkSession, signOut } from './actions/session.js';
import { isMenuOpen, setMenuOpen, toggleTheme } from './ui/account.js';
import { closeDrawer, openDrawer } from './ui/drawer.js';

const input = $('#q');
const productById = (id) => state.items.find((p) => p.id === id);

/** Buttons that live on a row, card, or the drawer. */
function onProductAction(event, product) {
  const act = event.target.closest('[data-act]')?.dataset.act;
  if (act === 'toggle') toggleExpanded(product.id);
  else if (act === 'open') openDrawer(product.id);
  else if (act === 'sel') pick(product, event);
  else if (act === 'retry') retryProduct(product, event.target.closest('button'));
  else if (act === 'dr-sel') toggleSelected(product.id);
}

export function bindEvents() {
  // ---- search + navigation
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    search(input.value);
  });
  $('#brand').addEventListener('click', (e) => {
    e.preventDefault();
    goHome();
  });
  $('#stop').addEventListener('click', () => stop());
  window.addEventListener('popstate', () => {
    const q = new URLSearchParams(location.search).get('q');
    q ? search(q, { push: false }) : goHome(false);
  });

  // ---- home screen
  $('#home').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-btn');
    if (chip) return search(chip.textContent);

    const toggle = e.target.closest('.store-toggle');
    if (!toggle) return;
    const key = toggle.dataset.store;
    const wasOn = toggle.getAttribute('aria-pressed') === 'true';
    if (wasOn && state.stores.length === 1) return toast('Keep at least one store selected.');
    toggle.setAttribute('aria-pressed', String(!wasOn));
    state.stores = ALL_STORES.filter((s) => (s === key ? !wasOn : state.stores.includes(s)));
    prefs.write({ stores: state.stores });
  });
  $('#limit').addEventListener('change', (e) => {
    state.batch = parseInt(e.target.value, 10);
    prefs.write({ batch: state.batch });
  });

  // ---- toolbar
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    schedule();
  });
  $('#fStock').addEventListener('change', (e) => {
    state.fStock = e.target.checked;
    schedule();
  });
  $('#fPromise').addEventListener('change', (e) => {
    state.fPromise = e.target.checked;
    schedule();
  });
  $('#tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      state.tab = tab.dataset.tab;
      schedule();
    }
  });
  $('#vList').addEventListener('click', () => setLayout('list'));
  $('#vGrid').addEventListener('click', () => setLayout('gallery'));
  $('#selAll').addEventListener('change', (e) => selectAllShown(e.target.checked));

  // ---- list, gallery, drawer (delegated)
  const delegate = (e) => {
    const holder = e.target.closest('[data-id]');
    const product = holder && productById(holder.dataset.id);
    if (product) onProductAction(e, product);
  };
  $('#tbody').addEventListener('click', delegate);
  $('#gallery').addEventListener('click', delegate);
  $('#drawer').addEventListener('click', (e) => {
    const product = productById(state.drawerId);
    if (product) onProductAction(e, product);
  });
  $('#scrim').addEventListener('click', closeDrawer);
  $('#drClose').addEventListener('click', closeDrawer);

  // ---- buttons rendered outside the lists (store notices, Load more, empty state)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('#tbody, #gallery, #drawer')) return;
    const act = el.dataset.act;
    if (act === 'again' || act === 'more') run([el.dataset.k]);
    else if (act === 'more-all') run(state.active.filter((k) => state.src[k].state === 'done' && state.src[k].hasMore));
    else if (act === 'clear-filters') clearFilters();
  });

  // ---- export, theme, account
  $('#export').addEventListener('click', exportSelected);
  $('#theme').addEventListener('click', toggleTheme);
  $('#avatar').addEventListener('click', (e) => {
    e.stopPropagation();
    setMenuOpen(!isMenuOpen());
  });
  document.addEventListener('click', (e) => {
    if (isMenuOpen() && !e.target.closest('#userMenu')) setMenuOpen(false);
  });
  $('#logout').addEventListener('click', signOut);

  // ---- keyboard: "/" focuses search; Esc closes things from the top down
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === 'Escape') {
      if (isMenuOpen()) {
        setMenuOpen(false);
        $('#avatar').focus();
      } else if (state.drawerId) closeDrawer();
      else if (document.activeElement === input) input.blur();
      else if (state.selected.size) {
        state.selected.clear();
        schedule();
      }
    }
  });

  // ---- page chrome
  window.addEventListener('scroll', () => $('#appbar').classList.toggle('scrolled', scrollY > 4), { passive: true });
  window.addEventListener('offline', () => toast('You’re offline. Searching and exporting need internet.', 'error'));
  window.addEventListener('online', () => toast('Back online.', 'ok'));
}

export { checkSession };
