/* Kimi sign-in. Plain JS, no dependencies. */
(() => {
  const $ = (s) => document.querySelector(s);
  const form = $('#login'), user = $('#u'), pass = $('#p'), btn = $('#submit'), msg = $('#formMsg'), card = $('#card');
  const next = (() => { const n = new URLSearchParams(location.search).get('next'); return n && /^\/(?![/\\])/.test(n) ? n : '/'; })();

  /* ---- tiny helpers (storage is optional; the page must work without it) ---- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- theme toggle (shares the setting with the app) ---- */
  $('#theme').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    let p = {}; try { p = JSON.parse(store.get('kimi.prefs') || '{}'); } catch { /* ignore */ }
    store.set('kimi.prefs', JSON.stringify({ ...p, theme: t }));
    $('meta[name=theme-color]').content = t === 'dark' ? '#09090a' : '#ffffff';
  });

  /* ---- show / hide password ---- */
  const eye = $('#eye');
  eye.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    pass.focus({ preventScroll: true });
  });

  /* ---- caps lock hint ---- */
  const caps = $('#caps');
  const checkCaps = (e) => { if (e.getModifierState) caps.hidden = !e.getModifierState('CapsLock'); };
  pass.addEventListener('keydown', checkCaps); pass.addEventListener('keyup', checkCaps);
  pass.addEventListener('blur', () => { caps.hidden = true; });

  /* ---- validation ---- */
  const setErr = (field, text) => {
    const f = $(field), p = f.querySelector('.field-err');
    f.classList.toggle('invalid', !!text); p.textContent = text || '';
    f.querySelector('input').setAttribute('aria-invalid', String(!!text));
  };
  const checkUser = () => {
    const v = user.value.trim();
    const t = !v ? 'Enter your email address.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'That doesn’t look like an email address.' : '';
    setErr('#fUser', t); return !t;
  };
  const checkPass = () => { const t = pass.value ? '' : 'Enter your password.'; setErr('#fPass', t); return !t; };
  user.addEventListener('blur', () => { if (user.value) checkUser(); });
  user.addEventListener('input', () => { if ($('#fUser').classList.contains('invalid')) checkUser(); hideMsg(); });
  pass.addEventListener('input', () => { if ($('#fPass').classList.contains('invalid')) checkPass(); hideMsg(); });

  /* ---- messages ---- */
  const showMsg = (html, info = false) => { msg.className = 'form-msg' + (info ? ' info' : ''); msg.innerHTML = html; msg.hidden = false; };
  const hideMsg = () => { if (!lockTimer) msg.hidden = true; };
  const shake = () => { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); };

  /* ---- lockout countdown ---- */
  let lockTimer = null;
  function lock(seconds) {
    clearInterval(lockTimer);
    const end = Date.now() + seconds * 1000;
    btn.classList.add('locked'); btn.disabled = true;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (!left) { clearInterval(lockTimer); lockTimer = null; btn.classList.remove('locked'); btn.disabled = false; msg.hidden = true; return; }
      const m = Math.floor(left / 60), s = String(left % 60).padStart(2, '0');
      showMsg(`<span><b>Too many attempts.</b> For your security, sign-in is paused. You can try again in <b>${m}:${s}</b>.</span>`);
    };
    tick(); lockTimer = setInterval(tick, 1000);
  }

  /* ---- submit ---- */
  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || lockTimer) return;
    const okU = checkUser(), okP = checkPass();
    if (!okU || !okP) { shake(); (okU ? pass : user).focus(); return; }
    if (!navigator.onLine) { showMsg('You’re offline. Check your connection and try again.'); return; }

    busy = true; btn.disabled = true; btn.classList.add('loading'); msg.hidden = true;
    try {
      const r = await fetch('/api/login', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.value.trim(), password: pass.value, remember: $('#remember').checked, next }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        store.set('kimi.lastUser', user.value.trim());
        btn.classList.remove('loading'); btn.classList.add('ok');
        setTimeout(() => location.replace(j.next || next), 650);
        return;
      }
      btn.classList.remove('loading'); btn.disabled = false; busy = false;
      pass.value = '';
      if (r.status === 429) { lock(j.retryAfter || 900); shake(); return; }
      shake();
      const left = j.attemptsLeft;
      showMsg(`<span><b>${esc(j.error || 'Couldn’t sign you in.')}</b>${left != null && left <= 3 ? ` ${left} attempt${left === 1 ? '' : 's'} left before sign-in is paused.` : ' Check your details and try again.'}</span>`);
      pass.focus();
    } catch {
      btn.classList.remove('loading'); btn.disabled = false; busy = false;
      showMsg('We couldn’t reach the server. Check your connection and try again.');
    }
  });

  /* ---- initial state ---- */
  const last = store.get('kimi.lastUser');
  if (last) { user.value = last; pass.focus({ preventScroll: true }); } else user.focus({ preventScroll: true });
  if (new URLSearchParams(location.search).has('next')) showMsg('Please sign in to continue.', true);
})();
