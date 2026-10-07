/* Kimi · A product of MoTaljaard
   Vanilla ES module. One state object; DOM is updated incrementally (rows/cards are
   created once, then moved/updated) so nothing flickers or loses scroll position. */

const $ = (s, r = document) => r.querySelector(s);
const NAMES = { clicks: 'Clicks', dischem: 'Dis-Chem' };
const COLORS = { clicks: 'var(--clicks)', dischem: 'var(--dischem)' };
const ALL_STORES = ['dischem', 'clicks'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => 'R' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => n.toLocaleString('en-US');
const NF = '<span class="nf">Not found</span>';
const svg = (d, extra = '') => `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  chevron: svg('<path d="m6 9 6 6 6-6"/>', 'class="chev"'),
  ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  warn: svg('<path d="M12 3 2 21h20L12 3zM12 10v5M12 18h.01"/>'),
  expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  down: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
  searchOff: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>').replace('width="18" height="18"', 'width="44" height="44"'),
};

/* ------------------------------ prefs (app must work without storage) ------------------------------ */
const prefs = {
  read() { try { return JSON.parse(localStorage.getItem('kimi.prefs') || '{}'); } catch { return {}; } },
  write(p) { try { localStorage.setItem('kimi.prefs', JSON.stringify({ ...this.read(), ...p })); } catch { /* storage unavailable */ } },
};

/* ------------------------------ state ------------------------------ */
const state = {
  q: '', stores: [...ALL_STORES], batch: 12, active: [], src: {},
  items: [], order: 0, selected: new Set(), expanded: new Set(),
  busy: false, es: null, tab: 'all', fStock: false, fPromise: false, sort: 'rel', view: 'list',
  lastPicked: null, drawerId: null, exporting: false, finishedAt: null,
};
let lowId = null, created = 0;

/* ------------------------------ helpers ------------------------------ */
const lastHtml = new WeakMap();
function setHTML(el, html) { if (lastHtml.get(el) !== html) { el.innerHTML = html; lastHtml.set(el, html); } }
let pending = 0;
const schedule = () => { if (!pending) pending = setTimeout(() => { pending = 0; renderAll(); }, 30); };   // batches bursts
const clock = () => new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
const setBusy = (b) => { state.busy = b; document.body.dataset.busy = b ? '1' : '0'; };
const offPct = (p) => (p.was && p.price ? Math.round((1 - p.price / p.was) * 100) : 0);

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), type === 'error' ? 7000 : 3800);
  setTimeout(() => t.remove(), 7600);
}
function tween(el, to, fmt) {                          // count-up for the insight numbers
  const from = el._v ?? 0; el._v = to; clearInterval(el._t);
  if (reduced || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  el._t = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / 480), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e); if (k >= 1) clearInterval(el._t);
  }, 30);
}

/* ------------------------------ views + URL ------------------------------ */
const form = $('#form'), input = $('#q'), optsEl = $('#opts');
function setView(v) {
  document.body.dataset.view = v;
  $('#home').hidden = v !== 'home'; $('#results').hidden = v !== 'results';
  if (v === 'results') $('#searchSlot').appendChild(form); else optsEl.parentNode.insertBefore(form, optsEl);
  if (v === 'home') document.title = 'Kimi · A product of MoTaljaard';
}
const urlFor = () => '?' + new URLSearchParams({ q: state.q, s: state.active.join(','), n: state.batch });

function goHome(push = true) {
  stop(true); closeDrawer();
  Object.assign(state, { items: [], selected: new Set(), expanded: new Set(), active: [], src: {}, q: '' });
  rowEls.clear(); cardEls.clear();
  setView('home'); renderRecent();
  if (push) history.pushState({}, '', location.pathname);
  $('#export').hidden = true; input.value = ''; input.focus();
}

/* ------------------------------ searching ------------------------------ */
function search(raw, { push = true } = {}) {
  const q = String(raw || '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) { toast('Type at least 2 characters to search.', 'error'); return input.focus(); }
  if (!state.stores.length) return toast('Pick at least one store.', 'error');
  if (!navigator.onLine) return toast('You’re offline. Connect to the internet and try again.', 'error');
  stop(true); closeDrawer();
  Object.assign(state, { q, active: [...state.stores], items: [], order: 0, selected: new Set(), expanded: new Set(), src: {}, tab: 'all', lastPicked: null, finishedAt: null });
  rowEls.clear(); cardEls.clear();
  state.active.forEach((k) => { state.src[k] = { state: 'searching', total: null, next: 0, hasMore: false }; });
  input.value = q;
  $('#title').innerHTML = `“<em>${esc(q)}</em>”`;
  document.title = `${q} · Kimi`;
  setView('results');
  if (push) history.pushState({}, '', urlFor());
  saveRecent(q);
  window.scrollTo({ top: 0 });
  run(state.active);
}

function run(keys) {
  if (state.busy) return;
  const offsets = {};
  keys.forEach((k) => { offsets[k] = state.src[k].next || 0; Object.assign(state.src[k], { state: 'searching', message: null }); });
  setBusy(true);
  let finished = false;
  const url = `/api/search?q=${encodeURIComponent(state.q)}&limit=${state.batch}&sources=${keys.join(',')}&offsets=${encodeURIComponent(JSON.stringify(offsets))}`;
  const es = state.es = new EventSource(url);
  const end = () => { finished = true; es.close(); setBusy(false); state.es = null; };

  es.addEventListener('fatal', (e) => { toast(JSON.parse(e.data).message, 'error'); keys.forEach((k) => (state.src[k].state = 'idle')); end(); schedule(); });
  es.addEventListener('status', (e) => {
    const s = JSON.parse(e.data), st = state.src[s.source]; if (!st) return;
    Object.assign(st, { state: s.state, total: s.total ?? st.total, message: s.message || null, note: s.note || null, warning: s.warning || null });
    if (s.state === 'done') { st.next = s.next; st.hasMore = s.hasMore; }
    if (s.state === 'error') st.hasMore = false;
    schedule();
  });
  es.addEventListener('product', (e) => {
    const p = JSON.parse(e.data);
    if (state.items.some((x) => x.id === p.id)) return;       // live results can shift between pages
    p._o = state.order++; p._v = 0; state.items.push(p); schedule();
  });
  es.addEventListener('done', () => { end(); state.finishedAt = clock(); schedule(); });
  es.onerror = () => {
    if (finished) return;
    end();
    keys.forEach((k) => { const st = state.src[k]; if (['searching', 'found'].includes(st.state)) Object.assign(st, { state: 'error', message: 'The connection dropped before this store finished. What loaded is kept. Try again to continue.' }); });
    toast('Connection lost while searching. What loaded is kept.', 'error');
    state.finishedAt = clock(); schedule();
  };
  schedule();
}

function stop(silent = false) {
  if (!state.es) return;
  state.es.close(); state.es = null; setBusy(false);
  Object.values(state.src).forEach((s) => { if (['searching', 'found'].includes(s.state)) { s.state = 'idle'; s.hasMore = s.next > 0 && s.total != null ? s.next < s.total : false; } });
  if (!silent) { state.finishedAt = clock(); toast('Stopped. What’s loaded so far is kept.'); schedule(); }
}

/* ------------------------------ derived data ------------------------------ */
const loadedFor = (k) => state.items.filter((p) => p.source === k).length;
function visible() {
  const a = state.items.filter((p) => (state.tab === 'all' || p.source === state.tab) && (!state.fStock || p.inStock === 'Yes') && (!state.fPromise || p.promise));
  const by = {
    asc: (x, y) => (x.price ?? 1e9) - (y.price ?? 1e9), desc: (x, y) => (y.price ?? -1) - (x.price ?? -1),
    name: (x, y) => x.name.localeCompare(y.name), rel: (x, y) => x._o - y._o,
  }[state.sort];
  return a.sort(by);
}
const exportScope = (vis) => (state.selected.size ? state.items.filter((p) => state.selected.has(p.id)) : vis);

/* ------------------------------ rendering ------------------------------ */
function renderAll() {
  const vis = visible();
  const priced = vis.filter((p) => p.price != null);
  lowId = priced.length > 1 ? priced.reduce((m, p) => (p.price < m.price ? p : m)).id : null;
  renderMeta(vis); renderTabs(); renderNotices(); renderInsights(vis, priced);
  state.view === 'list' ? syncRows(vis) : syncGallery(vis);
  renderEmpty(vis); renderLoadMore(); renderExport(vis); renderDrawer();
}

function renderMeta(vis) {
  const n = state.items.length;
  const filtered = vis.length !== (state.tab === 'all' ? n : loadedFor(state.tab));
  const txt = state.busy
    ? `Fetching live from ${state.active.map((k) => NAMES[k]).join(' and ')}… ${n} loaded`
    : `${n} product${n === 1 ? '' : 's'} loaded${filtered ? ` · ${vis.length} match your filters` : ''}${state.finishedAt ? ` · live as of ${state.finishedAt}` : ''}`;
  setHTML($('#meta'), `<span class="dot ${state.busy ? 'busy' : ''}"></span><span>${esc(txt)}</span>`);
  $('#stop').hidden = !state.busy;
}

function renderTabs() {
  const tabs = [{ k: 'all', label: 'All stores', n: String(state.items.length) }].concat(state.active.map((k) => {
    const s = state.src[k], loaded = loadedFor(k);
    return { k, label: NAMES[k], n: s.total != null ? `${loaded} of ${num(s.total)}` : String(loaded), state: s.state, dot: COLORS[k] };
  }));
  setHTML($('#tabs'), tabs.map((t) => {
    const lead = t.k === 'all' ? '' : t.state === 'searching' || t.state === 'found' ? '<span class="spin" aria-hidden="true"></span>' : t.state === 'error' ? `<span class="warn" title="Problem loading this store">${ICON.warn}</span>` : `<i style="background:${t.dot}"></i>`;
    return `<button class="tab" role="tab" data-tab="${t.k}" aria-selected="${state.tab === t.k}">${lead}${esc(t.label)} <span class="n">${esc(t.n)}</span></button>`;
  }).join(''));
}

function renderNotices() {
  const out = [];
  for (const k of state.active) {
    const s = state.src[k];
    if (s.state === 'error') out.push(`<div class="notice err" role="alert"><p><b>${NAMES[k]}:</b> ${esc(s.message)}</p><button class="btn sm" data-act="again" data-k="${k}">Try again</button></div>`);
    else for (const t of [s.note, s.warning].filter(Boolean)) out.push(`<div class="notice info"><p><b>${NAMES[k]}:</b> ${esc(t)}</p></div>`);
  }
  setHTML($('#notices'), out.join(''));
}

/* ---- insights: lowest / average / highest / specials + price spread ---- */
function renderInsights(vis, priced) {
  const box = $('#insights');
  box.hidden = !priced.length;
  if (!priced.length) return;
  const prices = priced.map((p) => p.price), min = Math.min(...prices), max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const lo = priced.find((p) => p.price === min), hi = priced.find((p) => p.price === max);
  const specials = vis.filter((p) => offPct(p) > 0), best = specials.reduce((m, p) => Math.max(m, offPct(p)), 0);
  tween($('#inLow'), min, money); tween($('#inAvg'), avg, money); tween($('#inHigh'), max, money); tween($('#inSpec'), specials.length, (v) => String(Math.round(v)));
  $('#inLowS').textContent = `${lo.name} · ${lo.retailer}`;
  $('#inHighS').textContent = `${hi.name} · ${hi.retailer}`;
  $('#inAvgS').textContent = `across ${priced.length} product${priced.length === 1 ? '' : 's'}`;
  $('#inSpecS').textContent = specials.length ? `up to ${best}% off` : 'no discounts found';
  const spread = $('#spread'); spread.hidden = priced.length < 2;
  if (priced.length < 2) return;
  const pos = (v) => (max === min ? 50 : 1.5 + ((v - min) / (max - min)) * 97);
  setHTML($('#track'),
    `<span class="avg" style="left:${pos(avg)}%"><b>avg ${money(avg)}</b></span>` +
    priced.map((p) => `<span class="pt" style="left:${pos(p.price)}%;background:${COLORS[p.source]}" title="${esc(p.name)} · ${money(p.price)}"></span>`).join(''));
  $('#scMin').textContent = money(min); $('#scMax').textContent = money(max);
  setHTML($('#legend'), state.active.map((k) => `<span><i style="background:${COLORS[k]}"></i>${NAMES[k]}</span>`).join(''));
}

/* ---- shared fragments ---- */
function chipsHtml(p, max = 3) {
  if (!p.promise) return '<span class="nf">No promise found</span>';
  const all = p.promise.split(' · ');
  return `<div class="chips">${all.slice(0, max).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}${all.length > max ? `<span class="chip more">+${all.length - max}</span>` : ''}</div>`;
}
const stockHtml = (p) => (p.inStock === 'Yes' ? '<span class="stock yes">In stock</span>' : p.inStock === 'No' ? '<span class="stock no">Out of stock</span>' : '<span class="stock unk">Not stated</span>');
const imgHtml = (p, size) => (p.image
  ? `<img src="${esc(p.image)}" alt="" ${size ? `width="${size}" height="${size}"` : ''} loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'No image'}))">`
  : '<span>No image</span>');
