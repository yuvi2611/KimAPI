/** Starting, continuing, stopping and leaving a search. */
import { openSearchStream } from '../api/stream.js';
import { $ } from '../lib/dom.js';
import { clock, esc } from '../lib/format.js';
import { prefs } from '../lib/prefs.js';
import { toast } from '../lib/toast.js';
import { schedule } from '../scheduler.js';
import { resetResults, state } from '../state.js';
import { closeDrawer } from '../ui/drawer.js';
import { resetCards } from '../ui/gallery.js';
import { renderRecent, saveRecent, setView } from '../ui/home.js';
import { resetRows } from '../ui/list.js';
import { checkSession } from './session.js';

const input = $('#q');

const setBusy = (busy) => {
  state.busy = busy;
  document.body.dataset.busy = busy ? '1' : '0'; // drives the loading line under the top bar
};

function clearViews() {
  closeDrawer();
  resetRows();
  resetCards();
}

/** Begin a brand-new search across the chosen stores. */
export function search(raw, { push = true } = {}) {
  const q = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (q.length < 2) {
    toast('Type at least 2 characters to search.', 'error');
    return input.focus();
  }
  if (!state.stores.length) return toast('Pick at least one store.', 'error');
  if (!navigator.onLine) return toast('You’re offline. Connect to the internet and try again.', 'error');

  stop(true);
  clearViews();
  resetResults({ q, active: [...state.stores] });
  state.active.forEach((k) => {
    state.src[k] = { state: 'searching', total: null, next: 0, hasMore: false };
  });

  input.value = q;
  $('#title').innerHTML = `“<em>${esc(q)}</em>”`;
  document.title = `${q} · Kimi`;
  setView('results');
  if (push) history.pushState({}, '', `?${new URLSearchParams({ q, s: state.active.join(','), n: state.batch })}`);
  saveRecent(q);
  window.scrollTo({ top: 0 });
  run(state.active);
}

/** Fetch the next batch for the given stores (first batch, Load more, or Try again). */
export function run(keys) {
  if (state.busy) return;

  const offsets = {};
  for (const k of keys) {
    offsets[k] = state.src[k].next || 0;
    Object.assign(state.src[k], { state: 'searching', message: null });
  }
  setBusy(true);

  const end = () => {
    setBusy(false);
    state.stream = null;
  };

  state.stream = openSearchStream(
    { q: state.q, limit: state.batch, sources: keys, offsets },
    {
      onStatus(s) {
        const st = state.src[s.source];
        if (!st) return;
        Object.assign(st, {
          state: s.state,
          total: s.total ?? st.total,
          message: s.message || null,
          note: s.note || null,
          warning: s.warning || null,
        });
        if (s.state === 'done') {
          st.next = s.next;
          st.hasMore = s.hasMore;
        }
        if (s.state === 'error') st.hasMore = false;
        schedule();
      },
      onProduct(p) {
        if (state.items.some((x) => x.id === p.id)) return; // live results can shift between pages
        p._o = state.order++; // arrival order = relevance order
        p._v = 0; // bump to force a row/card rebuild
        state.items.push(p);
        schedule();
      },
      onDone() {
        end();
        state.finishedAt = clock();
        schedule();
      },
      onFatal({ message }) {
        toast(message, 'error');
        keys.forEach((k) => (state.src[k].state = 'idle'));
        end();
        schedule();
      },
      onError() {
        end();
        checkSession(); // a dropped stream can also mean our session expired
        for (const k of keys) {
          const st = state.src[k];
          if (['searching', 'found'].includes(st.state)) {
            Object.assign(st, {
              state: 'error',
              message: 'The connection dropped before this store finished. What loaded is kept. Try again to continue.',
            });
          }
        }
        toast('Connection lost while searching. What loaded is kept.', 'error');
        state.finishedAt = clock();
        schedule();
      },
    },
  );
  schedule();
}

/** Stop a search in progress. What has loaded is kept. */
export function stop(silent = false) {
  if (!state.stream) return;
  state.stream.close();
  state.stream = null;
  setBusy(false);
  for (const s of Object.values(state.src)) {
    if (['searching', 'found'].includes(s.state)) {
      s.state = 'idle';
      s.hasMore = s.next > 0 && s.total != null ? s.next < s.total : false;
    }
  }
  if (!silent) {
    state.finishedAt = clock();
    toast('Stopped. What’s loaded so far is kept.');
    schedule();
  }
}

/** Back to the home screen (the KIMI wordmark). */
export function goHome(push = true) {
  stop(true);
  clearViews();
  resetResults({ q: '', active: [] });
  setView('home');
  renderRecent();
  if (push) history.pushState({}, '', location.pathname);
  $('#export').hidden = true;
  input.value = '';
  input.focus();
}

/** List or gallery. Remembered for next time. */
export function setLayout(view) {
  state.view = view;
  prefs.write({ view });
  $('#vList').setAttribute('aria-pressed', String(view === 'list'));
  $('#vGrid').setAttribute('aria-pressed', String(view === 'gallery'));
  schedule();
}
