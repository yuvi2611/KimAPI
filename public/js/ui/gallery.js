/** Gallery view (large photo cards). Same create-once-then-patch approach as list.js. */
import { COLORS } from '../constants.js';
import { $ } from '../lib/dom.js';
import { esc, money, offPct } from '../lib/format.js';
import { state } from '../state.js';
import { chipsHtml, imgHtml, stockHtml } from './fragments.js';

/** id -> { el, v } */
const cards = new Map();
let created = 0;

export const resetCards = () => cards.clear();

function cardHtml(p) {
  const off = offPct(p);
  const price =
    p.price != null
      ? `<span class="price">${money(p.price)}</span>${p.was ? `<span class="was">${money(p.was)}</span>` : ''}`
      : '<span class="price nf">Price not found</span>';
  return `
    <label class="gsel"><input class="tick" type="checkbox" data-act="sel" aria-label="Select ${esc(p.name)}"></label>
    <div class="gimg" data-act="open">${imgHtml(p)}</div>
    <div class="gbadge">${off ? `<span class="off">−${off}%</span>` : ''}<span class="tag-low" hidden>Lowest price</span></div>
    <div class="gbody">
      ${p.brand ? `<div class="brand-l">${esc(p.brand)}</div>` : ''}
      <button class="pname" type="button" data-act="open">${esc(p.name)}</button>
      <div class="gprice">${price}</div>
      ${chipsHtml(p, 2)}
      <div class="gfoot"><span class="rtag"><i style="background:${COLORS[p.source]}"></i>${esc(p.retailer)}</span>${stockHtml(p)}</div>
    </div>`;
}

function ensureCard(p) {
  let c = cards.get(p.id);
  if (!c) {
    c = { el: document.createElement('article'), v: -1 };
    c.el.className = 'gcard';
    c.el.dataset.id = p.id;
    c.el.style.setProperty('--i', created++ % 10);
    cards.set(p.id, c);
  }
  if (c.v !== p._v) {
    c.el.innerHTML = cardHtml(p);
    c.v = p._v;
  }
  const selected = state.selected.has(p.id);
  c.el.classList.toggle('sel', selected);
  const box = c.el.querySelector('input.tick');
  if (box.checked !== selected) box.checked = selected;
  c.el.querySelector('.tag-low').hidden = p.id !== state.lowId;
  return c.el;
}

const skeletonCard =
  '<div class="gcard"><div class="sk skel-img" style="border-radius:0"></div><div class="gbody"><div class="sk" style="width:55%"></div><div class="sk"></div><div class="sk" style="width:40%"></div></div></div>';

export function syncGallery(vis) {
  $('#grid').hidden = true;
  $('#gallery').hidden = false;

  const live = new Set(state.items.map((p) => p.id));
  for (const id of [...cards.keys()]) if (!live.has(id)) cards.delete(id);

  const gallery = $('#gallery');
  gallery.replaceChildren(...vis.map(ensureCard));
  if (state.busy) gallery.insertAdjacentHTML('beforeend', skeletonCard.repeat(vis.length ? 2 : 6));
}
