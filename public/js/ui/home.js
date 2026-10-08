/** Home screen pieces: switching between home/results, recent searches, the typing placeholder. */
import { $ } from '../lib/dom.js';
import { esc } from '../lib/format.js';
import { prefs } from '../lib/prefs.js';
import { prefersReducedMotion } from '../lib/tween.js';

const form = $('#form');
const input = $('#q');

/** Show the home or results screen. The search form physically moves into the top bar on results. */
export function setView(view) {
  document.body.dataset.view = view;
  $('#home').hidden = view !== 'home';
  $('#results').hidden = view !== 'results';
  if (view === 'results') $('#searchSlot').appendChild(form);
  else $('#opts').parentNode.insertBefore(form, $('#opts'));
  if (view === 'home') document.title = 'Kimi · A product of MoTaljaard';
}

export function saveRecent(q) {
  const recent = [q, ...(prefs.read().recent || []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
  prefs.write({ recent });
}

export function renderRecent() {
  const recent = prefs.read().recent || [];
  $('#recentWrap').hidden = !recent.length;
  $('#recent').innerHTML = recent.map((q) => `<button class="chip-btn" type="button">${esc(q)}</button>`).join('');
}

/** Types example searches into the placeholder. Pauses while the user is interacting. */
export function startTyper() {
  if (prefersReducedMotion) return;
  const words = ['deodorant', 'face wash', 'sunscreen SPF 50', 'moisturiser', 'toothpaste', 'shampoo'];
  let word = 0;
  let chars = 0;
  let deleting = false;

  const tick = () => {
    const idle =
      document.activeElement === input || input.value || document.body.dataset.view !== 'home' || document.hidden;
    if (idle) {
      input.placeholder = 'Try “deodorant”';
      return setTimeout(tick, 1500);
    }
    const target = words[word];
    chars += deleting ? -1 : 1;
    input.placeholder = `Try “${target.slice(0, chars)}”`;
    let delay = deleting ? 35 : 85;
    if (!deleting && chars === target.length) {
      deleting = true;
      delay = 1600; // hold the finished word
    } else if (deleting && chars === 0) {
      deleting = false;
      word = (word + 1) % words.length;
      delay = 380;
    }
    setTimeout(tick, delay);
  };
  tick();
}
