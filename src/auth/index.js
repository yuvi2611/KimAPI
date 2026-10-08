'use strict';
/**
 * Sign-in for a single configured user (APP_USER / APP_PASSWORD). If no password is configured,
 * auth is off and every export here becomes a pass-through, which is convenient for local work.
 *
 *   publicRouter  GET /login, POST /api/login, POST /api/logout   (no session needed)
 *   gate          middleware: everything after it requires a session
 *   me            GET /api/me handler (mount it after `gate`)
 */
const path = require('node:path');
const express = require('express');
const { sleep } = require('../util');
const { createSessions, safeEqual, safeNext } = require('./session');
const { createLockout } = require('./lockout');

/**
 * @param {object} deps
 * @param {import('../types').Config['auth']} deps.config
 * @param {string} deps.viewsDir
 */
function createAuth({ config, viewsDir }) {
  const sessions = createSessions({ secret: config.secret, cookieName: config.cookieName });
  const lockout = createLockout({ max: config.maxTries, windowMs: config.lockoutMs });
  setInterval(lockout.sweep, 60_000).unref();

  /** Reject cross-site POSTs. Browsers send Origin on POST; if present it must be us. */
  const sameOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };

  const publicRouter = express.Router();

  publicRouter.get('/login', (req, res) => {
    if (!config.enabled || sessions.fromRequest(req)) return res.redirect(safeNext(req.query.next));
    res.set('Cache-Control', 'no-store').sendFile(path.join(viewsDir, 'login.html'));
  });

  publicRouter.post('/api/login', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!config.enabled) return res.json({ ok: true, next: '/' });
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Request blocked.' });

    const wait = lockout.lockedFor(req.ip);
    if (wait)
      return res.status(429).set('Retry-After', String(wait)).json({ error: 'Too many attempts.', retryAfter: wait });

    const username = String(req.body?.username || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    // Evaluate both checks every time so timing does not reveal which one was wrong.
    const userOk = !config.user || safeEqual(username, config.user);
    const passOk = safeEqual(password, config.password);

    if (!(userOk && passOk)) {
      await sleep(config.failureDelayMs); // slows down guessing
      const left = lockout.fail(req.ip);
      if (left <= 0) {
        const retryAfter = config.lockoutMs / 1000;
        return res.status(429).set('Retry-After', String(retryAfter)).json({ error: 'Too many attempts.', retryAfter });
      }
      return res.status(401).json({ error: 'Incorrect email or password.', attemptsLeft: left });
    }

    lockout.clear(req.ip);
    const remember = Boolean(req.body?.remember);
    const ttl = remember ? config.longSessionMs : config.shortSessionMs;
    // "Remember me" gets a persistent cookie; otherwise a browser-session cookie.
    sessions.setCookie(
      req,
      res,
      sessions.sign({ u: config.user || username || 'user', exp: Date.now() + ttl }),
      remember ? ttl / 1000 : null,
    );
    res.json({ ok: true, next: safeNext(req.body?.next) });
  });

  publicRouter.post('/api/logout', (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Request blocked.' });
    sessions.setCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  /** Everything mounted after this requires a valid session. */
  function gate(req, res, next) {
    if (!config.enabled) return next();
    const session = sessions.fromRequest(req);
    if (session) {
      req.user = session.u;
      return next();
    }
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in again.', login: true });
    res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }

  const me = (req, res) => res.set('Cache-Control', 'no-store').json({ auth: config.enabled, user: req.user || null });

  return { publicRouter, gate, me };
}

module.exports = { createAuth };
