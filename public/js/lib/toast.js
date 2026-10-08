import { $ } from './dom.js';

/**
 * Brief message in the corner. Uses textContent, so it is safe for any string.
 * @param {string} message
 * @param {'info'|'ok'|'error'} [type]
 */
export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), type === 'error' ? 7000 : 3800);
  setTimeout(() => el.remove(), 7600);
}