const factsHtml = (p) => {
  const f = (v) => (v ? esc(v) : NF);
  return `<dl class="facts">
    <dt>Type</dt><dd>${f(p.type)}</dd><dt>Gender</dt><dd>${f(p.gender)}</dd><dt>Ingredient concept</dt><dd>${f(p.ingredientConcept)}</dd>
    <dt>Claim</dt><dd>${f(p.promise ? p.promise.split(' · ').join(', ') : '')}</dd><dt>In stock?</dt><dd>${f(p.inStock)}</dd>
    <dt>Price</dt><dd>${p.price != null ? money(p.price) : NF}</dd><dt>Retrieved</dt><dd>${esc(new Date(p.fetchedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }))}</dd></dl>`;
};
const warnHtml = (p) => (p.detailError ? `<div class="dwarn"><span>${ICON.warn}<span>Full details couldn’t be loaded. ${esc(p.detailError)}</span></span><button class="btn sm" type="button" data-act="retry">Retry</button></div>` : '');
const descHtml = (p) => `<p>${p.fullDescription ? esc(p.fullDescription) : '<span class="nf">No description published by the retailer.</span>'}</p>`;

/* ---- list rows ---- */
const rowEls = new Map();
function rowHtml(p) {
  const off = offPct(p);
  return `
    <td class="c-sel"><label class="hit"><input class="tick" type="checkbox" data-act="sel" aria-label="Select ${esc(p.name)}"></label></td>
    <td class="c-prod"><div class="prod">
      <div class="thumb">${imgHtml(p, 72)}</div>
      <div class="ptxt">
        ${p.brand ? `<div class="brand-l">${esc(p.brand)}</div>` : ''}
        <button class="pname" type="button" data-act="toggle" aria-expanded="false">${esc(p.name)}</button>
        <div class="pmeta"><span class="rtag"><i style="background:${COLORS[p.source]}"></i>${esc(p.retailer)}</span>${p.size ? `<span>${esc(p.size)}</span>` : ''}</div>
        ${p.description ? `<div class="psnip">${esc(p.description)}</div>` : ''}
      </div></div></td>
    <td class="c-price">${p.price != null ? `<span class="price">${money(p.price)}</span>${off ? `<span class="off">−${off}%</span>` : ''}${p.was ? `<span class="was">${money(p.was)}</span>` : ''}` : '<span class="price nf">Price not found</span>'}<span class="tag-low" hidden>Lowest price</span></td>
    <td class="c-promise">${chipsHtml(p)}</td>
    <td class="c-stock">${stockHtml(p)}</td>
    <td class="c-act"><div class="acts">
      ${p.detailError ? `<button class="iconbtn warnico" type="button" data-act="toggle" aria-label="Details missing. Open to retry" title="Some details couldn’t be loaded">${ICON.warn}</button>` : ''}
      <button class="iconbtn" type="button" data-act="open" aria-label="Open full details" title="Full details">${ICON.expand}</button>
      <button class="iconbtn" type="button" data-act="toggle" aria-label="Show details" aria-expanded="false">${ICON.chevron}</button>
      <a class="iconbtn" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open on ${esc(p.retailer)} (new tab)" title="Open on ${esc(p.retailer)}">${ICON.ext}</a>
    </div></td>`;
}
const detailHtml = (p) => `<td colspan="6"><div class="dgrid">${warnHtml(p)}<div><h3>Description</h3>${descHtml(p)}</div><div><h3>What goes into your Excel sheet</h3>${factsHtml(p)}</div></div></td>`;

