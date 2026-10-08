'use strict';
/** Small, dependency-free helpers shared across the server. */

/** Collapse whitespace and trim. Safe on null/undefined. */
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/** `clean`, but returns null instead of an empty string (we never invent data). */
const orNull = (s) => clean(s) || null;

/** First number found in a string ("R 1,299.50" -> 1299.5), or null. */
function num(s) {
  const m = (s || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** A plausible shelf price in rand, rounded to cents, or null. */
const validPrice = (p) =>
  typeof p === 'number' && Number.isFinite(p) && p > 0 && p < 100_000 ? Math.round(p * 100) / 100 : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { clean, orNull, num, validPrice, sleep };
