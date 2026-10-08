'use strict';

/**
 * Brute-force guard. After `max` failed sign-ins from one address within `windowMs`,
 * that address is locked out for `windowMs`. Per address (not global), so one attacker
 * cannot lock the real user out from a different connection.
 *
 * @param {object} opts
 * @param {number} opts.max
 * @param {number} opts.windowMs
 * @param {() => number} [opts.now]
 */
function createLockout({ max, windowMs, now = Date.now }) {
  /** ip -> { n, first, lockedUntil } */
  const attempts = new Map();

  /** Seconds remaining if locked, else 0. */
  function lockedFor(ip) {
    const t = attempts.get(ip);
    return t && t.lockedUntil > now() ? Math.ceil((t.lockedUntil - now()) / 1000) : 0;
  }

  /** Record a failure. Returns how many tries remain before lockout (0 = now locked). */
  function fail(ip) {
    const t0 = now();
    let t = attempts.get(ip);
    if (!t || t0 - t.first > windowMs) t = { n: 0, first: t0, lockedUntil: 0 };
    t.n++;
    if (t.n >= max) t.lockedUntil = t0 + windowMs;
    attempts.set(ip, t);
    return Math.max(0, max - t.n);
  }

  const clear = (ip) => attempts.delete(ip);

  /** Forget stale records. Call periodically so the map cannot grow without bound. */
  function sweep() {
    const t0 = now();
    for (const [ip, t] of attempts) if (t0 - t.first > windowMs && t.lockedUntil < t0) attempts.delete(ip);
  }

  return { lockedFor, fail, clear, sweep };
}

module.exports = { createLockout };
