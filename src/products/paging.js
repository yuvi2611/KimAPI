'use strict';

/**
 * Fetch a window [offset, offset + limit) of a retailer's results, even when the window
 * straddles the retailer's own page boundaries ("Load more" needs this).
 *
 * Returns the items plus honest paging facts:
 *   total    how many exist (null if the store will not say)
 *   next     the offset to continue from
 *   hasMore  whether Load more makes sense
 *   note     a human explanation when the store cuts us short
 *
 * @param {import('../types').Retailer} retailer
 * @param {string} q
 * @param {number} offset
 * @param {number} limit
 */
async function fetchRange(retailer, q, offset, limit) {
  const first = await retailer.page(q, 0);
  const total = first.total;
  const pageSize = first.items.length || 1;
  const out = [];
  let page = Math.floor(offset / pageSize);
  let exhausted = false;
  let note = null;

  while (out.length < limit) {
    const pos = offset + out.length;
    if (total != null && pos >= total) {
      exhausted = true;
      break;
    }
    const data = page === 0 ? first : await retailer.page(q, page);

    // Some stores silently serve page 1 again for unknown page numbers. Detect and stop.
    if (page > 0 && data.items.length && data.items[0].url === first.items[0].url) {
      exhausted = true;
      note = `${retailer.label} didn't provide further pages for this search.`;
      break;
    }

    const from = pos - page * pageSize;
    const slice = data.items.slice(from, from + (limit - out.length));
    if (!slice.length) {
      exhausted = true;
      if (total != null && pos < total)
        note = `${retailer.label} reports ${total} results but only made ${pos} available.`;
      break;
    }
    out.push(...slice);
    page++;
  }

  const next = offset + out.length;
  const hasMore = !exhausted && (total != null ? next < total : out.length >= limit);
  return { items: out, total, next, hasMore, note };
}

module.exports = { fetchRange };
