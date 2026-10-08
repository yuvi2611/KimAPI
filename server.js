const fs = require('fs');
const path = require('path');
/* Load .env if present (never committed). Real environment variables win. */
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch { /* no .env: fine */ }
const express = require('express');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');

const app = express();
app.disable('x-powered-by');

/* =====================================================================
   Sign-in. One user, configured only through environment variables
   (APP_USER, APP_PASSWORD, optional SESSION_SECRET). Nothing is stored in the repo.
   Unset APP_PASSWORD = no sign-in (handy for local development).
   ===================================================================== */
const crypto = require('crypto');
if (process.env.RENDER || process.env.TRUST_PROXY) app.set('trust proxy', 1);   // real client IP + https behind the host's proxy

const APP_USER = (process.env.APP_USER || '').trim().toLowerCase();
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const AUTH_ON = !!APP_PASSWORD;
const COOKIE = 'kimi_session';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update(`kimi-session:${APP_USER}:${APP_PASSWORD}`).digest('hex');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const mac = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
const sign = (payload) => { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${body}.${mac(body)}`; };
function verify(tok) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return null;
  const want = mac(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const readCookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim()).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
const sessionOf = (req) => verify(readCookies(req)[COOKIE]);
const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])/.test(n) && !n.startsWith('/login') && !n.startsWith('/api/') ? n : '/');
const setCookie = (req, res, value, maxAgeSec) => res.append('Set-Cookie', `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/${req.secure ? '; Secure' : ''}${maxAgeSec != null ? `; Max-Age=${maxAgeSec}` : ''}`);

/* Brute-force guard: 5 wrong attempts per address in 15 minutes locks that address for 15 minutes. */
const tries = new Map(), MAX_TRIES = 5, WINDOW_MS = 15 * 60 * 1000;
const lockedFor = (ip) => { const t = tries.get(ip); return t && t.lockedUntil > Date.now() ? Math.ceil((t.lockedUntil - Date.now()) / 1000) : 0; };
function noteFailure(ip) {
  const now = Date.now(); let t = tries.get(ip);
  if (!t || now - t.first > WINDOW_MS) t = { n: 0, first: now, lockedUntil: 0 };
  t.n++; if (t.n >= MAX_TRIES) t.lockedUntil = now + WINDOW_MS;
  tries.set(ip, t); return MAX_TRIES - t.n;
}
setInterval(() => { const now = Date.now(); for (const [ip, t] of tries) if (now - t.first > WINDOW_MS && t.lockedUntil < now) tries.delete(ip); }, 60 * 1000).unref();

app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use(express.json({ limit: '8mb' }));

const PUBLIC_DIR = path.join(__dirname, 'public');
app.get(['/login.js', '/login.css', '/styles.css'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, req.path)));
app.get('/login', (req, res) => {
  if (!AUTH_ON || sessionOf(req)) return res.redirect(safeNext(req.query.next));
  res.set('Cache-Control', 'no-store').sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

const sameOrigin = (req) => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch { return false; } };
app.post('/api/login', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!AUTH_ON) return res.json({ ok: true, next: '/' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Request blocked.' });
  const wait = lockedFor(req.ip);
  if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'Too many attempts.', retryAfter: wait });
  const user = String(req.body?.username || '').trim().toLowerCase(), pass = String(req.body?.password || '');
  const userOk = !APP_USER || safeEq(user, APP_USER), passOk = safeEq(pass, APP_PASSWORD);   // both always evaluated
  if (!(userOk && passOk)) {
    await sleep(500);                                                                        // slows guessing
    const left = noteFailure(req.ip);
    if (left <= 0) return res.status(429).set('Retry-After', String(WINDOW_MS / 1000)).json({ error: 'Too many attempts.', retryAfter: WINDOW_MS / 1000 });
    return res.status(401).json({ error: 'Incorrect email or password.', attemptsLeft: left });
  }
  tries.delete(req.ip);
  const remember = !!req.body?.remember, ttl = remember ? 30 * 24 * 3600 : 12 * 3600;
  setCookie(req, res, sign({ u: APP_USER || user || 'user', exp: Date.now() + ttl * 1000 }), remember ? ttl : null);
  res.json({ ok: true, next: safeNext(req.body?.next) });
});
app.post('/api/logout', (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Request blocked.' });
  setCookie(req, res, '', 0); res.json({ ok: true });
});

/* Everything below this line needs a session. */
app.use((req, res, next) => {
  if (!AUTH_ON) return next();
  const s = sessionOf(req);
  if (s) { req.user = s.u; return next(); }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in again.', login: true });
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
});
app.get('/api/me', (req, res) => res.set('Cache-Control', 'no-store').json({ auth: AUTH_ON, user: req.user || null }));
app.use(express.static(PUBLIC_DIR));



/* =====================================================================
   Helpers
   ===================================================================== */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const num = (s) => { const m = (s || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const validPrice = (p) => (typeof p === 'number' && isFinite(p) && p > 0 && p < 100000 ? Math.round(p * 100) / 100 : null);
const orNull = (s) => { const t = clean(s); return t ? t : null; };

/* Typed errors so the UI can say something useful instead of "failed". */
class FetchError extends Error {
  constructor(kind, message, status) { super(message); this.kind = kind; this.status = status; }
}
// kinds: blocked | timeout | network | http | layout | cooldown

const LABELS = { clicks: 'Clicks', dischem: 'Dis-Chem' };

function friendly(e, label) {
  switch (e.kind) {
    case 'blocked': return `${label} is blocking automated requests right now (HTTP ${e.status || 403}). This is usually temporary. Wait a few minutes and try again.`;
    case 'cooldown': return e.message;
    case 'timeout': return `${label} took too long to respond. Check your connection or try again.`;
    case 'network': return `Couldn't reach ${label}. Check your internet connection.`;
    case 'http': return `${label} returned an error (HTTP ${e.status}). Try again shortly.`;
    case 'layout': return `${label} loaded, but its page layout wasn't recognised. The site may have changed, so the app needs an update.`;
    default: return `Something went wrong reading ${label}.`;
  }
}

