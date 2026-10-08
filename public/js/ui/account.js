/** Account menu (avatar + Sign out) and the light/dark theme switch. */
import { $ } from '../lib/dom.js';
import { prefs } from '../lib/prefs.js';

export function showUser(email) {
  $('#userMenu').hidden = false;
  $('#meEmail').textContent = email;
  $('#avatarLetter').textContent = email[0].toUpperCase();
}

export function setMenuOpen(open) {
  $('#pop').hidden = !open;
  $('#avatar').setAttribute('aria-expanded', String(open));
}

export const isMenuOpen = () => !$('#pop').hidden;

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  prefs.write({ theme: next });
  $('meta[name=theme-color]').content = next === 'dark' ? '#09090a' : '#ffffff';
}