function ensureRow(p) {
  let r = rowEls.get(p.id);
  if (!r) {
    r = { tr: document.createElement('tr'), d: document.createElement('tr'), v: -1 };
    r.tr.className = 'row new'; r.tr.dataset.id = p.id; r.tr.style.setProperty('--i', created++ % 10);
    r.d.className = 'detail'; r.d.dataset.id = p.id; rowEls.set(p.id, r);
  }
  if (r.v !== p._v) { r.tr.innerHTML = rowHtml(p); r.d.innerHTML = detailHtml(p); r.v = p._v; }
  const sel = state.selected.has(p.id), open = state.expanded.has(p.id);
  r.tr.classList.toggle('sel', sel);
  const cb = r.tr.querySelector('input.tick'); if (cb.checked !== sel) cb.checked = sel;
  r.tr.querySelectorAll('[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', open));
  r.tr.querySelector('.tag-low').hidden = p.id !== lowId;
  r.d.hidden = !open;
  return r;
}
const skeletonRows = (n) => Array.from({ length: n }, () => `<tr class="skeleton"><td colspan="6"><div class="sk" style="width:${50 + Math.random() * 40}%"></div></td></tr>`).join('');

function syncRows(vis) {
  $('#grid').hidden = false; $('#gallery').hidden = true;
  const live = new Set(state.items.map((p) => p.id));
  for (const id of [...rowEls.keys()]) if (!live.has(id)) rowEls.delete(id);
  const frag = document.createDocumentFragment();
  for (const p of vis) { const r = ensureRow(p); frag.append(r.tr, r.d); }
  const tb = $('#tbody');
  tb.replaceChildren(frag);
  if (state.busy) tb.insertAdjacentHTML('beforeend', skeletonRows(vis.length ? 2 : 4));
  setTimeout(() => tb.querySelectorAll('tr.new').forEach((tr) => tr.classList.remove('new')), 900);
  const all = $('#selAll'), n = vis.filter((p) => state.selected.has(p.id)).length;
  all.checked = vis.length > 0 && n === vis.length; all.indeterminate = n > 0 && n < vis.length; all.disabled = !vis.length;
}

