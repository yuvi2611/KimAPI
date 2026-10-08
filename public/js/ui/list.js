/**
 * List view (the table). Rows are created ONCE per product and then reused: on each render we
 * only move them into the right order and patch their state. This is why nothing flickers
 * and images are not reloaded while results stream in.
 */
import { COLORS } from '../constants.js';
import { $ } from '../lib/dom.js';
import { esc, money, offPct } from '../lib/format.js';
import { ICON } from '../lib/icons.js';
import { state } from '../state.js';
import { chipsHtml, descHtml, factsHtml, imgHtml, stockHtml, warnHtml } from './fragments.js';

/** id -> { tr, d (detail row), v (version of the data the row was built from) } */
const rows = new Map();
let created = 0;

export const resetRows = () => rows.clear();

function rowHtml(p) {
  const off = offPct(p);
  const price =
    p.price != null
      ? `<span class="price">${money(p.price)}</span>${off ? `<span class="off">−${off}%</span>` : ''}${p.was ? `<span class="was">${money(p.was)}</span>` : ''}`
      : '<span class="price nf">Price not found</span>';
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
    <td class="c-price">${price}<span class="tag-low" hidden>Lowest price</span></td>
    <td class="c-promise">${chipsHtml(p)}</td>
    <td class="c-stock">${stockHtml(p)}</td>
    <td class="c-act"><div class="acts">
      ${p.detailError ? `<button class="iconbtn warnico" type="button" data-act="toggle" aria-label="Details missing. Open to retry" title="Some details couldn’t be loaded">${ICON.warn}</button>` : ''}
      <button class="iconbtn" type="button" data-act="open" aria-label="Open full details" title="Full details">${ICON.expand}</button>
      <button class="iconbtn" type="button" data-act="toggle" aria-label="Show details" aria-expanded="false">${ICON.chevron}</button>
      <a class="iconbtn" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open on ${esc(p.retailer)} (new tab)" title="Open on ${esc(p.retailer)}">${ICON.ext}</a>
    </div></td>`;
}

const detailHtml = (p) =>
  `<td colspan="6"><div class="dgrid">${warnHtml(p)}<div><h3>Description</h3>${descHtml(p)}</div><div><h3>What goes into your Excel sheet</h3>${factsHtml(p)}</div></div></td>`;

function ensureRow(p) {
  let r = rows.get(p.id);
  if (!r) {
    r = { tr: document.createElement('tr'), d: document.createElement('tr'), v: -1 };
    r.tr.className = 'row new';
    r.tr.dataset.id = p.id;
    r.tr.style.setProperty('--i', created++ % 10); // staggers the entrance animation
    r.d.className = 'detail';
    r.d.dataset.id = p.id;
    rows.set(p.id, r);
  }
  if (r.v !== p._v) {
    r.tr.innerHTML = rowHtml(p);
    r.d.innerHTML = detailHtml(p);
    r.v = p._v;
  }
  const selected = state.selected.has(p.id);
  const open = state.expanded.has(p.id);
  r.tr.classList.toggle('sel', selected);
  const box = r.tr.querySelector('input.tick');
  if (box.checked !== selected) box.checked = selected;
  r.tr.querySelectorAll('[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', open));
  r.tr.querySelector('.tag-low').hidden = p.id !== state.lowId;
  r.d.hidden = !open;
  return r;
}

const skeletonRows = (n) =>
  Array.from(
    { length: n },
    () =>
      `<tr class="skeleton"><td colspan="6"><div class="sk" style="width:${50 + Math.random() * 40}%"></div></td></tr>`,
  ).join('');

/** @param {object[]} vis products to show, already filtered and sorted */
export function syncRows(vis) {
  $('#grid').hidden = false;
  $('#gallery').hidden = true;

  const live = new Set(state.items.map((p) => p.id));
  for (const id of [...rows.keys()]) if (!live.has(id)) rows.delete(id);

  const frag = document.createDocumentFragment();
  for (const p of vis) {
    const r = ensureRow(p);
    frag.append(r.tr, r.d);
  }
  const body = $('#tbody');
  body.replaceChildren(frag);
  if (state.busy) body.insertAdjacentHTML('beforeend', skeletonRows(vis.length ? 2 : 4));
  setTimeout(() => body.querySelectorAll('tr.new').forEach((tr) => tr.classList.remove('new')), 900);

  // header checkbox: checked / partly checked / unchecked
  const all = $('#selAll');
  const n = vis.filter((p) => state.selected.has(p.id)).length;
  all.checked = vis.length > 0 && n === vis.length;
  all.indeterminate = n > 0 && n < vis.length;
  all.disabled = !vis.length;
}
