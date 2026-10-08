export const $ = (selector, root = document) => root.querySelector(selector);

const lastHtml = new WeakMap();

/** Set innerHTML only when it changed. Keeps focus, scroll and animations intact between renders. */
export function setHTML(el, html) {
  if (lastHtml.get(el) !== html) {
    el.innerHTML = html;
    lastHtml.set(el, html);
  }
}
