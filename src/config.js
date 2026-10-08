'use strict';
/**
 * Configuration. Every tunable lives here, read once from the environment.
 * Nothing secret is ever written in code: sign-in details come from APP_USER / APP_PASSWORD.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Load a `.env` file into `env`. Real environment variables always win.
 * Missing file is fine (that is the normal case on a host like Render).
 * @param {string} [file]
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadDotEnv(file = path.join(__dirname, '..', '.env'), env = process.env) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

/**
 * Build the immutable settings object.
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadConfig(env = process.env) {
  const user = (env.APP_USER || '').trim().toLowerCase();
  const password = env.APP_PASSWORD || '';
  const secret =
    env.SESSION_SECRET || crypto.createHash('sha256').update(`kimi-session:${user}:${password}`).digest('hex');

  return Object.freeze({
    port: Number(env.PORT) || 3000,
    /** True behind a reverse proxy (Render), so we see the real client IP and https. */
    trustProxy: Boolean(env.RENDER || env.TRUST_PROXY),

    auth: Object.freeze({
      /** Sign-in is enforced only when a password is configured. */
      enabled: Boolean(password),
      user,
      password,
      secret,
      cookieName: 'kimi_session',
      maxTries: 5,
      lockoutMs: 15 * 60 * 1000,
      shortSessionMs: 12 * 60 * 60 * 1000,
      longSessionMs: 30 * 24 * 60 * 60 * 1000,
      failureDelayMs: 500,
    }),

    /** How we talk to retailers. Kept gentle on purpose. */
    fetch: Object.freeze({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      timeoutMs: 20_000,
      retries: 2,
      /** After a block (403/429) stop contacting that retailer for this long. */
      cooldownMs: 3 * 60 * 1000,
      /** Product pages are cached briefly so Load more and Retry do not hammer retailers. */
      cacheTtlMs: 3 * 60 * 1000,
      cacheMax: 400,
    }),

    search: Object.freeze({ defaultLimit: 12, maxLimit: 40, concurrency: 3, minQuery: 2, maxQuery: 100 }),
    export: Object.freeze({ maxRows: 2000 }),
  });
}

module.exports = { loadDotEnv, loadConfig };