/* After a block we stop hitting that retailer for a while, so we don't make it worse. */
const cooldownUntil = {};
const COOLDOWN_MS = 3 * 60 * 1000;
function checkCooldown(key) {
  const left = (cooldownUntil[key] || 0) - Date.now();
  if (left > 0) throw new FetchError('cooldown', `${LABELS[key]} is blocking automated requests. Paused for another ${Math.ceil(left / 60000)} min to avoid making it worse. Other retailers are unaffected.`);
}

const looksBlocked = (html) => /cf-chl|challenge-platform|just a moment|attention required|__CF\$cv\$params/i.test(html) && html.length < 20000;

async function get(url, key, attempt = 0) {
  checkCooldown(key);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-ZA,en;q=0.9', accept: 'text/html,application/xhtml+xml' }, signal: ctrl.signal });
    const body = await r.text();
    if (r.status === 403 || r.status === 429 || looksBlocked(body)) {
      cooldownUntil[key] = Date.now() + COOLDOWN_MS;
      throw new FetchError('blocked', 'blocked', r.status);
    }
    if (r.status >= 500 || r.status === 408) throw new FetchError('http', 'server error', r.status);
    if (!r.ok) throw new FetchError('http', 'http error', r.status);
    return body;
  } catch (e) {
    let err = e;
    if (e.name === 'AbortError') err = new FetchError('timeout', 'timeout');
    else if (!(e instanceof FetchError)) err = new FetchError('network', e.message);
    // retry only transient problems; never retry a block
    if (['timeout', 'network', 'http'].includes(err.kind) && !(err.kind === 'http' && err.status < 500) && attempt < 2) {
      await sleep(600 * (attempt + 1));
      return get(url, key, attempt + 1);
    }
    throw err;
  } finally { clearTimeout(t); }
}

/* Short cache so "Load more" / retries don't hammer the retailer. Search pages are never cached. */
const detailCache = new Map();
const clicksTotals = new Map();
/* Clicks only honours page= when its own q=<term>:relevance parameter is present (0-based pages). */
const clicksUrl = (q, n) => `https://clicks.co.za/search?q=${encodeURIComponent(q + ':relevance')}&text=${encodeURIComponent(q)}&page=${n}&count=12`;
const DETAIL_TTL = 3 * 60 * 1000;
async function getDetailPage(url, key) {
  const hit = detailCache.get(url);
  if (hit && Date.now() - hit.t < DETAIL_TTL) return hit.html;
  const html = await get(url, key);
  if (detailCache.size > 400) detailCache.delete(detailCache.keys().next().value);
  detailCache.set(url, { t: Date.now(), html });
  return html;
}

