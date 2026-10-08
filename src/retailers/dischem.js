'use strict';
/**
 * Dis-Chem (Magento storefront).
 *
 *   search:  /catalogsearch/result/?q=<term>&p=<page, 1-based>      -> `li.product-item` tiles + a "Showing 1 - 40 of 538 results" bar
 *   product: JSON-LD <script> (price, stock, brand) + #description + a specs table
 *
 * `parseSearchPage` / `parseProductPage` are pure so they can be tested with saved HTML.
 */
const cheerio = require('cheerio');
const { FetchError } = require('../errors');
const { clean, validPrice } = require('../util');
const { stockFromSchema } = require('./schema');

const KEY = 'dischem';
const LABEL = 'Dis-Chem';
const HOST = 'www.dischem.co.za';

/** @returns {{items: import('../types').ListingItem[], total: number|null, empty: boolean}} */
function parseSearchPage(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('li.product-item').each((_, el) => {
    const li = $(el);
    const a = li.find('a.product-item-link').first();
    const name = clean(a.text());
    const url = a.attr('href');
    if (!name || !url) return;
    items.push({
      name,
      url,
      price: validPrice(parseFloat(li.find('[data-price-type="finalPrice"]').first().attr('data-price-amount'))),
      was: validPrice(parseFloat(li.find('[data-price-type="oldPrice"]').first().attr('data-price-amount'))),
      image: li.find('img.product-image-photo').first().attr('src') || null,
    });
  });

  const bar = clean($('.toolbar-amount').first().text());
  const found = (bar.match(/of\s+([\d,]+)/i) || bar.match(/^([\d,]+)\s+(?:items|results)/i) || [])[1];
  const total = found ? parseInt(found.replace(/,/g, ''), 10) : null;
  const empty = /returned no results|no results|did not match/i.test($.root().text());
  return { items, total, empty };
}

/** Detail fields from a product page. Missing things come back empty, never guessed. */
function parseProductPage(html) {
  const $ = cheerio.load(html);
  let brand = clean($('.product-brand, .brand-name, [itemprop=brand]').first().text());
  let desc = clean($('#description').text());
  let livePrice = null;
  let inStock = null;

  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).html());
      if (j['@type'] !== 'Product') return;
      if (!brand && j.brand) brand = j.brand.name || '';
      if (j.description && !desc) desc = j.description;
      const offer = Array.isArray(j.offers) ? j.offers[0] : j.offers;
      if (offer) {
        livePrice = validPrice(parseFloat(offer.price));
        inStock = stockFromSchema(offer.availability);
      }
    } catch {
      /* malformed JSON-LD: ignore and fall back to the listing data */
    }
  });

  const specs = clean($('#product-attribute-specs-table').text());
  return {
    brand,
    desc,
    ingredients: (desc.match(/Ingredients\s*:(.*)$/i) || [])[1] || '',
    livePrice,
    inStock,
    sku: specs.match(/SKU\s*(\d+)/)?.[1] || '',
    size: specs.match(/Pack Size\s*([^\s]+)/)?.[1] || '',
  };
}

/** @param {{fetcher: ReturnType<import('../http/fetcher').createFetcher>}} deps */
function createDischem({ fetcher }) {
  return {
    key: KEY,
    label: LABEL,
    host: HOST,

    /** One page of results (0-based `n`). */
    async page(q, n) {
      const url = `https://${HOST}/catalogsearch/result/?q=${encodeURIComponent(q)}${n ? `&p=${n + 1}` : ''}`;
      const { items, total, empty } = parseSearchPage(await fetcher.get(url, KEY));
      if (items.length) return { items, total };
      if (empty) return { items: [], total: 0 };
      if (n > 0) return { items: [], total }; // ran off the end of the results
      throw new FetchError('layout', 'no products found in page');
    },

    async detail(item) {
      return parseProductPage(await fetcher.getCached(item.url, KEY));
    },
  };
}

module.exports = { createDischem, parseSearchPage, parseProductPage, KEY, LABEL, HOST };
