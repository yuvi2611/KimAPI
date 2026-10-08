'use strict';
/**
 * Retailer registry. To add a store, create `src/retailers/<name>.js` that returns the
 * same shape as `createDischem` (key, label, host, page(q, n), detail(item)) and register it below.
 * Nothing else in the server needs to change. See docs/CONTRIBUTING.md.
 */
const { createDischem } = require('./dischem');
const { createClicks } = require('./clicks');

/**
 * @param {object} deps
 * @param {ReturnType<import('../http/fetcher').createFetcher>} deps.fetcher
 * @param {import('../types').Config} deps.config
 * @returns {Record<string, import('../types').Retailer>}
 */
function createRetailers({ fetcher, config }) {
  const list = [createDischem({ fetcher }), createClicks({ fetcher, cacheTtlMs: config.fetch.cacheTtlMs })];
  return Object.fromEntries(list.map((r) => [r.key, r]));
}

/** Display names, available before the registry exists (the fetcher needs them for messages). */
const RETAILER_LABELS = { dischem: 'Dis-Chem', clicks: 'Clicks' };

module.exports = { createRetailers, RETAILER_LABELS };