/* =====================================================================
   Text analysis. Everything here returns null / [] when it can't find
   evidence in the retailer's own text. Nothing is assumed.
   ===================================================================== */
const CLAIMS = [
  /\b\d{1,3}\s?[- ]?(?:hours?|hrs?|h)\b(?:\s+(?:of\s+)?(?:protection|freshness|fragrance|wear|odou?r|control|moisture|hydration|coverage|action))?/gi,
  /\b(?:in\s+)?\d{1,2}\s?[- ]?(?:days?|weeks?)\b|\b\d{1,2}\s?[- ]?(?:days?|weeks?|months?)\s+(?:of\s+)?(?:protection|results?|supply|use)\b/gi,
  /\bSPF\s?\d{1,3}\+?/gi,
  /\b(?:long[- ]lasting|all[- ]day|non[- ]greasy|non[- ]sticky|fast[- ]absorbing|quick[- ]drying|anti[- ](?:perspirant|bacterial|dandruff|ageing|aging)|alcohol[- ]free|aluminium[- ]free|aluminum[- ]free|paraben[- ]free|fragrance[- ]free|sulph?ate[- ]free|cruelty[- ]free|vegan|hypoallergenic|dermatologically (?:tested|approved)|clinically (?:proven|tested)|gentle|sensitive skin|waterproof|water[- ]resistant|moisturi[sz]ing|hydrating|nourishing|soothing|invisible|dust[- ]free|odou?r protection|sweat protection|no (?:white )?marks|stain[- ]free|cooling|refreshing)\b/gi,
  /\b(?:up to\s+)?\d{1,3}\s?%\s+(?:[a-z-]+\s+){0,2}(?:natural|pure|organic|cotton|more|less|reduction)\b/gi,
];
function extractPromise(name, desc) {
  const text = `${name}. ${desc}`.replace(/\s+/g, ' ');
  const seen = new Set(); const out = [];
  for (const re of CLAIMS) {
    for (const m of text.matchAll(re)) {
      let c = clean(m[0]).replace(/^(\d+)\s?-?(?:hours?|hrs?|h)\b/i, (_, n) => `${n} ${+n === 1 ? 'hour' : 'hours'}`).replace(/^(\d+)\s?-?(days?|weeks?|months?)\b/i, '$1 $2');
      if (/^\d+\s?h$/i.test(c) && !/\d\s?h\b/i.test(name)) continue;
      if (/^spf/i.test(c)) c = 'SPF ' + c.replace(/\D/g, '') + (c.includes('+') ? '+' : '');
      const key = c.toLowerCase().replace(/[- +]/g, '');
      if (seen.has(key)) continue;
      seen.add(key); out.push(c.charAt(0).toUpperCase() + c.slice(1));
      if (out.length >= 5) break;
    }
  }
  return out;
}
function claimList(name, desc) {
  const extra = [];
  const both = `${name}. ${desc}`;
  const skin = both.match(/\b(?:normal|dry|oily|combination|sensitive|acne[- ]prone|blemish[- ]prone|mature|all)(?:\s*(?:,|to|and|&|\/|or)\s*(?:normal|dry|oily|combination|sensitive))*\s+skin(?:\s+types)?\b/i);
  if (skin) extra.push(skin[0].charAt(0).toUpperCase() + skin[0].slice(1));
  const benefits = both.match(/\b(?:cleanses?|mattifies|exfoliates?|clears? (?:spots|pimples|blemishes)|reduces? (?:shine|oiliness|pimples|redness|wrinkles|blemishes)|controls? (?:oil|shine|sebum)|unclogs? pores|brightens?|firms?|non[- ]comedogenic)\b/gi) || [];
  const seenB = new Set();
  for (const b of benefits) { const k = b.toLowerCase(); if (!seenB.has(k) && seenB.size < 3) { seenB.add(k); extra.push(b.charAt(0).toUpperCase() + b.slice(1)); } }
  const stem = (x) => x.toLowerCase().replace(/z/g, 's').replace(/(ing|es|s|e)$/, '');
  return [...extra, ...extractPromise(name, desc)].filter((v, i, a) => a.findIndex((x) => stem(x) === stem(v)) === i).slice(0, 6);
}

