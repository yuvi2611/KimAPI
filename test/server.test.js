'use strict';
/**
 * Integration test: the real Express app on a random port, talking to a scripted fake network
 * (no internet needed). Covers sign-in, the gate, live search streaming, failure isolation,
 * retry, export, and the security rules.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const h = require('./helpers/html');

const USER = 'tester@example.com';
const PASS = 'correct horse battery';

/** Scripted retailers. `mode.clicks = 'blocked'` makes Clicks answer 403. */
function fakeNetwork() {
  const mode = { clicks: 'ok' };
  const calls = [];
  const dcTiles = [
    { name: 'Mitchum Ultimate 72hour 100ml', url: 'https://www.dischem.co.za/mitchum-110', price: 80.99, was: 89.99 },
    { name: 'Nivea Men Deodorant 150ml', url: 'https://www.dischem.co.za/nivea-005', price: 44.99 },
    { name: 'Dove Roll On 50ml', url: 'https://www.dischem.co.za/dove-777', price: 39.99 },
  ];
  const clTiles = [
    { name: 'English Blazer Deodorant 200ml', brand: 'Yardley', path: '/yardley_blazer/p/220438', prices: 'R 74.99' },
    { name: 'Roll On 50ml', brand: 'Nivea', path: '/nivea_roll/p/100200', prices: 'R 59.99' },
  ];
  const impl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.hostname === 'www.dischem.co.za') {
      if (u.pathname.startsWith('/catalogsearch')) {
        return h.reply(
          Number(u.searchParams.get('p') || 1) === 1
            ? h.dischemSearch({ tiles: dcTiles, total: 3 })
            : h.dischemSearch({ tiles: [], total: 3 }),
        );
      }
      return h.reply(
        h.dischemProduct({
          description: 'Description: Gives 72 hours of protection. For men. Ingredients: AQUA, ZINC',
        }),
      );
    }
    if (u.hostname === 'clicks.co.za') {
      if (mode.clicks === 'blocked') return h.reply('denied', 403);
      return h.reply(u.pathname === '/search' ? h.clicksSearch({ tiles: clTiles }) : h.clicksProduct());
    }
    return h.reply('unknown', 404);
  };
  const clicksCalls = () => calls.filter((c) => c.includes('clicks.co.za')).length;
  return { impl, mode, calls, clicksCalls };
}

async function start(env, net) {
  const base = loadConfig({ TRUST_PROXY: '1', ...env });
  const config = { ...base, auth: { ...base.auth, failureDelayMs: 0 } };
  const server = createApp(config, { fetchImpl: net.impl }).listen(0);
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const stop = (server) => {
  server.closeAllConnections?.();
  return new Promise((r) => server.close(r));
};

const json = (body, extra = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});
const cookieFrom = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

/** Parse a Server-Sent-Events body into [{event, data}]. */
function parseSse(text) {
  return text
    .split('\n\n')
    .map((block) => {
      const event = (block.match(/^event: (.+)$/m) || [])[1];
      const data = (block.match(/^data: (.+)$/m) || [])[1];
      return event ? { event, data: JSON.parse(data) } : null;
    })
    .filter(Boolean);
}

describe('with sign-in switched OFF (local development)', () => {
  let ctx;
  before(async () => (ctx = await start({}, fakeNetwork())));
  after(() => stop(ctx.server));

  it('serves the app directly and reports auth is off', async () => {
    assert.equal((await fetch(`${ctx.url}/`)).status, 200);
    assert.deepEqual(await (await fetch(`${ctx.url}/api/me`)).json(), { auth: false, user: null });
  });

  it('/login simply sends you to the app', async () => {
    const res = await fetch(`${ctx.url}/login`, { redirect: 'manual' });
    assert.equal(res.status, 302);
  });
});

