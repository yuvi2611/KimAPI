/** Choosing products to export, and expanding rows. */
import { schedule } from '../scheduler.js';
import { state } from '../state.js';
import { visible } from '../selectors.js';

export function toggleExpanded(id) {
  state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
  schedule();
}

export function toggleSelected(id) {
  state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  schedule();
}

/** Checkbox click on a product. Shift-click selects (or clears) the whole range since the last click. */
export function pick(product, event) {
  const shown = visible();
  const on = event.target.checked;
  if (event.shiftKey && state.lastPicked) {
    const a = shown.findIndex((x) => x.id === state.lastPicked);
    const b = shown.findIndex((x) => x.id === product.id);
    if (a > -1 && b > -1) {
      for (const x of shown.slice(Math.min(a, b), Math.max(a, b) + 1))
        on ? state.selected.add(x.id) : state.selected.delete(x.id);
    }
  } else {
    on ? state.selected.add(product.id) : state.selected.delete(product.id);
  }
  state.lastPicked = product.id;
  schedule();
}

/** Header checkbox: select or clear everything currently shown. */
export function selectAllShown(checked) {
  for (const p of visible()) checked ? state.selected.add(p.id) : state.selected.delete(p.id);
  schedule();
}

export function clearFilters() {
  state.fStock = false;
  state.fPromise = false;
  state.tab = 'all';
  document.querySelector('#fStock').checked = false;
  document.querySelector('#fPromise').checked = false;
  schedule();
}