const tidy = (txt) => clean(txt).replace(/^Description:?\s*/i, '').replace(/Detailed Description:?/i, ' ')
  .replace(/(Pack size|Quantity in pack|Marketing description|Endorsements|Package type)\s*:.*$/i, '')
  .replace(/See more See less/gi, '').replace(/([a-z)])([A-Z][a-z])/g, '$1 $2');
const cut = (t, max) => (t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t);
const summarise = (txt, max = 420) => cut(clean(tidy(txt).split(/\b(?:Ingredients|Directions|Warnings?|How to use|Features)\s*:/i)[0]), max);
const fullDescription = (txt, max = 1800) => cut(clean(tidy(txt).split(/\bIngredients\s*:/i)[0]), max);

const TYPES = [
  [/micellar/i, 'Micellar water'], [/\btoner\b/i, 'Toner'], [/\bserum\b/i, 'Serum'], [/\bsun\s?(?:screen|block|lotion|cream|milk)|\bspf\b/i, 'Sunscreen'],
  [/\beye\b.*\b(?:cream|gel)\b/i, 'Eye care'], [/\b(?:face|facial)\s?mask|\bmask\b/i, 'Face mask'], [/\blip\b/i, 'Lip care'],
  [/\b(?:wash|cleanser|cleansing|foam)\b/i, 'Face wash'], [/\bscrub|exfoliat/i, 'Face scrub'],
  [/\b(?:moisturi[sz]er|lotion|cream)\b/i, 'Moisturiser'],
  [/\bdeodorant|anti-?perspirant|roll[- ]on\b/i, 'Deodorant'], [/\bshampoo\b/i, 'Shampoo'], [/\bconditioner\b/i, 'Conditioner'],
  [/\bsoap\b|body wash|shower/i, 'Body wash'], [/\btoothpaste\b/i, 'Toothpaste'], [/\bperfume|eau de|cologne\b/i, 'Fragrance'],
];
const guessType = (name) => (TYPES.find(([re]) => re.test(name)) || [])[1] || null;
/* Only say something when the retailer's text says it. Otherwise "Not found". */
function findGender(name, desc) {
  const t = `${name} ${desc}`.toLowerCase();
  if (/\bunisex\b|\bfor (?:men and women|women and men|all genders)\b/.test(t)) return 'Unisex';
  const men = /\b(for men|for him|men'?s|pour homme|gentlemen?)\b|\bmale\b(?!\s*pattern)/.test(t) && !/\bfemale\b/.test(t);
  const women = /\b(for women|for her|women'?s|ladies|female|pour femme)\b/.test(t);
  if (men && !women) return 'Male';
  if (women && !men) return 'Female';
  return null;
}
const INGREDIENTS = ['witch hazel', 'ceramides', 'niacinamide', 'hyaluronic acid', 'salicylic acid', 'glycolic acid', 'lactic acid', 'azelaic acid',
  'benzoyl peroxide', 'retinol', 'vitamin c', 'vitamin e', 'vitamin b5', 'panthenol', 'aloe vera', 'tea tree', 'jojoba oil', 'shea butter', 'argan oil',
  'rooibos', 'baobab', 'zinc', 'glycerin', 'collagen', 'peptides', 'squalane', 'centella', 'cica', 'charcoal', 'sulphur', 'thymol', 'coconut oil',
  'green tea', 'rose water', 'oat', 'cocoa butter', 'marula', 'kojic acid', 'licorice', 'caffeine', 'bakuchiol', 'tranexamic acid', 'mandelic acid'];
function ingredientConcept(mainText, ingredientsText) {
  const find = (txt) => INGREDIENTS.filter((i) => new RegExp(`\\b${i}\\b`, 'i').test(txt));
  let hits = find(mainText);
  if (!hits.length) hits = find(ingredientsText || '').slice(0, 3);
  return hits.length ? hits.slice(0, 3).map((h) => h.charAt(0).toUpperCase() + h.slice(1)).join(', ') : null;
}

/* =====================================================================
   Retailers. page(q, n) → { items, total|null }.   detail(item) → fields
   ===================================================================== */
const retailers = {
  dischem: {
    label: 'Dis-Chem',
    host: 'www.dischem.co.za',
    async page(q, n) {
      const url = `https://www.dischem.co.za/catalogsearch/result/?q=${encodeURIComponent(q)}${n ? `&p=${n + 1}` : ''}`;
      const html = await get(url, 'dischem');
      const $ = cheerio.load(html);
      const items = [];
      $('li.product-item').each((_, el) => {
        const li = $(el);
        const a = li.find('a.product-item-link').first();
        const name = clean(a.text()); const href = a.attr('href');
        if (!name || !href) return;
        items.push({
          name, url: href,
          price: validPrice(parseFloat(li.find('[data-price-type="finalPrice"]').first().attr('data-price-amount'))),
          was: validPrice(parseFloat(li.find('[data-price-type="oldPrice"]').first().attr('data-price-amount'))),
          image: li.find('img.product-image-photo').first().attr('src') || null,
        });
      });
      const bar = clean($('.toolbar-amount').first().text());
      const total = parseInt((bar.match(/of\s+([\d,]+)/i) || bar.match(/^([\d,]+)\s+(?:items|results)/i) || [])[1]?.replace(/,/g, ''), 10);
      if (!items.length) {
        if (/returned no results|no results|did not match/i.test($.root().text())) return { items: [], total: 0 };
        if (n > 0) return { items: [], total: isNaN(total) ? null : total };      // ran off the end
        throw new FetchError('layout', 'no products found in page');
      }
      return { items, total: isNaN(total) ? null : total };
    },
    async detail(item) {
      const $ = cheerio.load(await getDetailPage(item.url, 'dischem'));
      let brand = clean($('.product-brand, .brand-name, [itemprop=brand]').first().text());
      let desc = clean($('#description').text());
      let price = null, avail = null;
      $('script[type="application/ld+json"]').each((_, s) => {
        try {
          const j = JSON.parse($(s).html());
          if (j['@type'] === 'Product') {
            if (!brand && j.brand) brand = j.brand.name || '';
            if (j.description && !desc) desc = j.description;
            const o = Array.isArray(j.offers) ? j.offers[0] : j.offers;
            if (o) {
              price = validPrice(parseFloat(o.price));
              if (o.availability) avail = /InStock/i.test(o.availability) ? 'Yes' : /OutOfStock|SoldOut/i.test(o.availability) ? 'No' : null;
            }
          }
        } catch { /* malformed JSON-LD: ignore, fall back to listing data */ }
      });
      const specs = clean($('#product-attribute-specs-table').text());
      return {
        brand, desc, ingredients: (desc.match(/Ingredients\s*:(.*)$/i) || [])[1] || '',
        livePrice: price, inStock: avail,
        sku: specs.match(/SKU\s*(\d+)/)?.[1] || '', size: specs.match(/Pack Size\s*([^\s]+)/)?.[1] || '',
      };
    },
  },

  clicks: {
    label: 'Clicks',
    host: 'clicks.co.za',
    async page(q, n) {
      const url = clicksUrl(q, n);
      const html = await get(url, 'clicks');
      const $ = cheerio.load(html);
      const items = [];
      $('.productBlock').each((_, el) => {
        const b = $(el);
        const href = b.find('.clickfunct_plp a').first().attr('href') || b.find('a').first().attr('href');
        const name = clean(b.find('.product-name p').first().text()) || clean(b.find('.product-name').text());
        if (!href || !name) return;
        const nums = (clean(b.find('.price-wrap').first().text()).match(/R\s?[\d,]+(?:\.\d+)?/g) || []).map(num).filter(Boolean);
        const src = b.find('img').first().attr('src');
        items.push({
          name, brand: clean(b.find('h5').first().text()),
          url: new URL(href, 'https://clicks.co.za').href,
          price: validPrice(nums.length ? Math.min(...nums) : null),
          was: validPrice(nums.length > 1 ? Math.max(...nums) : null),
          image: src ? new URL(src, 'https://clicks.co.za').href : null,
        });
      });
      const text = clean($.root().text());
      /* Clicks prints no total. Its pager has a "Last" link (0-based page number), so the exact
         total = lastPage × pageSize + the number of products on that last page. */
      let total = null;
      if (n === 0 && items.length) {
        const lastHref = $('.pagination a').filter((_, e) => /^\s*Last\s*$/i.test($(e).text())).first().attr('href');
        const lastPage = lastHref ? parseInt((lastHref.match(/[?&]page=(\d+)/) || [])[1], 10) : NaN;
        if (!lastHref && !$('.pagination a').length) total = items.length;                       // single page of results
        else if (lastPage === 0) total = items.length;
        else if (!isNaN(lastPage)) {
          const key = q.toLowerCase(), hit = clicksTotals.get(key);
          if (hit && Date.now() - hit.t < DETAIL_TTL) total = hit.total;
          else {
            try {
              const $l = cheerio.load(await get(clicksUrl(q, lastPage), 'clicks'));
              const onLast = $l('.productBlock').length;
              if (onLast) { total = lastPage * items.length + onLast; clicksTotals.set(key, { t: Date.now(), total }); }
            } catch (e) { if (e.kind === 'blocked') throw e; /* otherwise the total stays unknown rather than guessed */ }
          }
        }
      }
      if (!items.length) {
        if (n > 0) return { items: [], total };
        if ($('#searchProducts, .wishplp').length || /no results|did not match|couldn'?t find|0 results/i.test(text)) return { items: [], total: 0 };
        throw new FetchError('layout', 'no products found in page');
      }
      return { items, total };
    },
    async detail(item) {
      const html = await getDetailPage(item.url, 'clicks');
      const $ = cheerio.load(html);
      const info = $('#information').length ? $('#information') : $('#productTabs');
      const m = clean(info.text());
      const d = m.match(/Description:?(.*?)(?:Ingredients|$)/i);
      const desc = d ? d[1] : '';
      const ingredients = (m.match(/Ingredients:?\s*Ingredients:?(.*?)(?:See more|$)/i) || m.match(/Ingredients:\s*(.*?)(?:See more|$)/i) || [])[1] || '';
      /* Stock: only claim what the page actually shows. */
      let inStock = null;
      $('script[type="application/ld+json"]').each((_, s) => {
        try { const j = JSON.parse($(s).html()); const o = Array.isArray(j.offers) ? j.offers[0] : j.offers;
          if (j['@type'] === 'Product' && o?.availability) inStock = /InStock/i.test(o.availability) ? 'Yes' : /OutOfStock|SoldOut/i.test(o.availability) ? 'No' : null; } catch { /* ignore */ }
      });
      if (inStock === null) {
        const buy = clean($('#addToCartForm, .addtocart_wrap, .product-detail, #addToCartButton').text());
        if (/out of stock|sold out|currently unavailable/i.test(buy)) inStock = 'No';
        else if ($('button.add_to_cart_button, #addToCartButton, [id*="addToCart"] button, button[class*="addtocart" i]').length) inStock = 'Yes';
      }
      return {
        brand: item.brand || '', desc, ingredients, inStock,
        livePrice: validPrice(num(clean($('.price').first().text()))),
        sku: item.url.match(/\/p\/(\d+)/)?.[1] || '', size: '',
      };
    },
  },
};

/* Fetch a window [offset, offset+limit) of results across paginated search pages. */
async function fetchRange(key, q, offset, limit) {
  const r = retailers[key];
  const first = await r.page(q, 0);
  const total = first.total;
  const size = first.items.length || 1;
  const out = [];
  let pg = Math.floor(offset / size), exhausted = false, note = null;
  while (out.length < limit) {
    const pos = offset + out.length;
    if (total != null && pos >= total) { exhausted = true; break; }
    const data = pg === 0 ? first : await r.page(q, pg);
    if (pg > 0 && data.items.length && data.items[0].url === first.items[0].url) {
      exhausted = true; note = `${r.label} didn't provide further pages for this search.`; break;
    }
    const from = pos - pg * size;
    const slice = data.items.slice(from, from + (limit - out.length));
    if (!slice.length) { exhausted = true; if (total != null && pos < total) note = `${r.label} reports ${total} results but only made ${pos} available.`; break; }
    out.push(...slice);
    pg++;
  }
  const next = offset + out.length;
  const hasMore = !exhausted && (total != null ? next < total : out.length >= limit);
  return { items: out, total, next, hasMore, note };
}

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const idx = i++; await fn(list[idx], idx); await sleep(80 + Math.random() * 120); }
  }));
}