describe('with sign-in ON', () => {
  let ctx;
  let net;
  let cookie;
  before(async () => {
    net = fakeNetwork();
    ctx = await start({ APP_USER: USER, APP_PASSWORD: PASS }, net);
  });
  after(() => stop(ctx.server));

  describe('the gate', () => {
    it('health check and public assets are open', async () => {
      assert.equal((await fetch(`${ctx.url}/healthz`)).status, 200);
      assert.equal((await fetch(`${ctx.url}/login`)).status, 200);
      for (const asset of ['/css/main.css', '/css/tokens.css', '/js/main.js', '/js/login.js']) {
        assert.equal((await fetch(`${ctx.url}${asset}`)).status, 200, asset);
      }
    });

    it('the app page and the API require a session', async () => {
      const home = await fetch(`${ctx.url}/`, { redirect: 'manual' });
      assert.equal(home.status, 302);
      assert.match(home.headers.get('location'), /^\/login\?next=%2F$/);
      for (const api of ['/api/me', '/api/search?q=soap', '/api/product?source=dischem&url=x']) {
        assert.equal((await fetch(`${ctx.url}${api}`)).status, 401, api);
      }
      assert.equal((await fetch(`${ctx.url}/api/export`, json({ products: [] }))).status, 401);
    });

    it('source code, config and views are never served', async () => {
      // not signed in they redirect; the real proof is below, after signing in
      for (const p of ['/.env', '/server.js', '/src/config.js', '/views/app.html', '/package.json']) {
        assert.notEqual((await fetch(`${ctx.url}${p}`, { redirect: 'manual' })).status, 200, p);
      }
    });
  });

  describe('signing in', () => {
    it('rejects a wrong password and says how many tries are left', async () => {
      const res = await fetch(`${ctx.url}/api/login`, json({ username: USER, password: 'wrong' }));
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, 'Incorrect email or password.');
      assert.equal(body.attemptsLeft, 4);
      assert.equal(res.headers.get('set-cookie'), null);
    });

    it('rejects the right password with the wrong email', async () => {
      const res = await fetch(`${ctx.url}/api/login`, json({ username: 'someone@else.com', password: PASS }));
      assert.equal(res.status, 401);
    });

    it('rejects cross-site login attempts', async () => {
      const res = await fetch(
        `${ctx.url}/api/login`,
        json({ username: USER, password: PASS }, { Origin: 'https://evil.example' }),
      );
      assert.equal(res.status, 403);
    });

    it('accepts the right details (email is case-insensitive) and sets an HttpOnly cookie', async () => {
      const res = await fetch(
        `${ctx.url}/api/login`,
        json({ username: ` ${USER.toUpperCase()} `, password: PASS, remember: true, next: '/?q=soap' }),
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, next: '/?q=soap' });
      const header = res.headers.get('set-cookie');
      assert.match(header, /HttpOnly/);
      assert.match(header, /SameSite=Lax/);
      assert.match(header, /Max-Age=\d+/, 'remember-me is a persistent cookie');
      cookie = cookieFrom(res);
    });

    it('will not redirect to another site after login', async () => {
      const res = await fetch(`${ctx.url}/api/login`, json({ username: USER, password: PASS, next: '//evil.com' }));
      assert.equal((await res.json()).next, '/');
    });

    it('serves the app and the session user once signed in', async () => {
      const home = await fetch(`${ctx.url}/`, { headers: { cookie } });
      assert.equal(home.status, 200);
      assert.match(await home.text(), /<title>Kimi/);
      assert.deepEqual(await (await fetch(`${ctx.url}/api/me`, { headers: { cookie } })).json(), {
        auth: true,
        user: USER,
      });
    });

    it('a signed-in user visiting /login is sent to the app', async () => {
      const res = await fetch(`${ctx.url}/login`, { headers: { cookie }, redirect: 'manual' });
      assert.equal(res.headers.get('location'), '/');
    });

    it('refuses forged cookies', async () => {
      const res = await fetch(`${ctx.url}/api/me`, {
        headers: { cookie: 'kimi_session=eyJ1IjoieCIsImV4cCI6OTk5OTk5OTk5OTk5OX0.AAAA' },
      });
      assert.equal(res.status, 401);
    });

    it('while signed in, source files are still not served', async () => {
      for (const p of [
        '/.env',
        '/server.js',
        '/src/config.js',
        '/views/app.html',
        '/package.json',
        '/css/../../.env',
      ]) {
        const res = await fetch(`${ctx.url}${p}`, { headers: { cookie } });
        assert.equal(res.status, 404, p);
      }
    });

    it('signing out clears the cookie', async () => {
      const res = await fetch(`${ctx.url}/api/logout`, json({}, { cookie }));
      assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
    });
  });

  describe('lockout', () => {
    it('locks one address after 5 wrong tries, even for the correct password, but not others', async () => {
      const attempt = (ip, password) =>
        fetch(`${ctx.url}/api/login`, json({ username: USER, password }, { 'X-Forwarded-For': ip }));
      const statuses = [];
      for (let i = 0; i < 6; i++) statuses.push((await attempt('203.0.113.9', 'bad')).status);
      assert.deepEqual(statuses, [401, 401, 401, 401, 429, 429]);

      const locked = await attempt('203.0.113.9', PASS);
      assert.equal(locked.status, 429);
      assert.ok(Number(locked.headers.get('retry-after')) > 0);

      assert.equal((await attempt('198.51.100.7', PASS)).status, 200, 'another address is unaffected');
    });
  });

  describe('live search', () => {
    async function search(query) {
      const res = await fetch(`${ctx.url}/api/search?${new URLSearchParams(query)}`, { headers: { cookie } });
      assert.match(res.headers.get('content-type'), /text\/event-stream/);
      return parseSse(await res.text());
    }
    const signIn = async () => {
      cookie = cookieFrom(
        await fetch(
          `${ctx.url}/api/login`,
          json({ username: USER, password: PASS }, { 'X-Forwarded-For': '192.0.2.50' }),
        ),
      );
    };

    before(signIn);

    it('streams products from both stores, then "done"', async () => {
      const events = await search({ q: 'deodorant', limit: '2', sources: 'dischem,clicks' });
      const products = events.filter((e) => e.event === 'product').map((e) => e.data);
      assert.equal(products.length, 4);
      assert.equal(events.at(-1).event, 'done');

      const dc = events.filter((e) => e.event === 'status' && e.data.source === 'dischem' && e.data.state === 'done')[0]
        .data;
      assert.deepEqual([dc.total, dc.returned, dc.hasMore, dc.next], [3, 2, true, 2]);

      const mitchum = products.find((p) => p.name.startsWith('Mitchum'));
      assert.equal(mitchum.price, 80.99);
      assert.equal(mitchum.was, 89.99);
      assert.equal(mitchum.inStock, 'Yes');
      assert.equal(mitchum.gender, 'Male');
      assert.match(mitchum.promise, /72 hours/);
      assert.equal(mitchum.detailError, null);
    });

    it('"Load more" continues from the offset and reaches the end honestly', async () => {
      const events = await search({
        q: 'deodorant',
        limit: '2',
        sources: 'dischem',
        offsets: JSON.stringify({ dischem: 2 }),
      });
      const names = events.filter((e) => e.event === 'product').map((e) => e.data.name);
      assert.deepEqual(names, ['Dove Roll On 50ml']);
      const done = events.find((e) => e.event === 'status' && e.data.state === 'done').data;
      assert.deepEqual([done.hasMore, done.next, done.total], [false, 3, 3]);
    });

    it('bad input is reported as a friendly "fatal" event', async () => {
      const events = await search({ q: 'a' });
      assert.equal(events[0].event, 'fatal');
      assert.match(events[0].data.message, /at least 2 characters/);
      assert.equal((await search({ q: 'x'.repeat(101) }))[0].event, 'fatal');
      assert.match((await search({ q: 'soap', sources: 'nope' }))[0].data.message, /at least one retailer/);
    });

    it('one store being blocked never breaks the other, and we then stop contacting it', async () => {
      net.mode.clicks = 'blocked';
      const events = await search({ q: 'deodorant', limit: '2', sources: 'dischem,clicks' });
      const clicks = events.find(
        (e) => e.event === 'status' && e.data.source === 'clicks' && e.data.state === 'error',
      ).data;
      assert.equal(clicks.kind, 'blocked');
      assert.match(clicks.message, /Clicks is blocking automated requests/);
      assert.equal(
        events.filter((e) => e.event === 'product' && e.data.source === 'dischem').length,
        2,
        'Dis-Chem still delivered',
      );
      assert.equal(events.at(-1).event, 'done');

      const before = net.clicksCalls();
      const again = await search({ q: 'deodorant', limit: '2', sources: 'clicks' });
      assert.match(again.find((e) => e.data.state === 'error').data.message, /Paused for another/);
      assert.equal(net.clicksCalls(), before, 'during cooldown Clicks receives no requests at all');
      net.mode.clicks = 'ok';
    });
  });

  describe('retry, export and safety rules', () => {
    before(async () => {
      cookie = cookieFrom(
        await fetch(
          `${ctx.url}/api/login`,
          json({ username: USER, password: PASS }, { 'X-Forwarded-For': '192.0.2.51' }),
        ),
      );
    });

    it('retry only accepts product pages on a retailer’s own https host', async () => {
      const get = async (u, source = 'dischem') => {
        const res = await fetch(`${ctx.url}/api/product?${new URLSearchParams({ source, url: u })}`, {
          headers: { cookie },
        });
        return { status: res.status, body: await res.json() };
      };
      assert.equal((await get('https://evil.com/x')).status, 400);
      assert.equal((await get('http://www.dischem.co.za/x')).status, 400, 'http is refused');
      assert.equal((await get('http://169.254.169.254/latest')).status, 400);
      assert.equal((await get('not a url')).status, 400);
      assert.equal(
        (await get('https://www.dischem.co.za/x', 'clicks')).status,
        400,
        'host must match the chosen retailer',
      );

      const ok = await get('https://www.dischem.co.za/mitchum-110');
      assert.equal(ok.status, 200);
      assert.equal(ok.body.retailer, 'Dis-Chem');
      assert.equal(ok.body.brand, 'Mitchum');
    });

    it('exports a real .xlsx file', async () => {
      const res = await fetch(
        `${ctx.url}/api/export`,
        json({ products: [{ name: 'A', retailer: 'Clicks', price: 10 }] }, { cookie }),
      );
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /spreadsheetml/);
      const bytes = Buffer.from(await res.arrayBuffer());
      assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'xlsx files are zip archives');
    });

    it('refuses empty or oversized exports with a clear message', async () => {
      const empty = await fetch(`${ctx.url}/api/export`, json({ products: [] }, { cookie }));
      assert.equal(empty.status, 400);
      assert.match((await empty.json()).error, /Nothing to export/);
      const huge = await fetch(
        `${ctx.url}/api/export`,
        json({ products: Array.from({ length: 2001 }, () => ({ name: 'x' })) }, { cookie }),
      );
      assert.equal(huge.status, 400);
      assert.match((await huge.json()).error, /limit 2000/);
    });

    it('unknown API routes return JSON 404, not an HTML page', async () => {
      const res = await fetch(`${ctx.url}/api/nope`, { headers: { cookie } });
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error, 'Not found.');
    });
  });
});
