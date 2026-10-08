'use strict';
/**
 * Stateless signed sessions: the cookie holds `base64url(json).hmac`, so there is nothing to
 * store server-side and sessions survive restarts. Tampering invalidates the signature.
 */
const crypto = require('node:crypto');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** Constant-time string comparison (hashing first makes the lengths equal). */
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));

/**
 * @param {object} opts
 * @param {string} opts.secret
 * @param {string} opts.cookieName
 * @param {() => number} [opts.now]
 */
function createSessions({ secret, cookieName, now = Date.now }) {
  const mac = (body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

  /** @param {{u: string, exp: number}} payload */
  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${mac(body)}`;
  }

  /** @returns {{u: string, exp: number}|null} null when missing, forged or expired */
  function verify(token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = mac(body);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      return payload.exp > now() ? payload : null;
    } catch {
      return null;
    }
  }

  function readCookies(req) {
    return Object.fromEntries(
      (req.headers.cookie || '')
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => {
          const i = c.indexOf('=');
          return [c.slice(0, i), c.slice(i + 1)];
        }),
    );
  }

  /** The signed-in session for a request, or null. */
  const fromRequest = (req) => verify(readCookies(req)[cookieName]);

  /** Set (or with maxAgeSec = 0, clear) the cookie. HttpOnly + SameSite=Lax; Secure over https. */
  function setCookie(req, res, value, maxAgeSec) {
    const parts = [`${cookieName}=${value}`, 'HttpOnly', 'SameSite=Lax', 'Path=/'];
    if (req.secure) parts.push('Secure');
    if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
    res.append('Set-Cookie', parts.join('; '));
  }

  return { sign, verify, fromRequest, setCookie };
}

/** Only same-site relative paths are allowed as a post-login destination (no open redirects). */
const safeNext = (n) =>
  typeof n === 'string' && /^\/(?![/\\])/.test(n) && !n.startsWith('/login') && !n.startsWith('/api/') ? n : '/';

module.exports = { createSessions, safeEqual, safeNext };
