'use strict';
/**
 * GET /api/search?q=<term>&limit=<n>&sources=dischem,clicks&offsets={"dischem":12}
 *
 * Streams Server-Sent Events so results appear one by one instead of after a long wait:
 *
 *   status   { source, state: searching|found|done|error, total, next, hasMore, note, warning, message }
 *   product  <Product>
 *   fatal    { message }      bad input; the stream then ends
 *   done     {}               every store has finished
 */
const express = require('express');
const { friendlyMessage } = require('../errors');
const { clean } = require('../util');
const { fetchRange } = require('../products/paging');
const { buildProduct } = require('../products/build');
const { pool } = require('../products/pool');

const KEEP_ALIVE_MS = 15_000;

/** Validate the search term. Returns `{ q }` or `{ error }` with a message safe to show users. */
function readQuery(raw, { minQuery, maxQuery }) {
  // Strip control characters and angle brackets from the term. Deliberate, hence the lint override.
  // eslint-disable-next-line no-control-regex
  const q = clean(String(raw || '').replace(/[\u0000-\u001f<>]/g, ' '));
  if (q.length < minQuery) return { error: `Type at least ${minQuery} characters to search.` };
  if (q.length > maxQuery) return { error: `That search is too long. Keep it under ${maxQuery} characters.` };
  return { q };
}

/**
 * @param {object} deps
 * @param {Record<string, import('../types').Retailer>} deps.retailers
 * @param {import('../types').Config['search']} deps.search
 */
function createSearchRouter({ retailers, search }) {
  const router = express.Router();

  router.get('/search', async (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // stop proxies buffering the stream
    });
    const send = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const { q, error } = readQuery(req.query.q, search);
    if (error) {
      send('fatal', { message: error });
      return res.end();
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || search.defaultLimit, 1), search.maxLimit);
    let offsets = {};
    try {
      offsets = JSON.parse(req.query.offsets || '{}');
    } catch {
      /* ignore malformed offsets: start from the beginning */
    }
    const keys = String(req.query.sources || Object.keys(retailers).join(','))
      .split(',')
      .filter((k) => retailers[k]);
    if (!keys.length) {
      send('fatal', { message: 'Pick at least one retailer.' });
      return res.end();
    }

    let closed = false;
    req.on('close', () => {
      closed = true;
    });
    const heartbeat = setInterval(() => !res.writableEnded && res.write(': keep-alive\n\n'), KEEP_ALIVE_MS);

    // Stores run in parallel; one failing never affects another.
    await Promise.all(
      keys.map(async (key) => {
        const retailer = retailers[key];
        const { label } = retailer;
        const offset = Math.max(parseInt(offsets[key], 10) || 0, 0);
        try {
          send('status', { source: key, label, state: 'searching' });
          const range = await fetchRange(retailer, q, offset, limit);
          if (closed) return;
          send('status', { source: key, label, state: 'found', total: range.total, count: range.items.length });

          let failed = 0;
          await pool(range.items, search.concurrency, async (item) => {
            if (closed) return;
            const product = await buildProduct(retailer, item);
            if (product.detailError) failed++;
            send('product', product);
          });

          send('status', {
            source: key,
            label,
            state: 'done',
            total: range.total,
            returned: range.items.length,
            next: range.next,
            hasMore: range.hasMore,
            note: range.note,
            warning: failed
              ? `${failed} product${failed > 1 ? 's' : ''} loaded without full details. Use Retry on those cards.`
              : null,
          });
        } catch (e) {
          send('status', {
            source: key,
            label,
            state: 'error',
            kind: e.kind || 'unknown',
            message: friendlyMessage(e, label),
            next: offset,
            hasMore: false,
          });
        }
      }),
    );

    clearInterval(heartbeat);
    send('done', {});
    res.end();
  });

  return router;
}

module.exports = { createSearchRouter, readQuery };
