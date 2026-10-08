'use strict';
/**
 * Builds the Express app. No listening happens here, so tests can start it on any port.
 *
 * Request order matters and is the whole security model:
 *
 *   1. /healthz                      open (the host's health check)
 *   2. static assets (/css /js /img) open. They are public code, not secrets
 *   3. /login, /api/login, /logout   open
 *   ---- auth.gate: everything below needs a signed-in session ----
 *   4. GET /                         the app page (kept out of /public on purpose)
 *   5. /api/me /api/search /api/product /api/export
 */
const path = require('node:path');
const express = require('express');
const { createFetcher } = require('./http/fetcher');
const { createRetailers, RETAILER_LABELS } = require('./retailers');
const { createAuth } = require('./auth');
const { createSearchRouter } = require('./routes/search');
const { createProductRouter } = require('./routes/product');
const { createExportRouter } = require('./routes/export');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const VIEWS_DIR = path.join(ROOT, 'views');

/**
 * @param {import('./types').Config} config
 * @param {{ fetchImpl?: typeof fetch }} [overrides]  tests inject a fake `fetch`
 */
function createApp(config, overrides = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1); // real client IP + https behind Render's proxy

  const fetcher = createFetcher({
    options: config.fetch,
    labelFor: (key) => RETAILER_LABELS[key] || key,
    fetchImpl: overrides.fetchImpl,
  });
  const retailers = createRetailers({ fetcher, config });
  const auth = createAuth({ config: config.auth, viewsDir: VIEWS_DIR });

  app.get('/healthz', (req, res) => res.type('text').send('ok'));
  app.use(express.json({ limit: '8mb' }));
  app.use(express.static(PUBLIC_DIR, { index: false }));
  app.use(auth.publicRouter);

  app.use(auth.gate);
  app.get('/', (req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(VIEWS_DIR, 'app.html')));

  const api = express.Router();
  api.get('/me', auth.me);
  api.use(createSearchRouter({ retailers, search: config.search }));
  api.use(createProductRouter({ retailers, fetcher }));
  api.use(createExportRouter(config.export));
  app.use('/api', api);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const tooBig = err.type === 'entity.too.large';
    res
      .status(tooBig ? 413 : err.status || 500)
      .json({ error: tooBig ? 'That export is too large.' : 'Unexpected server error.' });
  });

  return app;
}

module.exports = { createApp };
