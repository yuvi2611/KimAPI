/**
 * HTML snippets shared by the list, gallery and drawer.
 * Rule: any text that came from a retailer is passed through `esc()` before it is inserted.
 */
import { NOT_FOUND_HTML } from '../constants.js';
import { ICON } from '../lib/icons.js';
import { esc, money } from '../lib/format.js';

/** Promise chips. `max` limits how many show before "+N". */
export function chipsHtml(p, max = 3) {
  if (!p.promise) return '<span class="nf">No promise found</span>';
  const all = p.promise.split(' · ');
  const shown = all
    .slice(0, max)
    .map((c) => `<span class="chip">${esc(c)}</span>`)
    .join('');
  const more = all.length > max ? `<span class="chip more">+${all.length - max}</span>` : '';
  return `<div class="chips">${shown}${more}</div>`;
}

export function stockHtml(p) {
  if (p.inStock === 'Yes') return '<span class="stock yes">In stock</span>';
  if (p.inStock === 'No') return '<span class="stock no">Out of stock</span>';
  return '<span class="stock unk">Not stated</span>';
}

/** Product image with a graceful "No image" fallback if it fails to load. */
export function imgHtml(p, size) {
  if (!p.image) return '<span>No image</span>';
  const dims = size ? `width="${size}" height="${size}"` : '';
  return `<img src="${esc(p.image)}" alt="" ${dims} loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'No image'}))">`;
}

/** The fields that go into the Excel sheet, so people can check them before exporting. */
export function factsHtml(p) {
  const f = (v) => (v ? esc(v) : NOT_FOUND_HTML);
  const time = new Date(p.fetchedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  return `<dl class="facts">
    <dt>Type</dt><dd>${f(p.type)}</dd>
    <dt>Gender</dt><dd>${f(p.gender)}</dd>
    <dt>Ingredient concept</dt><dd>${f(p.ingredientConcept)}</dd>
    <dt>Claim</dt><dd>${f(p.promise ? p.promise.split(' · ').join(', ') : '')}</dd>
    <dt>In stock?</dt><dd>${f(p.inStock)}</dd>
    <dt>Price</dt><dd>${p.price != null ? money(p.price) : NOT_FOUND_HTML}</dd>
    <dt>Retrieved</dt><dd>${esc(time)}</dd></dl>`;
}

/** Shown when a product's page failed to load. The Retry button is wired in events.js. */
export function warnHtml(p) {
  if (!p.detailError) return '';
  return `<div class="dwarn"><span>${ICON.warn}<span>Full details couldn’t be loaded. ${esc(p.detailError)}</span></span><button class="btn sm" type="button" data-act="retry">Retry</button></div>`;
}

export const descHtml = (p) =>
  `<p>${p.fullDescription ? esc(p.fullDescription) : '<span class="nf">No description published by the retailer.</span>'}</p>`;
