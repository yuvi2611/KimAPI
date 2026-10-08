'use strict';
const { sleep } = require('../util');

/**
 * Run `fn` over `list` with at most `size` in flight, pausing briefly between items.
 * The pause is deliberate: it keeps our request rate polite so retailers do not block us.
 * @template T
 * @param {T[]} list
 * @param {number} size
 * @param {(item: T, index: number) => Promise<void>} fn
 */
async function pool(list, size, fn) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const index = next++;
      await fn(list[index], index);
      await sleep(80 + Math.random() * 120);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, worker));
}

module.exports = { pool };
