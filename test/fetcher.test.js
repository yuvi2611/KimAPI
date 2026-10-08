'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createFetcher, looksBlocked } = require('../src/http/fetcher');
const { friendlyMessage } = require('../src/errors');
const { reply } = require('./helpers/html');

const options = { userAgent: 'test', timeoutMs: 200, retries: 2, cooldownMs: 180_000, cacheTtlMs: 1000, cacheMax: 2 };

/** A fetcher whose clock and sleeping we control, and whose network we script. */
function setup(responses) {
  const calls = [];
  const clock = { t: 1_000_000 };
  const queue = [...responses];
  const fetchImpl = async (url) => {
    calls.push(url);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return next.clone(); // a Response body can only be read once, so hand out a copy each time
  };
  const fetcher = createFetcher({
    options,
    labelFor: () => 'Shop',
    fetchImpl,
    now: () => clock.t,
    sleepImpl: async () => {},
  });
  return { fetcher, calls, clock };
}

describe('fetcher: blocks', () => {
  it('detects a 403, reports "blocked", and then pauses that retailer (cooldown)', async () => {
    const { fetcher, calls } = setup([reply('denied', 403)]);
    await assert.rejects(fetcher.get('https://shop.test/a', 'shop'), (e) => e.kind === 'blocked' && e.status === 403);
    assert.equal(calls.length, 1, 'a block is never retried');

    await assert.rejects(fetcher.get('https://shop.test/b', 'shop'), (e) => e.kind === 'cooldown');
    assert.equal(calls.length, 1, 'during cooldown we do not touch the retailer at all');
  });

  it('resumes after the cooldown has passed', async () => {
    const { fetcher, clock } = setup([reply('denied', 403), reply('<html>ok</html>')]);
    await assert.rejects(fetcher.get('https://shop.test/a', 'shop'));
    clock.t += 181_000;
    assert.equal(await fetcher.get('https://shop.test/a', 'shop'), '<html>ok</html>');
  });

  it('cooldown on one retailer does not affect another', async () => {
    const { fetcher } = setup([reply('denied', 403), reply('fine')]);
    await assert.rejects(fetcher.get('https://a.test/', 'a'));
    assert.equal(await fetcher.get('https://b.test/', 'b'), 'fine');
  });

  it('recognises a small challenge page even when the status is 200', () => {
    assert.equal(looksBlocked('<html><title>Just a moment...</title></html>'), true);
    assert.equal(
      looksBlocked(`<html>${'x'.repeat(30_000)} just a moment </html>`),
      false,
      'big real pages are not challenges',
    );
  });
});

describe('fetcher: retries', () => {
  it('retries a server error and then succeeds', async () => {
    const { fetcher, calls } = setup([reply('oops', 503), reply('<html>fine</html>')]);
    assert.equal(await fetcher.get('https://shop.test/a', 'shop'), '<html>fine</html>');
    assert.equal(calls.length, 2);
  });

  it('gives up after the configured retries', async () => {
    const { fetcher, calls } = setup([reply('oops', 500)]);
    await assert.rejects(fetcher.get('https://shop.test/a', 'shop'), (e) => e.kind === 'http' && e.status === 500);
    assert.equal(calls.length, 3, '1 try + 2 retries');
  });

  it('does not retry a 404 (retrying cannot help)', async () => {
    const { fetcher, calls } = setup([reply('nope', 404)]);
    await assert.rejects(fetcher.get('https://shop.test/a', 'shop'), (e) => e.kind === 'http' && e.status === 404);
    assert.equal(calls.length, 1);
  });

  it('retries a dropped connection, then reports a network error', async () => {
    const { fetcher, calls } = setup([new Error('ECONNRESET')]);
    await assert.rejects(fetcher.get('https://shop.test/a', 'shop'), (e) => e.kind === 'network');
    assert.equal(calls.length, 3);
  });

  it('reports a timeout when the retailer is too slow', async () => {
    const slow = () => new Promise(() => {}); // never resolves; relies on the abort signal
    const fetchImpl = (url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
      );
    const fetcher = createFetcher({
      options: { ...options, retries: 0, timeoutMs: 30 },
      labelFor: () => 'Shop',
      fetchImpl,
      sleepImpl: async () => {},
    });
    await assert.rejects(fetcher.get('https://shop.test/slow', 'shop'), (e) => e.kind === 'timeout');
    void slow;
  });
});

describe('fetcher: cache', () => {
  it('serves a product page from cache within the TTL, then refreshes', async () => {
    const { fetcher, calls, clock } = setup([reply('v1'), reply('v2')]);
    assert.equal(await fetcher.getCached('https://shop.test/p', 'shop'), 'v1');
    assert.equal(await fetcher.getCached('https://shop.test/p', 'shop'), 'v1');
    assert.equal(calls.length, 1);
    clock.t += 1500;
    assert.equal(await fetcher.getCached('https://shop.test/p', 'shop'), 'v2');
  });

  it('forget() makes Retry a real re-fetch', async () => {
    const { fetcher, calls } = setup([reply('v1'), reply('v2')]);
    await fetcher.getCached('https://shop.test/p', 'shop');
    fetcher.forget('https://shop.test/p');
    assert.equal(await fetcher.getCached('https://shop.test/p', 'shop'), 'v2');
    assert.equal(calls.length, 2);
  });

  it('never grows beyond cacheMax', async () => {
    const { fetcher, calls } = setup([reply('x')]);
    for (const p of ['a', 'b', 'c']) await fetcher.getCached(`https://shop.test/${p}`, 'shop');
    await fetcher.getCached('https://shop.test/a', 'shop'); // evicted, so fetched again
    assert.equal(calls.length, 4);
  });
});

describe('friendly messages', () => {
  it('give plain-English explanations per failure kind', () => {
    assert.match(friendlyMessage({ kind: 'blocked', status: 403 }, 'Clicks'), /Clicks is blocking automated requests/);
    assert.match(friendlyMessage({ kind: 'timeout' }, 'Clicks'), /too long/);
    assert.match(friendlyMessage({ kind: 'network' }, 'Clicks'), /Couldn't reach Clicks/);
    assert.match(friendlyMessage({ kind: 'http', status: 502 }, 'Clicks'), /HTTP 502/);
    assert.match(friendlyMessage({ kind: 'layout' }, 'Clicks'), /needs an update/);
    assert.match(friendlyMessage({}, 'Clicks'), /Something went wrong/);
  });
});