/* ---- gallery cards ---- */
const cardEls = new Map();
function cardHtml(p) {
  const off = offPct(p);
  return `
    <label class="gsel"><input class="tick" type="checkbox" data-act="sel" aria-label="Select ${esc(p.name)}"></label>
    <div class="gimg" data-act="open">${imgHtml(p)}</div>
    <div class="gbadge">${off ? `<span class="off">−${off}%</span>` : ''}<span class="tag-low" hidden>Lowest price</span></div>
    <div class="gbody">
      ${p.brand ? `<div class="brand-l">${esc(p.brand)}</div>` : ''}
      <button class="pname" type="button" data-act="open">${esc(p.name)}</button>
      <div class="gprice">${p.price != null ? `<span class="price">${money(p.price)}</span>${p.was ? `<span class="was">${money(p.was)}</span>` : ''}` : '<span class="price nf">Price not found</span>'}</div>
      ${chipsHtml(p, 2)}
      <div class="gfoot"><span class="rtag"><i style="background:${COLORS[p.source]}"></i>${esc(p.retailer)}</span>${stockHtml(p)}</div>
    </div>`;
}
function ensureCard(p) {
  let c = cardEls.get(p.id);
  if (!c) { c = { el: document.createElement('article'), v: -1 }; c.el.className = 'gcard'; c.el.dataset.id = p.id; c.el.style.setProperty('--i', created++ % 10); cardEls.set(p.id, c); }
  if (c.v !== p._v) { c.el.innerHTML = cardHtml(p); c.v = p._v; }
  const sel = state.selected.has(p.id);
  c.el.classList.toggle('sel', sel);
  const cb = c.el.querySelector('input.tick'); if (cb.checked !== sel) cb.checked = sel;
  c.el.querySelector('.tag-low').hidden = p.id !== lowId;
  return c.el;
}
function syncGallery(vis) {
  $('#grid').hidden = true; $('#gallery').hidden = false;
  const live = new Set(state.items.map((p) => p.id));
  for (const id of [...cardEls.keys()]) if (!live.has(id)) cardEls.delete(id);
  const g = $('#gallery');
  g.replaceChildren(...vis.map(ensureCard));
  if (state.busy) g.insertAdjacentHTML('beforeend', Array.from({ length: vis.length ? 2 : 6 }, () => '<div class="gcard"><div class="sk skel-img" style="border-radius:0"></div><div class="gbody"><div class="sk" style="width:55%"></div><div class="sk"></div><div class="sk" style="width:40%"></div></div></div>').join(''));
}

