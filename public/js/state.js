import { ALL_STORES, DEFAULT_BATCH } from './constants.js';

/**
 * The single source of truth for the page. UI modules READ this and render;
 * actions WRITE this and then call `schedule()` (see scheduler.js).
 *
 * @typedef {object} StoreStatus
 * @property {'searching'|'found'|'done'|'error'|'idle'} state
 * @property {number|null} total      how many exist at the store (null = store does not say)
 * @property {number} next            offset to continue from (Load more)
 * @property {boolean} hasMore
 * @property {string} [message]       friendly error text when state is "error"
 * @property {string} [note]          store-specific explanation (e.g. it capped the results)
 * @property {string} [warning]       e.g. "2 products loaded without full details"
 */
export const state = {
  // search
  q: '',
  stores: [...ALL_STORES], // chosen on the home screen
  batch: DEFAULT_BATCH, // products per store per load
  active: [], // stores used by the current search
  /** @type {Record<string, StoreStatus>} */
  src: {},
  /** @type {import('../../src/types').Product[]} */
  items: [],
  order: 0, // arrival counter, used for "relevance" order
  busy: false,
  stream: null, // handle to the open event stream
  finishedAt: null,

  // view
  tab: 'all',
  fStock: false,
  fPromise: false,
  sort: 'rel',
  view: 'list', // 'list' | 'gallery'

  // selection + detail
  selected: new Set(), // product ids
  expanded: new Set(), // product ids with the inline detail row open
  lastPicked: null, // for shift-click range select
  drawerId: null,

  // misc
  exporting: false,
  lowId: null, // id of the cheapest visible product (when there are 2+ priced)
};

/** Clear everything belonging to a search. Used when starting a new search or going home. */
export function resetResults(patch = {}) {
  Object.assign(
    state,
    {
      items: [],
      order: 0,
      selected: new Set(),
      expanded: new Set(),
      src: {},
      tab: 'all',
      lastPicked: null,
      finishedAt: null,
      lowId: null,
    },
    patch,
  );
}