/* Build one product record. Fields we can't find are null, never invented. */
async function buildProduct(key, item) {
  const r = retailers[key];
  let d = null, detailError = null;
  try { d = await r.detail(item); } catch (e) { detailError = friendly(e, r.label); }
  d = d || {};
  const raw = d.desc || '';
  const price = validPrice(d.livePrice) ?? item.price ?? null;
  const main = fullDescription(raw, 100000);
  const claims = raw || item.name ? claimList(item.name, raw) : [];
  return {
    id: `${key}:${item.url}`, retailer: r.label, source: key,
    brand: orNull(d.brand || item.brand), name: item.name,
    price, was: item.was && price && item.was > price ? item.was : null,
    description: raw ? orNull(summarise(raw)) : null,
    fullDescription: raw ? orNull(fullDescription(raw)) : null,
    promise: claims.length ? claims.join(' · ') : null,
    type: guessType(item.name),
    gender: findGender(item.name, main),
    ingredientConcept: ingredientConcept(main, d.ingredients),
    inStock: d.inStock ?? null,
    sku: d.sku || null, size: d.size || null,
    image: item.image, url: item.url,
    detailError, fetchedAt: new Date().toISOString(),
  };
}

/* =====================================================================
   API
   ===================================================================== */
function readQuery(raw) {
  const q = clean(String(raw || '').replace(/[\u0000-\u001f<>]/g, ' '));
  if (q.length < 2) return { error: 'Type at least 2 characters to search.' };
  if (q.length > 100) return { error: 'That search is too long. Keep it under 100 characters.' };
  return { q };
}