function renderEmpty(vis) {
  const el = $('#empty');
  if (vis.length || state.busy) { el.hidden = true; return; }
  el.hidden = false;
  if (state.items.length) {
    el.innerHTML = `${ICON.searchOff}<h3>Nothing matches these filters</h3><p>Try removing a filter to see the rest of what was loaded.</p><button class="btn" data-act="clear-filters">Clear filters</button>`;
  } else if (state.active.length && state.active.every((k) => state.src[k].state === 'error')) {
    el.innerHTML = `${ICON.warn.replace('width="18" height="18"', 'width="44" height="44"')}<h3>Couldn’t get any results</h3><p>The messages above explain what went wrong with each store.</p>`;
  } else {
    el.innerHTML = `${ICON.searchOff}<h3>No products found for “${esc(state.q)}”</h3><p>Try a simpler or more general word, for example “soap” instead of “antibacterial hand soap”.</p>`;
  }
}

function renderLoadMore() {
  const more = state.active.filter((k) => state.src[k].state === 'done' && state.src[k].hasMore);
  const parts = more.map((k) => {
    const s = state.src[k], loaded = loadedFor(k), left = s.total != null ? s.total - s.next : null, nextN = Math.min(state.batch, left ?? state.batch);
    const pct = s.total ? Math.min(100, Math.round((loaded / s.total) * 100)) : 0;
    return `<div class="lm"><div class="lm-top"><b><i style="background:${COLORS[k]}"></i>${NAMES[k]}</b><span>${s.total != null ? `${num(loaded)} of ${num(s.total)} loaded` : `${num(loaded)} loaded`}</span></div>
      ${s.total != null ? `<div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>` : ''}
      <button class="btn" data-act="more" data-k="${k}" ${state.busy ? 'disabled' : ''}>Load ${num(nextN)} more${left != null ? ` · ${num(left)} left` : ''}</button></div>`;
  });
  if (more.length > 1) parts.push(`<button class="btn primary" data-act="more-all" ${state.busy ? 'disabled' : ''}>Load more from all stores</button>`);
  if (!parts.length && state.items.length && !state.busy) parts.push('<div class="lm-end">That’s everything these stores will show for this search.</div>');
  setHTML($('#loadmore'), parts.join(''));
}

