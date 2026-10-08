'use strict';
/**
 * Clicks (SAP Hybris storefront).
 *
 *   search:  /search?q=<term>:relevance&text=<term>&page=<0-based>&count=12
 *            NOTE: Clicks ignores `page` unless its own `q=<term>:relevance` is also present.
 *            It prints no total. The pager has a "Last" link, so we derive the exact total
 *            from the last page (see `totalFromLastPage`).
 *   product: #information tab (description + ingredients), JSON-LD or add-to-cart button for stock
 */
const cheerio = require('cheerio');
const { FetchError } = require('../errors');
const { clean, num, validPrice } = require('../util');
const { stockFromSchema } = require('./schema');

const KEY = 'clicks';
const LABEL = 'Clicks';
const HOST = 'clicks.co.za';
const PAGE_SIZE = 12;

const searchUrl = (q, n) =>
  `https://${HOST}/search?q=${encodeURIComponent(`${q}:relevance`)}&text=${encodeURIComponent(q)}&page=${n}&count=${PAGE_SIZE}`;

/**
 * @returns {{items: import('../types').ListingItem[], hasPager: boolean, lastPage: number|null, empty: boolean}}
 */
function parseSearchPage(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('.productBlock').each((_, el) => {
    const b = $(el);
    const href = b.find('.clickfunct_plp a').first().attr('href') || b.find('a').first().attr('href');
    const name = clean(b.find('.product-name p').first().text()) || clean(b.find('.product-name').text());
    if (!href || !name) return;
    const prices = (clean(b.find('.price-wrap').first().text()).match(/R\s?[\d,]+(?:\.\d+)?/g) || [])
      .map(num)
      .filter(Boolean);
    const src = b.find('img').first().attr('src');
    items.push({
      name,
      brand: clean(b.find('h5').first().text()),
      url: new URL(href, `https://${HOST}`).href,
      price: validPrice(prices.length ? Math.min(...prices) : null),
      was: validPrice(prices.length > 1 ? Math.max(...prices) : null),
      image: src ? new URL(src, `https://${HOST}`).href : null,
    });
  });

  const pagerLinks = $('.pagination a');
  const lastHref = pagerLinks
    .filter((_, e) => /^\s*Last\s*$/i.test($(e).text()))
    .first()
    .attr('href');
  const lastPageNum = lastHref ? parseInt((lastHref.match(/[?&]page=(\d+)/) || [])[1], 10) : NaN;

  const text = clean($.root().text());
  const empty =
    $('#searchProducts, .wishplp').length > 0 || /no results|did not match|couldn'?t find|0 results/i.test(text);

  return { items, hasPager: pagerLinks.length > 0, lastPage: Number.isNaN(lastPageNum) ? null : lastPageNum, empty };
}

/** Detail fields from a product page. Stock is claimed only when the page actually shows it. */
function parseProductPage(html, item) {
  const $ = cheerio.load(html);
  const info = $('#information').length ? $('#information') : $('#productTabs');
  const text = clean(info.text());

  const desc = (text.match(/Description:?(.*?)(?:Ingredients|$)/i) || [])[1] || '';
  const ingredients =
    (text.match(/Ingredients:?\s*Ingredients:?(.*?)(?:See more|$)/i) ||
      text.match(/Ingredients:\s*(.*?)(?:See more|$)/i) ||
      [])[1] || '';

  let inStock = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).html());
      const offer = Array.isArray(j.offers) ? j.offers[0] : j.offers;
      if (j['@type'] === 'Product' && offer?.availability) inStock = stockFromSchema(offer.availability);
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  if (inStock === null) {
    const buyBox = clean($('#addToCartForm, .addtocart_wrap, .product-detail, #addToCartButton').text());
    if (/out of stock|sold out|currently unavailable/i.test(buyBox)) inStock = 'No';
    else if (
      $('button.add_to_cart_button, #addToCartButton, [id*="addToCart"] button, button[class*="addtocart" i]').length
    )
      inStock = 'Yes';
  }

  return {
    brand: item.brand || '',
    desc,
    ingredients,
    inStock,
    livePrice: validPrice(num(clean($('.price').first().text()))),
    sku: item.url.match(/\/p\/(\d+)/)?.[1] || '',
    size: '',
  };
}

/**
 * @param {object} deps
 * @param {ReturnType<import('../http/fetcher').createFetcher>} deps.fetcher
 * @param {number} deps.cacheTtlMs
 * @param {() => number} [deps.now]
 */
function createClicks({ fetcher, cacheTtlMs, now = Date.now }) {
  /** search term -> { t, total }  (the "last page" lookup costs one extra request, so remember it) */
  const totals = new Map();

  /** Exact total = (lastPage x pageSize) + products on the last page. Null if it cannot be determined. */
  async function totalFromLastPage(q, lastPage, pageSizeSeen) {
    const key = q.toLowerCase();
    const hit = totals.get(key);
    if (hit && now() - hit.t < cacheTtlMs) return hit.total;
    try {
      const last = parseSearchPage(await fetcher.get(searchUrl(q, lastPage), KEY));
      if (!last.items.length) return null;
      const total = lastPage * pageSizeSeen + last.items.length;
      totals.set(key, { t: now(), total });
      return total;
    } catch (e) {
      if (e.kind === 'blocked') throw e;
      return null; // total stays unknown rather than guessed
    }
  }

  return {
    key: KEY,
    label: LABEL,
    host: HOST,

    /** One page of results (0-based `n`). */
    async page(q, n) {
      const parsed = parseSearchPage(await fetcher.get(searchUrl(q, n), KEY));
      const { items } = parsed;

      if (!items.length) {
        if (n > 0) return { items: [], total: null };
        if (parsed.empty) return { items: [], total: 0 };
        throw new FetchError('layout', 'no products found in page');
      }

      let total = null;
      if (n === 0) {
        if (!parsed.hasPager || parsed.lastPage === 0)
          total = items.length; // a single page of results
        else if (parsed.lastPage !== null) total = await totalFromLastPage(q, parsed.lastPage, items.length);
      }
      return { items, total };
    },

    async detail(item) {
      return parseProductPage(await fetcher.getCached(item.url, KEY), item);
    },
  };
}

module.exports = { createClicks, parseSearchPage, parseProductPage, searchUrl, KEY, LABEL, HOST, PAGE_SIZE };