app.get('/api/search', async (req, res) => {
  const { q, error } = readQuery(req.query.q);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  if (error) { send('fatal', { message: error }); return res.end(); }

  const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 40);
  let offsets = {};
  try { offsets = JSON.parse(req.query.offsets || '{}'); } catch { /* ignore bad offsets */ }
  const sources = String(req.query.sources || 'clicks,dischem').split(',').filter((s) => retailers[s]);
  if (!sources.length) { send('fatal', { message: 'Pick at least one retailer.' }); return res.end(); }

  let closed = false; req.on('close', () => { closed = true; });
  const beat = setInterval(() => !res.writableEnded && res.write(': keep-alive\n\n'), 15000);

  await Promise.all(sources.map(async (key) => {
    const label = retailers[key].label;
    const offset = Math.max(parseInt(offsets[key]) || 0, 0);
    try {
      send('status', { source: key, label, state: 'searching' });
      const range = await fetchRange(key, q, offset, limit);
      if (closed) return;
      send('status', { source: key, label, state: 'found', total: range.total, count: range.items.length });
      let failed = 0;
      await pool(range.items, 3, async (item) => {
        if (closed) return;
        const p = await buildProduct(key, item);
        if (p.detailError) failed++;
        send('product', p);
      });
      send('status', {
        source: key, label, state: 'done', total: range.total, returned: range.items.length,
        next: range.next, hasMore: range.hasMore, note: range.note,
        warning: failed ? `${failed} product${failed > 1 ? 's' : ''} loaded without full details. Use Retry on those cards.` : null,
      });
    } catch (e) {
      send('status', { source: key, label, state: 'error', kind: e.kind || 'unknown', message: friendly(e, label), next: offset, hasMore: false });
    }
  }));
  clearInterval(beat);
  send('done', {});
  res.end();
});

