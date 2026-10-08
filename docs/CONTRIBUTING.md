# Contributing

How to work on Kimi safely. If you are new, read [ARCHITECTURE.md](ARCHITECTURE.md) first (about 10 minutes).

## Set up

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run dev               # restarts on server changes; refresh the browser for front-end changes
```

Before every commit run **`npm run check`** (lint + format check + tests). Run `npm run format` to auto-fix style.

## Conventions

- **Server:** CommonJS, `'use strict'`, small modules with one job, JSDoc on anything exported.
- **Browser:** native ES modules (no bundler). One concern per file. UI modules _render_; actions _change state_;
  `events.js` _listens_.
- **Never guess data.** If a value is unknown it is `null`; the UI/Excel layer turns that into "Not found".
- **Escape retailer text** with `esc()` before it goes into `innerHTML`.
- **Network and time are injected** (`fetchImpl`, `now`, `sleepImpl`) so tests don't need the internet.
- **Comments explain _why_**, not what. Keep the file header comments up to date when behaviour changes.
- Formatting is automatic (Prettier). Don't hand-format; run `npm run format`.

## Testing

`npm test` uses Node's built-in test runner (no extra libraries). The suite needs **no internet**.

| File                | Covers                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `analysis.test.js`  | Claims, product type, gender, ingredients, text clean-up                                              |
| `retailers.test.js` | Parsing each store's pages; Clicks' exact-total logic                                                 |
| `fetcher.test.js`   | Timeouts, retries, block detection, cooldown, cache                                                   |
| `paging.test.js`    | "Load more" window maths; `buildProduct` never inventing data                                         |
| `workbook.test.js`  | Excel layout, empty manager columns, "Not found", formula-injection guard                             |
| `auth.test.js`      | Sessions, lockout, redirects, config                                                                  |
| `server.test.js`    | The real app end to end against a fake network (sign-in, gate, streaming, failures, export, security) |

`test/helpers/html.js` generates small HTML pages shaped like each retailer's real pages. **When you change a
parser, change the matching generator too.**

Bug fix workflow: write a failing test that reproduces it, fix the code, watch it pass.

## Recipes

### Add a new retailer

1. Create `src/retailers/<store>.js` modelled on `dischem.js`:
   - `parseSearchPage(html)` → `{ items: [{name, url, price, was, image, brand?}], total|null, empty }` (pure)
   - `parseProductPage(html)` → `{ brand, desc, ingredients, livePrice, inStock, sku, size }` (pure)
   - `createStore({ fetcher })` returning `{ key, label, host, page(q, n), detail(item) }`
     - `page(q, n)`: one page (0-based `n`). Return `{ items: [], total: 0 }` for a genuine "no results" page and
       **throw `new FetchError('layout', …)`** when the page is unrecognisable, so the UI reports a site change instead
       of silently showing nothing.
     - Always fetch through `fetcher.get` / `fetcher.getCached`, never `fetch` directly (that gives you timeouts,
       retries and block cooldown for free).
2. Register it in `src/retailers/index.js` (the `list`) and add its label to `RETAILER_LABELS`.
3. Front end: add its key to `ALL_STORES`, `NAMES`, `COLORS` in `public/js/constants.js`; add a `--<key>` colour in
   `public/css/tokens.css`; add a toggle button in `views/app.html` (`.store-toggle[data-store="<key>"]`).
4. Add generators to `test/helpers/html.js` and tests in `test/retailers.test.js`.

### Change or add an Excel column

Everything is in `src/export/workbook.js`. `SHEET_COLUMNS` is the contract with the team's sheet: **order matters
and the manager columns (B, D, I, J, K) must stay empty.** Add the field to `toRow()`, add its key to `DATA_KEYS` if
it should show grey "Not found" styling, and extend `test/workbook.test.js`.

### Teach it a new claim, product type or ingredient

- Claims ("48 hours", "non-greasy"): add a pattern to `CLAIM_PATTERNS` in `src/analysis/claims.js`.
- Product types: add a rule to `TYPE_RULES` in `src/analysis/classify.js` (**first match wins**, so put specific
  rules above general ones).
- Ingredients: add to `KNOWN_INGREDIENTS` in the same file.
- Add a test case in `test/analysis.test.js`. Prefer rules that need explicit words in the text; avoid heuristics that
  guess.

### Add a UI piece

1. Add the markup placeholder to `views/app.html`.
2. Create `public/js/ui/<thing>.js` exporting a `render…()` that reads `state` and writes the DOM (use `setHTML` so it
   only touches the DOM when output changed).
3. Call it from `renderAll()` in `public/js/render.js`.
4. If it needs user input, add a listener in `public/js/events.js` and a function in `public/js/actions/`.
5. Styles go in a matching `public/css/<thing>.css`, imported in `public/css/main.css` (before `responsive.css`).

### Restyle the brand

Colours, fonts and radii are CSS variables at the top of `public/css/tokens.css` (with a dark-theme block beneath).
Change them there; components pick them up automatically.

## Things to avoid

- Don't commit `.env` or any real credential. The repository is public.
- Don't call retailers from anywhere except `src/http/fetcher.js`.
- Don't add anything that disguises requests, rotates addresses, or otherwise evades a retailer's bot protection.
- Don't "fix" missing data by defaulting it (for example, assuming "Unisex"). Show "Not found".
- Don't put business logic in route handlers or in `events.js`.