function renderExport(vis) {
  const btn = $('#export');
  btn.hidden = !state.items.length;
  if (state.exporting) return;
  const n = exportScope(vis).length;
  $('#exportLabel').textContent = state.selected.size ? `Export ${n} selected` : `Export ${n} shown`;
  btn.disabled = !n;
}

/* ---- details drawer ---- */
let lastFocus = null;
function openDrawer(id) {
  state.drawerId = id; lastFocus = document.activeElement;
  renderDrawer(true);
  $('#drawer').classList.add('open'); $('#scrim').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#drClose').focus(), 60);
}
function closeDrawer() {
  if (!state.drawerId) return;
  state.drawerId = null;
  $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
  lastFocus?.focus?.();
}
function renderDrawer() {
  const p = state.items.find((x) => x.id === state.drawerId);
  if (!state.drawerId) return;
  if (!p) return closeDrawer();
  const off = offPct(p), sel = state.selected.has(p.id);
  setHTML($('#drBody'), `<div class="dr">
    <div class="dr-img">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" referrerpolicy="no-referrer">` : '<span class="nf">No image</span>'}</div>
    <div style="margin-top:20px"><span class="rtag"><i style="background:${COLORS[p.source]}"></i>${esc(p.retailer)}</span>
      ${p.brand ? `<div class="brand-l" style="margin-top:8px">${esc(p.brand)}</div>` : ''}
      <h2 id="drTitle">${esc(p.name)}</h2>
      <div class="dr-price">${p.price != null ? `<span class="price">${money(p.price)}</span>${p.was ? `<span class="was">${money(p.was)}</span>` : ''}${off ? `<span class="off">−${off}%</span>` : ''}` : '<span class="price nf">Price not found</span>'}${p.id === lowId ? '<span class="tag-low">Lowest price</span>' : ''}</div>
    </div>
    ${warnHtml(p)}
    <div style="margin-top:22px"><h3>Promise</h3>${p.promise ? `<div class="chips">${p.promise.split(' · ').map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : '<span class="nf">No promise found</span>'}</div>
    <div style="margin-top:22px"><h3>Description</h3>${descHtml(p)}</div>
    <div style="margin-top:22px"><h3>What goes into your Excel sheet</h3>${factsHtml(p)}</div></div>`);
  setHTML($('#drFoot'), `<button class="btn ${sel ? '' : 'primary'}" type="button" data-act="dr-sel">${sel ? 'Remove from export' : 'Add to export'}</button>
    <a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open on ${esc(p.retailer)} ↗</a>`);
}