/* Re-fetch one product's details (the "Retry" button). Only retailer hosts are allowed. */
app.get('/api/product', async (req, res) => {
  const key = String(req.query.source || '');
  const r = retailers[key];
  let u;
  try { u = new URL(String(req.query.url || '')); } catch { return res.status(400).json({ error: 'Invalid product link.' }); }
  if (!r || u.protocol !== 'https:' || u.hostname !== r.host) return res.status(400).json({ error: 'That link is not a supported retailer product.' });
  detailCache.delete(u.href);
  try {
    const p = await buildProduct(key, { name: String(req.query.name || 'Product'), url: u.href, price: validPrice(parseFloat(req.query.price)), was: null, image: req.query.image || null, brand: '' });
    res.json(p);
  } catch (e) { res.status(502).json({ error: friendly(e, r.label) }); }
});

/* ------------------------------ Excel export ------------------------------ */
const NF = 'Not found';
const SHEET_COLUMNS = [
  { header: 'Product', key: 'name', width: 38 },
  { header: '', key: 'blank1', width: 4 },
  { header: 'Type', key: 'type', width: 16 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'In stock?', key: 'inStock', width: 11 },
  { header: 'Gender', key: 'gender', width: 11 },
  { header: 'Ingredient concept', key: 'ingredientConcept', width: 28 },
  { header: 'Claim', key: 'claim', width: 38 },
  { header: 'Olfactive descriptor', key: 'olfDesc', width: 20 },
  { header: 'Olfactive Classification', key: 'olfClass', width: 22 },
  { header: 'Pyramid (online)', key: 'pyramid', width: 20 },
  { header: 'Online description', key: 'description', width: 95 },
  { header: 'Price (ZAR)', key: 'price', width: 13 },
  { header: 'Link', key: 'url', width: 18 },
];
/* Stop spreadsheet formula injection from retailer text, and Excel's cell size limit. */
const safeCell = (v) => {
  if (v == null || v === '') return NF;
  let s = String(v).slice(0, 32000);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
};

