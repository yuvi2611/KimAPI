/** Slide-over product details. Opened from the gallery cards and the list's "full details" button. */
import { COLORS } from '../constants.js';
import { $, setHTML } from '../lib/dom.js';
import { esc, money, offPct } from '../lib/format.js';
import { state } from '../state.js';
import { descHtml, factsHtml, warnHtml } from './fragments.js';

let returnFocusTo = null;

export function openDrawer(id) {
  state.drawerId = id;
  returnFocusTo = document.activeElement;
  renderDrawer();
  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#drClose').focus(), 60); // move focus into the dialog
}

export function closeDrawer() {
  if (!state.drawerId) return;
  state.drawerId = null;
  $('#drawer').classList.remove('open');
  $('#scrim').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  returnFocusTo?.focus?.(); // give focus back to where the user was
}

/** Re-draw the open drawer (selection, retry results). Safe to call when closed. */
export function renderDrawer() {
  if (!state.drawerId) return;
  const p = state.items.find((x) => x.id === state.drawerId);
  if (!p) return closeDrawer();

  const off = offPct(p);
  const selected = state.selected.has(p.id);
  const price =
    p.price != null
      ? `<span class="price">${money(p.price)}</span>${p.was ? `<span class="was">${money(p.was)}</span>` : ''}${off ? `<span class="off">−${off}%</span>` : ''}`
      : '<span class="price nf">Price not found</span>';
  const chips = p.promise
    ? `<div class="chips">${p.promise
        .split(' · ')
        .map((c) => `<span class="chip">${esc(c)}</span>`)
        .join('')}</div>`
    : '<span class="nf">No promise found</span>';

  setHTML(
    $('#drBody'),
    `<div class="dr">
      <div class="dr-img">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" referrerpolicy="no-referrer">` : '<span class="nf">No image</span>'}</div>
      <div style="margin-top:20px"><span class="rtag"><i style="background:${COLORS[p.source]}"></i>${esc(p.retailer)}</span>
        ${p.brand ? `<div class="brand-l" style="margin-top:8px">${esc(p.brand)}</div>` : ''}
        <h2 id="drTitle">${esc(p.name)}</h2>
        <div class="dr-price">${price}${p.id === state.lowId ? '<span class="tag-low">Lowest price</span>' : ''}</div>
      </div>
      ${warnHtml(p)}
      <div style="margin-top:22px"><h3>Promise</h3>${chips}</div>
      <div style="margin-top:22px"><h3>Description</h3>${descHtml(p)}</div>
      <div style="margin-top:22px"><h3>What goes into your Excel sheet</h3>${factsHtml(p)}</div>
    </div>`,
  );
  setHTML(
    $('#drFoot'),
    `<button class="btn ${selected ? '' : 'primary'}" type="button" data-act="dr-sel">${selected ? 'Remove from export' : 'Add to export'}</button>
     <a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open on ${esc(p.retailer)} ↗</a>`,
  );
}
