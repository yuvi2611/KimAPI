import { state } from './state.js';

/** How many products of one store are loaded. */
export const loadedFor = (key) => state.items.filter((p) => p.source === key).length;

const SORTERS = {
  rel: (a, b) => a._o - b._o,
  asc: (a, b) => (a.price ?? 1e9) - (b.price ?? 1e9),
  desc: (a, b) => (b.price ?? -1) - (a.price ?? -1),
  name: (a, b) => a.name.localeCompare(b.name),
};

/** Products that pass the current store tab + filters, in the chosen sort order. */
export function visible() {
  return state.items
    .filter(
      (p) =>
        (state.tab === 'all' || p.source === state.tab) &&
        (!state.fStock || p.inStock === 'Yes') &&
        (!state.fPromise || p.promise),
    )
    .sort(SORTERS[state.sort]);
}

/** Id of the cheapest product, only meaningful when 2+ products have prices. */
export function cheapestId(priced) {
  return priced.length > 1 ? priced.reduce((min, p) => (p.price < min.price ? p : min)).id : null;
}

/** What Export will send: the selection if any, otherwise everything currently shown. */
export const exportScope = (vis) => (state.selected.size ? state.items.filter((p) => state.selected.has(p.id)) : vis);