/* ------------------------------ events ------------------------------ */
form.addEventListener('submit', (e) => { e.preventDefault(); search(input.value); });
$('#brand').addEventListener('click', (e) => { e.preventDefault(); goHome(); });
$('#stop').addEventListener('click', () => stop());
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; schedule(); });
$('#fStock').addEventListener('change', (e) => { state.fStock = e.target.checked; schedule(); });
$('#fPromise').addEventListener('change', (e) => { state.fPromise = e.target.checked; schedule(); });
$('#tabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { state.tab = t.dataset.tab; schedule(); } });
$('#selAll').addEventListener('change', (e) => { visible().forEach((p) => (e.target.checked ? state.selected.add(p.id) : state.selected.delete(p.id))); schedule(); });
$('#scrim').addEventListener('click', closeDrawer);
$('#drClose').addEventListener('click', closeDrawer);

function setLayout(v) {
  state.view = v; prefs.write({ view: v });
  $('#vList').setAttribute('aria-pressed', String(v === 'list')); $('#vGrid').setAttribute('aria-pressed', String(v === 'gallery'));
  schedule();
}
$('#vList').addEventListener('click', () => setLayout('list'));
$('#vGrid').addEventListener('click', () => setLayout('gallery'));

$('#theme').addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; prefs.write({ theme: t });
  $('meta[name=theme-color]').content = t === 'dark' ? '#09090a' : '#ffffff';
});

$('#home').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip-btn');
  if (chip) return search(chip.textContent);
  const tog = e.target.closest('.store-toggle');
  if (tog) {
    const k = tog.dataset.store, on = tog.getAttribute('aria-pressed') === 'true';
    if (on && state.stores.length === 1) return toast('Keep at least one store selected.');
    tog.setAttribute('aria-pressed', String(!on));
    state.stores = ALL_STORES.filter((s) => (s === k ? !on : state.stores.includes(s)));
    prefs.write({ stores: state.stores });
  }
});
$('#limit').addEventListener('change', (e) => { state.batch = parseInt(e.target.value, 10); prefs.write({ batch: state.batch }); });

async function retryProduct(p, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Retrying…'; }
  try {
    const qs = new URLSearchParams({ source: p.source, url: p.url, name: p.name, price: p.price ?? '', image: p.image || '' });
    const r = await fetch('/api/product?' + qs); const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Retry failed');
    Object.assign(p, j, { _o: p._o, _v: p._v + 1 });
    j.detailError ? toast('Still couldn’t load the details. Try again in a moment.', 'error') : toast('Details loaded.', 'ok');
  } catch (err) { toast(err.message === 'Failed to fetch' ? 'Couldn’t reach the app. Is it still running?' : err.message, 'error'); p._v++; }
  schedule();
}
function pick(p, e) {                                  // checkbox click; shift-click selects a range
  const vis = visible(), on = e.target.checked;
  if (e.shiftKey && state.lastPicked) {
    const a = vis.findIndex((x) => x.id === state.lastPicked), b = vis.findIndex((x) => x.id === p.id);
    if (a > -1 && b > -1) vis.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => (on ? state.selected.add(x.id) : state.selected.delete(x.id)));
  } else on ? state.selected.add(p.id) : state.selected.delete(p.id);
  state.lastPicked = p.id; schedule();
}
function onItemClick(e) {
  const holder = e.target.closest('[data-id]'); if (!holder) return;
  const p = state.items.find((x) => x.id === holder.dataset.id); if (!p) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'toggle') { state.expanded.has(p.id) ? state.expanded.delete(p.id) : state.expanded.add(p.id); schedule(); }
  else if (act === 'open') openDrawer(p.id);
  else if (act === 'sel') pick(p, e);
  else if (act === 'retry') retryProduct(p, e.target.closest('button'));
}
$('#tbody').addEventListener('click', onItemClick);
$('#gallery').addEventListener('click', onItemClick);
$('#drawer').addEventListener('click', (e) => {
  const p = state.items.find((x) => x.id === state.drawerId); if (!p) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'retry') retryProduct(p, e.target.closest('button'));
  if (act === 'dr-sel') { state.selected.has(p.id) ? state.selected.delete(p.id) : state.selected.add(p.id); schedule(); }
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a || a.closest('#tbody, #gallery, #drawer')) return;
  const act = a.dataset.act;
  if (act === 'again' || act === 'more') run([a.dataset.k]);
  else if (act === 'more-all') run(state.active.filter((k) => state.src[k].state === 'done' && state.src[k].hasMore));
  else if (act === 'clear-filters') { state.fStock = state.fPromise = false; state.tab = 'all'; $('#fStock').checked = $('#fPromise').checked = false; schedule(); }
});

