# Kimi · A product of MoTaljaard

Search **Clicks** and **Dis-Chem** at once, compare live prices and product promises, and export a tidy Excel sheet.

> **The one rule of this codebase:** nothing is guessed. If a retailer does not state something, the app shows
> **"Not found"** instead of filling a blank. See [Principles](#principles).

## Quick start

You need [Node.js 22+](https://nodejs.org). Then, in this folder:

```bash
npm install
cp .env.example .env     # then edit .env: set APP_USER and APP_PASSWORD (Windows: copy .env.example .env)
npm start
```

Open <http://localhost:3000>. On Windows you can also just double-click **`start.bat`**.

Leave `APP_PASSWORD` empty and the app runs without a sign-in page (handy while developing).

## What it does

- Live search across both stores with results streaming in as they load
- Honest paging: "12 of 538 loaded", with a Load more button per store
- Price insights, a price-spread chart, list and gallery views, filters, sort
- One-click Excel export in the team's sheet layout (manager columns left empty)
- Sign-in page for one user, with brute-force lockout
- Light and dark themes, keyboard shortcuts (`/` to search, `Esc` to close), phone layout

## Everyday commands

| Command          | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `npm start`      | Run the app                                                    |
| `npm run dev`    | Run and restart automatically when server files change         |
| `npm test`       | Run all automated tests (no internet needed)                   |
| `npm run lint`   | Check code quality (ESLint)                                    |
| `npm run format` | Auto-format every file (Prettier)                              |
| `npm run check`  | Lint + format check + tests. **Run this before every commit.** |

## Configuration

Set in a `.env` file locally, or under **Environment** on the host. Real environment variables win over `.env`.

| Name             | Required | Meaning                                                              |
| ---------------- | -------- | -------------------------------------------------------------------- |
| `APP_USER`       | with pwd | The sign-in email                                                    |
| `APP_PASSWORD`   | no       | The password. **Unset = no sign-in.** Always set it on a public host |
| `SESSION_SECRET` | no       | Any long random string. Defaults to a value derived from the above   |
| `PORT`           | no       | Defaults to 3000                                                     |

`.env` is git-ignored. **Never commit real credentials.** This repository is public.

## Where things live

```
server.js            Entry point (tiny). Loads config, starts the app.
src/                 The server
  config.js            All settings, read once from the environment
  app.js               Builds the Express app. The request order here IS the security model
  auth/                Sign-in: signed-cookie sessions, lockout, login routes
  http/fetcher.js      The only code that talks to retailers: timeouts, retries, block cooldown, cache
  retailers/           One file per store (parsing) + a registry. Add a store here
  analysis/            Pure text rules: promises/claims, product type, gender, ingredients
  products/            Turning a listing into a Product; paging; concurrency
  export/workbook.js   Builds the .xlsx (the team's sheet layout)
  routes/              HTTP endpoints: search (streaming), product (retry), export
public/              Static files the browser loads (no build step)
  css/                 One file per component; main.css imports them in order
  js/                  Native ES modules: state, render, actions, events, ui/*, api/*, lib/*
views/               HTML pages served by the server (the app page is behind sign-in)
test/                Automated tests (Node's built-in runner) + HTML generators
docs/                Architecture, operations, contributing
render.yaml          One-click hosting blueprint for Render
```

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**: how a search flows through the system, the data model, design decisions
- **[docs/OPERATIONS.md](docs/OPERATIONS.md)**: deploying, changing the password, what to do when a retailer blocks or changes
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)**: how to add a store, a column, a claim; coding conventions; testing

## Principles

1. **Nothing is guessed.** Unknown is `null` in code and "Not found" on screen and in Excel.
2. **One store failing never breaks another.** Every failure is caught, classified, and explained in plain English.
3. **Be a polite visitor.** Small batches, short pauses, a cool-down after any block, and no attempt to evade a retailer's bot protection.
4. **Secrets live in the environment**, never in the repository.
5. **No build step.** Plain Node on the server and native ES modules in the browser, so anyone can read and change it.

## Troubleshooting

| Symptom                                      | Likely cause and fix                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| "Port 3000 is already in use"                | Another Kimi window is open. Close it, or run with `PORT=3001`                       |
| A store shows "blocking automated requests"  | The retailer blocked us. Wait a few minutes; see docs/OPERATIONS.md                  |
| A store says "page layout wasn't recognised" | The retailer redesigned their site; a parser needs updating (docs/CONTRIBUTING.md)   |
| Locked out of sign-in                        | 5 wrong tries lock that address for 15 minutes. Restarting the server also clears it |
