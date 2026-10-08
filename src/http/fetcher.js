'use strict';
const { FetchError } = require('../errors');
const { sleep } = require('../util');

/** Cloudflare-style challenge pages are small and contain these markers. */
const looksBlocked = (html) =>
  /cf-chl|challenge-platform|just a moment|attention required|__CF\$cv\$params/i.test(html) && html.length < 20_000;

/**
 * The only place that talks to retailers over HTTP.
 *
 * Responsibilities: timeouts, retry of *transient* failures, block detection with a
 * per-retailer cooldown (so we stop making a block worse), and a short page cache.
 * Everything time- or network-related is injectable so it can be tested without the internet.
 *
 * @param {object}   deps
 * @param {import('../config').Config['fetch']} deps.options
 * @param {(key: string) => string} deps.labelFor  retailer key -> display name
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @param {(ms: number) => Promise<void>} [deps.sleepImpl]
 */
function createFetcher({ options, labelFor, fetchImpl = fetch, now = Date.now, sleepImpl = sleep }) {
  /** retailer key -> timestamp until which we will not contact it */
  const cooldownUntil = new Map();
  /** url -> { t, html } */
  const cache = new Map();

  function checkCooldown(key) {
    const left = (cooldownUntil.get(key) || 0) - now();
    if (left > 0) {
      throw new FetchError(
        'cooldown',
        `${labelFor(key)} is blocking automated requests. Paused for another ${Math.ceil(left / 60000)} min to avoid making it worse. Other retailers are unaffected.`,
      );
    }
  }

  /** GET a page as text. Throws FetchError. */
  async function get(url, key, attempt = 0) {
    checkCooldown(key);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options.timeoutMs);
    try {
      const res = await fetchImpl(url, {
        headers: {
          'user-agent': options.userAgent,
          'accept-language': 'en-ZA,en;q=0.9',
          accept: 'text/html,application/xhtml+xml',
        },
        signal: ctrl.signal,
      });
      const body = await res.text();
      if (res.status === 403 || res.status === 429 || looksBlocked(body)) {
        cooldownUntil.set(key, now() + options.cooldownMs);
        throw new FetchError('blocked', 'blocked', res.status);
      }
      if (res.status >= 500 || res.status === 408) throw new FetchError('http', 'server error', res.status);
      if (!res.ok) throw new FetchError('http', 'http error', res.status);
      return body;
    } catch (e) {
      let err = e;
      if (e.name === 'AbortError') err = new FetchError('timeout', 'timeout');
      else if (!(e instanceof FetchError)) err = new FetchError('network', e.message);

      // Retry only transient problems. Never retry a block, and never retry a 4xx.
      const transient = ['timeout', 'network'].includes(err.kind) || (err.kind === 'http' && err.status >= 500);
      if (transient && attempt < options.retries) {
        await sleepImpl(600 * (attempt + 1));
        return get(url, key, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Like `get`, but remembers the page briefly. Use for product pages, never for search pages. */
  async function getCached(url, key) {
    const hit = cache.get(url);
    if (hit && now() - hit.t < options.cacheTtlMs) return hit.html;
    const html = await get(url, key);
    if (cache.size >= options.cacheMax) cache.delete(cache.keys().next().value);
    cache.set(url, { t: now(), html });
    return html;
  }

  /** Drop a cached page (used by the Retry button so it really re-fetches). */
  const forget = (url) => cache.delete(url);

  return { get, getCached, forget };
}

module.exports = { createFetcher, looksBlocked };
