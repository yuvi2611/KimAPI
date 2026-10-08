/** Retailers the UI knows about, in display order. Keys match the server's retailer registry. */
export const ALL_STORES = ['dischem', 'clicks'];

export const NAMES = { clicks: 'Clicks', dischem: 'Dis-Chem' };

/** Brand dots. These are CSS variables so they follow the theme. */
export const COLORS = { clicks: 'var(--clicks)', dischem: 'var(--dischem)' };

/** "Load N per store at a time" choices. The server caps this at 40. */
export const BATCH_SIZES = [8, 12, 24, 40];

export const DEFAULT_BATCH = 12;

/** What we show wherever the retailer did not state something. Never a guess. */
export const NOT_FOUND_HTML = '<span class="nf">Not found</span>';