/* keyboard: "/" focuses search; Esc closes the drawer, then clears selection, then leaves the field */
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); input.focus(); input.select(); }
  else if (e.key === 'Escape') {
    if (state.drawerId) closeDrawer();
    else if (document.activeElement === input) input.blur();
    else if (state.selected.size) { state.selected.clear(); schedule(); }
  }
});
window.addEventListener('scroll', () => $('#appbar').classList.toggle('scrolled', scrollY > 4), { passive: true });
window.addEventListener('offline', () => toast('You’re offline. Searching and exporting need internet.', 'error'));
window.addEventListener('online', () => toast('Back online.', 'ok'));
window.addEventListener('popstate', () => { const p = new URLSearchParams(location.search); p.get('q') ? search(p.get('q'), { push: false }) : goHome(false); });

/* ------------------------------ export ------------------------------ */
$('#export').addEventListener('click', async () => {
  const btn = $('#export'), rows = exportScope(visible());
  if (!rows.length) return toast('Nothing to export yet.', 'error');
  if (!navigator.onLine) return toast('You’re offline.', 'error');
  const label = $('#exportLabel'), ico = $('#exportIco'), oldLabel = label.textContent, oldIco = ico.innerHTML;
  state.exporting = true; btn.disabled = true; ico.innerHTML = '<span class="spinner"></span>'; label.textContent = 'Building…';
  let ok = false;
  try {
    const r = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ products: rows }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Export failed (HTTP ${r.status}).`); }
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `kimi-${state.q.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'products'}.xlsx` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    const missing = rows.filter((p) => p.price == null || p.detailError).length;
    toast(`Exported ${rows.length} product${rows.length > 1 ? 's' : ''}.${missing ? ` ${missing} had missing data, marked “Not found”.` : ''}`, 'ok');
    ok = true;
  } catch (err) { toast(err.message === 'Failed to fetch' ? 'Couldn’t reach the app. Is it still running?' : err.message, 'error'); }
  if (ok) { ico.innerHTML = ICON.check; label.textContent = 'Exported'; await new Promise((r) => setTimeout(r, 1600)); }
  ico.innerHTML = oldIco; label.textContent = oldLabel; state.exporting = false; btn.disabled = false; schedule();
});

/* ------------------------------ recent searches + typing placeholder ------------------------------ */
function saveRecent(q) { prefs.write({ recent: [q, ...(prefs.read().recent || []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6) }); }
function renderRecent() {
  const r = prefs.read().recent || [];
  $('#recentWrap').hidden = !r.length;
  $('#recent').innerHTML = r.map((q) => `<button class="chip-btn" type="button">${esc(q)}</button>`).join('');
}
function typer() {
  if (reduced) return;
  const words = ['deodorant', 'face wash', 'sunscreen SPF 50', 'moisturiser', 'toothpaste', 'shampoo'];
  let w = 0, i = 0, del = false;
  const tick = () => {
    if (document.activeElement === input || input.value || document.body.dataset.view !== 'home' || document.hidden) { input.placeholder = 'Try “deodorant”'; return setTimeout(tick, 1500); }
    const word = words[w]; i += del ? -1 : 1;
    input.placeholder = `Try “${word.slice(0, i)}”`;
    let d = del ? 35 : 85;
    if (!del && i === word.length) { del = true; d = 1600; } else if (del && i === 0) { del = false; w = (w + 1) % words.length; d = 380; }
    setTimeout(tick, d);
  };
  tick();
}

/* ------------------------------ boot ------------------------------ */
(function boot() {
  const pf = prefs.read(), url = new URLSearchParams(location.search);
  const stores = (url.get('s') || (pf.stores || []).join(',')).split(',').filter((s) => ALL_STORES.includes(s));
  if (stores.length) state.stores = ALL_STORES.filter((s) => stores.includes(s));
  state.batch = [8, 12, 24, 40].includes(+url.get('n')) ? +url.get('n') : [8, 12, 24, 40].includes(pf.batch) ? pf.batch : 12;
  $('#limit').value = state.batch;
  document.querySelectorAll('.store-toggle').forEach((b) => b.setAttribute('aria-pressed', String(state.stores.includes(b.dataset.store))));
  if (pf.view === 'gallery') { state.view = 'gallery'; $('#vList').setAttribute('aria-pressed', 'false'); $('#vGrid').setAttribute('aria-pressed', 'true'); }
  $('meta[name=theme-color]').content = document.documentElement.dataset.theme === 'dark' ? '#09090a' : '#ffffff';
  renderRecent(); typer();
  if (url.get('q')) search(url.get('q'), { push: false }); else input.focus({ preventScroll: true });
})();
