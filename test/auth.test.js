'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createSessions, safeEqual, safeNext } = require('../src/auth/session');
const { createLockout } = require('../src/auth/lockout');
const { loadConfig, loadDotEnv } = require('../src/config');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('sessions', () => {
  const clock = { t: 1_000_000 };
  const sessions = createSessions({ secret: 's3cret', cookieName: 'c', now: () => clock.t });

  it('accepts a token it signed', () => {
    const token = sessions.sign({ u: 'a@b.com', exp: clock.t + 1000 });
    assert.equal(sessions.verify(token).u, 'a@b.com');
  });

  it('rejects an expired token', () => {
    const token = sessions.sign({ u: 'a@b.com', exp: clock.t + 1000 });
    clock.t += 2000;
    assert.equal(sessions.verify(token), null);
    clock.t -= 2000;
  });

  it('rejects tampering (changed payload) and tokens signed with another secret', () => {
    const token = sessions.sign({ u: 'a@b.com', exp: clock.t + 1000 });
    const [, sig] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ u: 'admin', exp: clock.t + 99999 })).toString('base64url')}.${sig}`;
    assert.equal(sessions.verify(forged), null);
    const other = createSessions({ secret: 'different', cookieName: 'c', now: () => clock.t });
    assert.equal(sessions.verify(other.sign({ u: 'x', exp: clock.t + 1000 })), null);
  });

  it('rejects garbage without throwing', () => {
    for (const bad of [undefined, null, '', 'abc', '.', 'a.b.c', '%%%.%%%']) assert.equal(sessions.verify(bad), null);
  });

  it('reads its cookie out of a header, among others', () => {
    const token = sessions.sign({ u: 'a@b.com', exp: clock.t + 1000 });
    const req = { headers: { cookie: `theme=dark; c=${token}; other=1` } };
    assert.equal(sessions.fromRequest(req).u, 'a@b.com');
    assert.equal(sessions.fromRequest({ headers: {} }), null);
  });

  it('sets HttpOnly + SameSite cookies, and Secure only over https', () => {
    const headers = [];
    const res = { append: (k, v) => headers.push(v) };
    sessions.setCookie({ secure: false }, res, 'tok', null);
    sessions.setCookie({ secure: true }, res, 'tok', 60);
    assert.match(headers[0], /HttpOnly; SameSite=Lax; Path=\/$/);
    assert.doesNotMatch(headers[0], /Secure/);
    assert.match(headers[1], /Secure; Max-Age=60$/);
  });
});

describe('helpers', () => {
  it('safeEqual compares strings of any length without throwing', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('a', 'a-much-longer-value'), false);
  });

  it('safeNext only allows local paths (no open redirects)', () => {
    assert.equal(safeNext('/?q=soap'), '/?q=soap');
    for (const bad of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '/login',
      '/api/me',
      undefined,
      42,
    ]) {
      assert.equal(safeNext(bad), '/', String(bad));
    }
  });
});

describe('lockout', () => {
  const make = () => {
    const clock = { t: 0 };
    return { clock, lock: createLockout({ max: 5, windowMs: 900_000, now: () => clock.t }) };
  };

  it('counts down remaining tries, then locks', () => {
    const { lock } = make();
    assert.deepEqual(
      [1, 2, 3, 4, 5].map(() => lock.fail('1.1.1.1')),
      [4, 3, 2, 1, 0],
    );
    assert.equal(lock.lockedFor('1.1.1.1'), 900);
  });

  it('is per address: someone else being locked does not lock you', () => {
    const { lock } = make();
    for (let i = 0; i < 5; i++) lock.fail('1.1.1.1');
    assert.equal(lock.lockedFor('2.2.2.2'), 0);
  });

  it('unlocks after the window, and a success clears the count', () => {
    const { lock, clock } = make();
    for (let i = 0; i < 5; i++) lock.fail('a');
    clock.t += 901_000;
    assert.equal(lock.lockedFor('a'), 0);
    lock.fail('b');
    lock.clear('b');
    assert.equal(lock.fail('b'), 4, 'back to a fresh count');
  });

  it('sweep forgets stale entries', () => {
    const { lock, clock } = make();
    lock.fail('a');
    clock.t += 1_000_000;
    lock.sweep();
    assert.equal(lock.fail('a'), 4);
  });
});

describe('config', () => {
  it('turns sign-in on only when a password is set', () => {
    assert.equal(loadConfig({}).auth.enabled, false);
    assert.equal(loadConfig({ APP_PASSWORD: 'x' }).auth.enabled, true);
  });

  it('lower-cases and trims the user, defaults the port, and trusts a proxy on Render', () => {
    const c = loadConfig({ APP_USER: '  Me@X.com ', APP_PASSWORD: 'x', RENDER: 'true', PORT: '8080' });
    assert.equal(c.auth.user, 'me@x.com');
    assert.equal(c.port, 8080);
    assert.equal(c.trustProxy, true);
    assert.equal(loadConfig({}).port, 3000);
  });

  it('the session secret depends on the credentials unless set explicitly', () => {
    const a = loadConfig({ APP_USER: 'u', APP_PASSWORD: 'one' }).auth.secret;
    const b = loadConfig({ APP_USER: 'u', APP_PASSWORD: 'two' }).auth.secret;
    assert.notEqual(a, b);
    assert.equal(loadConfig({ SESSION_SECRET: 'fixed', APP_PASSWORD: 'x' }).auth.secret, 'fixed');
  });

  it('loadDotEnv reads KEY=value lines, strips quotes, and real environment wins', () => {
    const file = path.join(os.tmpdir(), `kimi-env-${process.pid}.env`);
    fs.writeFileSync(file, '# comment\nAPP_USER=from-file@x.com\nAPP_PASSWORD="quoted pw!"\nPORT=9999\n');
    const env = { PORT: '1234' };
    loadDotEnv(file, env);
    fs.unlinkSync(file);
    assert.equal(env.APP_USER, 'from-file@x.com');
    assert.equal(env.APP_PASSWORD, 'quoted pw!');
    assert.equal(env.PORT, '1234');
  });

  it('a missing .env file is not an error', () => {
    assert.doesNotThrow(() => loadDotEnv(path.join(os.tmpdir(), 'definitely-missing.env'), {}));
  });
});
