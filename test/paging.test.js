'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { fetchRange } = require('../src/products/paging');
const { buildProduct } = require('../src/products/build');

/** A retailer with `total` products served `size` per page: P0, P1, ... */
function fakeRetailer({ total, size = 12, reportTotal = true, repeatPageOne = false, cap = Infinity }) {
  const all = Array.from({ length: total }, (_, i) => ({
    name: `P${i}`,
    url: `https://x.test/p${i}`,
    price: 10,
    was: null,
    image: null,
  }));
  const calls = [];
  return {
    key: 'fake',
    label: 'Fake',
    host: 'x.test',
    calls,
    async page(q, n) {
      calls.push(n);
      let items = all.slice(n * size, (n + 1) * size);
      if (repeatPageOne && n > 0) items = all.slice(0, size); // the store ignores unknown pages
      if ((n + 1) * size > cap) items = [];
      return { items, total: reportTotal ? total : null };
    },
    async detail() {
      return {};
    },
  };
}

describe('fetchRange: Load more paging', () => {
  it('returns the first batch with honest totals', async () => {
    const r = await fetchRange(fakeRetailer({ total: 50 }), 'q', 0, 5);
    assert.deepEqual(
      r.items.map((i) => i.name),
      ['P0', 'P1', 'P2', 'P3', 'P4'],
    );
    assert.equal(r.total, 50);
    assert.equal(r.next, 5);
    assert.equal(r.hasMore, true);
  });

  it('a batch that straddles a store page boundary is stitched together', async () => {
    const r = await fetchRange(fakeRetailer({ total: 50, size: 12 }), 'q', 10, 5); // P10..P14 spans pages 0 and 1
    assert.deepEqual(
      r.items.map((i) => i.name),
      ['P10', 'P11', 'P12', 'P13', 'P14'],
    );
    assert.equal(r.next, 15);
  });

  it('stops exactly at the end and says there is no more', async () => {
    const r = await fetchRange(fakeRetailer({ total: 14, size: 12 }), 'q', 10, 12);
    assert.deepEqual(
      r.items.map((i) => i.name),
      ['P10', 'P11', 'P12', 'P13'],
    );
    assert.equal(r.hasMore, false);
    assert.equal(r.next, 14);
  });

  it('works when the store never reports a total (keeps offering more while batches are full)', async () => {
    const r = await fetchRange(fakeRetailer({ total: 30, reportTotal: false }), 'q', 0, 5);
    assert.equal(r.total, null);
    assert.equal(r.hasMore, true);
    const end = await fetchRange(fakeRetailer({ total: 3, reportTotal: false }), 'q', 0, 5);
    assert.equal(end.hasMore, false);
  });

  it('detects a store that serves page 1 again for unknown pages, and explains it', async () => {
    const r = await fetchRange(fakeRetailer({ total: 50, size: 12, repeatPageOne: true }), 'q', 12, 5);
    assert.equal(r.items.length, 0);
    assert.equal(r.hasMore, false);
    assert.match(r.note, /didn't provide further pages/);
  });

  it('explains when a store reports more results than it will actually serve', async () => {
    const r = await fetchRange(fakeRetailer({ total: 50, size: 12, cap: 24 }), 'q', 24, 5);
    assert.equal(r.items.length, 0);
    assert.match(r.note, /reports 50 results but only made 24 available/);
  });

  it('an empty search is simply empty', async () => {
    const r = await fetchRange(fakeRetailer({ total: 0 }), 'q', 0, 12);
    assert.deepEqual([r.items.length, r.total, r.hasMore], [0, 0, false]);
  });
});

describe('buildProduct: nothing is invented', () => {
  const item = { name: 'Plain Thing', url: 'https://x.test/p1', price: 25, was: null, image: null, brand: '' };

  it('with no detail at all, every optional field is null', async () => {
    const p = await buildProduct({ key: 'fake', label: 'Fake', detail: async () => ({}) }, item);
    for (const field of [
      'brand',
      'description',
      'fullDescription',
      'promise',
      'type',
      'gender',
      'ingredientConcept',
      'inStock',
      'sku',
      'size',
      'detailError',
    ]) {
      assert.equal(p[field], null, `${field} should be null`);
    }
    assert.equal(p.price, 25, 'falls back to the listing price');
    assert.equal(p.id, 'fake:https://x.test/p1');
  });

  it('when the product page fails, we keep the listing data and record a friendly error', async () => {
    const failing = {
      key: 'fake',
      label: 'Fake',
      detail: async () => {
        throw Object.assign(new Error('x'), { kind: 'blocked', status: 403 });
      },
    };
    const p = await buildProduct(failing, item);
    assert.equal(p.name, 'Plain Thing');
    assert.equal(p.price, 25);
    assert.match(p.detailError, /Fake is blocking automated requests/);
  });

  it('prefers the live page price, and only shows "was" when it is genuinely higher', async () => {
    const retailer = { key: 'fake', label: 'Fake', detail: async () => ({ livePrice: 20 }) };
    assert.equal((await buildProduct(retailer, { ...item, was: 30 })).was, 30);
    assert.equal((await buildProduct(retailer, { ...item, was: 15 })).was, null);
    assert.equal((await buildProduct(retailer, item)).price, 20);
  });

  it('derives promise, type and ingredient concept only from the retailer text', async () => {
    const retailer = {
      key: 'fake',
      label: 'Fake',
      detail: async () => ({
        desc: 'Description: For oily skin. Contains salicylic acid. Gives 48 hours of protection. Ingredients: AQUA',
      }),
    };
    const p = await buildProduct(retailer, { ...item, name: 'Clear Face Wash 150ml' });
    assert.equal(p.type, 'Face wash');
    assert.equal(p.ingredientConcept, 'Salicylic acid');
    assert.match(p.promise, /48 hours/);
  });
});
