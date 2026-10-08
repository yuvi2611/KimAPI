/**
 * Batched re-rendering. Many events can arrive in a burst (a product every few hundred ms),
 * so instead of rendering on each one we coalesce them into one render ~30ms later.
 *
 * Kept in its own tiny module so UI modules can call `schedule()` without importing render.js
 * (which imports them), avoiding a circular dependency. main.js registers the renderer.
 */
let render = () => {};
let timer = 0;

export const setRenderer = (fn) => {
  render = fn;
};

export function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = 0;
    render();
  }, 30);
}
