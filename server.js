'use strict';
/**
 * Kimi: entry point. Run with `npm start` (or double-click start.bat).
 * All real logic lives in ./src. See docs/ARCHITECTURE.md for the map.
 */
const { loadDotEnv, loadConfig } = require('./src/config');

loadDotEnv(); // reads .env if present; real environment variables always win
const config = loadConfig();

const { createApp } = require('./src/app');

const app = createApp(config);
const server = app.listen(config.port, () => {
  const mode = config.auth.enabled ? 'sign-in required' : 'NO sign-in (set APP_PASSWORD to enable)';
  console.log(`Kimi running → http://localhost:${config.port}  [${mode}]`);
});

server.on('error', (e) => {
  console.error(
    e.code === 'EADDRINUSE'
      ? `Port ${config.port} is already in use. Close the other Kimi window, or start with PORT=3001.`
      : e,
  );
  process.exit(1);
});

// A bug in one request must never take the whole site down.
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