app.post('/api/export', async (req, res) => {
  const rows = Array.isArray(req.body?.products) ? req.body.products.filter((p) => p && typeof p === 'object' && p.name) : [];
  if (!rows.length) return res.status(400).json({ error: 'Nothing to export. Select at least one product.' });
  if (rows.length > 2000) return res.status(400).json({ error: 'Too many products for one export (limit 2000).' });
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Kimi';
    const groups = {};
    for (const p of rows) (groups[String(p.retailer || 'Products')] ||= []).push(p);

    for (const [retailer, list] of Object.entries(groups)) {
      const ws = wb.addWorksheet(retailer.replace(/[\\/?*[\]:]/g, '').replace('Dis-Chem', 'Dischem').slice(0, 31) || 'Products', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = SHEET_COLUMNS;
      for (const p of list) {
        const name = String(p.name);
        const row = ws.addRow({
          name: safeCell(p.brand && !name.toLowerCase().startsWith(String(p.brand).toLowerCase()) ? `${p.brand} ${name}` : name),
          type: safeCell(p.type),
          inStock: p.inStock || 'Unknown',
          gender: safeCell(p.gender),
          ingredientConcept: safeCell(p.ingredientConcept),
          claim: safeCell((p.promise || '').split(' · ').filter(Boolean).join(', ')),
          description: safeCell(p.fullDescription || p.description),
          price: validPrice(Number(p.price)) ?? NF,
          url: /^https:\/\//.test(p.url || '') ? { text: 'View', hyperlink: p.url } : NF,
        });
        /* Flag missing data in grey italics so a person can see at a glance what needs checking. */
        for (const key of ['type', 'inStock', 'gender', 'ingredientConcept', 'claim', 'description', 'price']) {
          const c = row.getCell(key);
          if (c.value === NF || c.value === 'Unknown') c.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
        }
      }
      const head = ws.getRow(1);
      head.height = 32;
      head.eachCell({ includeEmpty: true }, (c) => {
        c.font = { bold: true, name: 'Arial', size: 10 };
        c.alignment = { vertical: 'bottom', wrapText: true };
        c.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
      });
      ws.eachRow((row, n) => {
        if (n === 1) return;
        row.eachCell({ includeEmpty: true }, (c) => {
          if (!c.font || !c.font.italic) c.font = { name: 'Arial', size: 9 };
          c.alignment = { vertical: 'bottom', wrapText: true };
          c.border = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } };
        });
        if (typeof row.getCell('price').value === 'number') row.getCell('price').numFmt = '"R"#,##0.00';
        if (row.getCell('url').value?.hyperlink) row.getCell('url').font = { name: 'Arial', size: 9, color: { argb: 'FF1155CC' }, underline: true };
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="products-${Date.now()}.xlsx"`,
    });
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error('export failed:', e);
    res.status(500).json({ error: 'Could not build the Excel file. Please try again.' });
  }
});

/* ------------------------------ Safety nets ------------------------------ */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const tooBig = err.type === 'entity.too.large';
  res.status(tooBig ? 413 : err.status || 500).json({ error: tooBig ? 'That export is too large.' : 'Unexpected server error.' });
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Kimi running → http://localhost:${PORT}`));
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Close the other Shelf Scout window, or run with PORT=3001.` : e);
  process.exit(1);
});
