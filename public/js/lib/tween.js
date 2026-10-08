export const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Count a number up (or down) inside an element. Respects reduced-motion.
 * Uses a timer rather than requestAnimationFrame so it still finishes in background tabs.
 * @param {HTMLElement & {_v?: number, _t?: number}} el
 * @param {number} to
 * @param {(n: number) => string} format
 */
export function tween(el, to, format) {
  const from = el._v ?? 0;
  el._v = to;
  clearInterval(el._t);
  if (prefersReducedMotion || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  el._t = setInterval(() => {
    const k = Math.min(1, (performance.now() - start) / 480);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = format(from + (to - from) * eased);
    if (k >= 1) clearInterval(el._t);
  }, 30);
}
