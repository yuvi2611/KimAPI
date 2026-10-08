'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const dischem = require('../src/retailers/dischem');
const clicks = require('../src/retailers/clicks');
const { stockFromSchema } = require('../src/retailers/schema');
const { FetchError } = require('../src/errors');
const h = require('./helpers/html');

const DC = 'https://www.dischem.co.za';

describe('Dis-Chem parsing', () => {
  const tiles = [
    { name: 'Mitchum Ultimate 72hour 100ml', url: `${DC}/mitchum-110`, price: 80.99, was: 89.99 },
    { name: 'Nivea Deodorant 150ml', url: `${DC}/nivea-005`, price: 44.99 },
  ];

  it('reads tiles, prices (current and previous), image and the reported total', () => {
    const { items, total } = dischem.parseSearchPage(h.dischemSearch({ tiles, total: 538 }));
    assert.equal(total, 538);
    assert.equal(items.length, 2);
    assert.deepEqual([items[0].name, items[0].price, items[0].was], ['Mitchum Ultimate 72hour 100ml', 80.99, 89.99]);
    assert.equal(items[1].was, null, 'no previous price means not on special');
    assert.match(items[0].image, /^https:\/\/img\.test\//);
  });

  it('recognises a genuine "no results" page', () => {
    const r = dischem.parseSearchPage(h.dischemSearch({ tiles: [], empty: true }));
    assert.equal(r.items.length, 0);
    assert.equal(r.empty, true);
  });

  it('reads product details: brand, description, stock, price, sku, size', () => {
    const d = dischem.parseProductPage(
      h.dischemProduct({ description: 'Description: 72 hours. Ingredients: AQUA, ZINC' }),
    );
    assert.equal(d.brand, 'Mitchum');
    assert.equal(d.inStock, 'Yes');
    assert.equal(d.livePrice, 80.99);
    assert.equal(d.sku, '464110');
    assert.equal(d.size, '100ml');
    assert.match(d.ingredients, /AQUA, ZINC/);
  });

  it('says "No" for out of stock, and null when the page does not say', () => {
    assert.equal(dischem.parseProductPage(h.dischemProduct({ availability: 'OutOfStock' })).inStock, 'No');
    assert.equal(stockFromSchema(undefined), null);
    assert.equal(stockFromSchema('https://schema.org/PreOrder'), null);
  });

  it('survives broken JSON-LD (falls back to nothing, never throws)', () => {
    const d = dischem.parseProductPage(
      '<script type="application/ld+json">{oops</script><div id="description">Hi</div>',
    );
    assert.equal(d.livePrice, null);
    assert.equal(d.inStock, null);
  });
});

describe('Dis-Chem page(): errors vs empty', () => {
  const make = (html) => dischem.createDischem({ fetcher: { get: async () => html, getCached: async () => html } });

  it('"no results" is an empty result, not an error', async () => {
    assert.deepEqual(await make(h.dischemSearch({ tiles: [], empty: true })).page('zzz', 0), { items: [], total: 0 });
  });

  it('an unrecognisable page on page 1 is a layout error (so the UI says the site changed)', async () => {
    await assert.rejects(
      make('<html>totally different</html>').page('x', 0),
      (e) => e instanceof FetchError && e.kind === 'layout',
    );
  });

  it('an empty later page just means we ran off the end', async () => {
    const r = await make('<html></html>').page('x', 3);
    assert.deepEqual(r.items, []);
  });
});

describe('Clicks parsing', () => {
  const tiles = [
    {
      name: 'English Blazer Deodorant 200ml',
      brand: 'Yardley',
      path: '/yardley_english-blazer/p/220438',
      prices: 'R 74.99',
    },
    { name: 'Nivea Roll On 50ml', brand: 'Nivea', path: '/nivea_roll-on/p/100200', prices: 'R 59.99 R 79.99' },
  ];

  it('reads tiles with absolute links, brand, and sale prices (low = price, high = was)', () => {
    const { items } = clicks.parseSearchPage(h.clicksSearch({ tiles }));
    assert.equal(items.length, 2);
    assert.equal(items[0].url, 'https://clicks.co.za/yardley_english-blazer/p/220438');
    assert.equal(items[0].brand, 'Yardley');
    assert.deepEqual([items[1].price, items[1].was], [59.99, 79.99]);
  });

  it('reads the pager: last page number, and whether a pager exists', () => {
    assert.equal(clicks.parseSearchPage(h.clicksSearch({ tiles, lastPage: 25 })).lastPage, 25);
    assert.equal(clicks.parseSearchPage(h.clicksSearch({ tiles })).hasPager, false);
  });

  it('claims stock only on evidence: add-to-cart => Yes, "out of stock" => No, nothing => null', () => {
    const item = { url: 'https://clicks.co.za/x/p/1', brand: 'B' };
    assert.equal(clicks.parseProductPage(h.clicksProduct({ stock: 'cart' }), item).inStock, 'Yes');
    assert.equal(clicks.parseProductPage(h.clicksProduct({ stock: 'out' }), item).inStock, 'No');
    assert.equal(clicks.parseProductPage(h.clicksProduct({ stock: 'none' }), item).inStock, null);
  });

  it('splits description from ingredients and pulls the sku from the link', () => {
    const d = clicks.parseProductPage(h.clicksProduct({ description: 'Smooth soap.', ingredients: 'AQUA, ZINC' }), {
      url: 'https://clicks.co.za/x/p/220438',
    });
    assert.equal(d.desc.trim(), 'Smooth soap.');
    assert.match(d.ingredients, /AQUA/);
    assert.equal(d.sku, '220438');
  });

  it('builds the search URL Clicks needs: q=<term>:relevance, 0-based page', () => {
    const url = clicks.searchUrl('face wash', 2);
    assert.match(url, /q=face%20wash%3Arelevance/);
    assert.match(url, /text=face%20wash/);
    assert.match(url, /page=2/);
  });
});

describe('Clicks page(): exact totals', () => {
  /** A fake fetcher that serves page 0 and the last page. */
  function fakeFetcher({ firstTiles, lastTiles, lastPage, log }) {
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, path: `/p${i}/p/${i}` }));
    return {
      get: async (url) => {
        log.push(url);
        const page = Number(url.match(/page=(\d+)/)[1]);
        return h.clicksSearch({ tiles: mk(page === 0 ? firstTiles : lastTiles), lastPage });
      },
      getCached: async () => '',
    };
  }

  it('total = (lastPage x page size) + products on the last page, from one extra request', async () => {
    const log = [];
    const c = clicks.createClicks({
      fetcher: fakeFetcher({ firstTiles: 12, lastTiles: 3, lastPage: 25, log }),
      cacheTtlMs: 60_000,
    });
    const r = await c.page('soap', 0);
    assert.equal(r.total, 25 * 12 + 3);
    assert.equal(log.length, 2);

    await c.page('soap', 0); // second look at the same term uses the remembered total
    assert.equal(log.length, 3, 'only page 0 is fetched again, not the last page');
  });

  it('a single page of results needs no extra request', async () => {
    const log = [];
    const fetcher = {
      get: async (u) => (log.push(u), h.clicksSearch({ tiles: [{ name: 'A', path: '/a/p/1' }] })),
      getCached: async () => '',
    };
    const r = await clicks.createClicks({ fetcher, cacheTtlMs: 1000 }).page('rare', 0);
    assert.equal(r.total, 1);
    assert.equal(log.length, 1);
  });

  it('if the last-page lookup fails the total stays unknown (never guessed)', async () => {
    let n = 0;
    const fetcher = {
      get: async () => {
        if (n++ === 0) return h.clicksSearch({ tiles: [{ name: 'A', path: '/a/p/1' }], lastPage: 9 });
        throw new FetchError('timeout', 'slow');
      },
      getCached: async () => '',
    };
    const r = await clicks.createClicks({ fetcher, cacheTtlMs: 1000 }).page('x', 0);
    assert.equal(r.total, null);
    assert.equal(r.items.length, 1);
  });

  it('a block while looking up the total is surfaced, not swallowed', async () => {
    let n = 0;
    const fetcher = {
      get: async () => {
        if (n++ === 0) return h.clicksSearch({ tiles: [{ name: 'A', path: '/a/p/1' }], lastPage: 9 });
        throw new FetchError('blocked', 'blocked', 403);
      },
      getCached: async () => '',
    };
    await assert.rejects(clicks.createClicks({ fetcher, cacheTtlMs: 1000 }).page('x', 0), (e) => e.kind === 'blocked');
  });
});
