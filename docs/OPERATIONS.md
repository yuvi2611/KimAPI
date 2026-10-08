# Operations

Everything you need to run Kimi day to day: deploy it, change the password, and react when a retailer
blocks us or changes their website.

## Configuration reference

| Variable         | Where to set it                           | Notes                                              |
| ---------------- | ----------------------------------------- | -------------------------------------------------- |
| `APP_USER`       | `.env` locally; **Environment** on Render | Sign-in email (case-insensitive)                   |
| `APP_PASSWORD`   | same                                      | Sign-in password. Use a long, unique one           |
| `SESSION_SECRET` | same (optional)                           | Long random string. Changing it signs everyone out |
| `PORT`           | optional                                  | Render sets this automatically                     |

If `APP_PASSWORD` is unset the app has **no sign-in**. The start-up message tells you which mode you are in:
`Kimi running → http://localhost:3000  [sign-in required]`.

## Running locally

```bash
npm install
npm start          # or double-click start.bat on Windows
```

Stop with `Ctrl + C` (or close the window). Run `npm run dev` to auto-restart while editing server code.

## Hosting on Render (free plan)

The repo includes `render.yaml`, so Render can configure itself.

1. Push the repository to GitHub.
2. Render → **New → Blueprint** → choose the repo.
3. When asked, enter `APP_USER` and `APP_PASSWORD`. These are stored only in Render.
4. Deploy. The URL looks like `https://kimi-xxxx.onrender.com`.

Every `git push` to the main branch redeploys automatically.

**Free-plan behaviour:** the service sleeps after ~15 minutes without traffic; the first visit afterwards takes
30–60 seconds. The health check is `GET /healthz` (always open, returns `ok`).

> **Important:** retailers block cloud data-centre addresses far more readily than home connections. Clicks may
> work from Render while Dis-Chem refuses (or the reverse). If a store is blocked on the host but fine from your own
> computer, the options are: run the app on a machine with a normal connection (see below), or ask the retailer for
> official data access. **Do not add proxy rotation or browser-disguise tricks to get around a block.** It is
> unreliable, it can get the address banned for longer, and it goes against how this project is meant to behave.

### Serving the team from an office PC instead

Run `npm start` on an always-on computer and put a free tunnel in front of it (for example Cloudflare Tunnel or
Tailscale). Requests to the retailers then come from that PC's normal connection, and the team uses the tunnel's URL
and the same sign-in page.

## Changing the password or user

1. Edit `APP_USER` / `APP_PASSWORD` in `.env` (local) and/or Render's **Environment**.
2. Restart / redeploy.
3. Everyone is signed out automatically, because sessions are signed with a key derived from the password
   (unless you set `SESSION_SECRET`, in which case change that too).

## Security notes

- **Credentials are never in the repo.** The repo is public; `.env` is git-ignored. If a credential ever lands in
  a commit, change it immediately. Removing the file later does not remove it from git history.
- Sign-in uses a signed, `HttpOnly`, `SameSite=Lax` cookie (`Secure` over https). Five wrong attempts lock that
  address for 15 minutes. The counter is in memory, so a restart clears it.
- Sessions are stateless: **sign-out cannot revoke a copied cookie early**. Rotate the password to invalidate all.
- The app page is served from `views/` (outside the public folder), so it cannot be fetched without signing in.
- `/api/product` only fetches `https` URLs on a retailer's own host, so it cannot be used to make the server request
  arbitrary addresses.
- Excel cells beginning with `= + - @` are escaped so retailer text can never run as a spreadsheet formula.

### About `npm audit`

`npm audit` may report a **moderate** advisory in `uuid`, a sub-dependency of `exceljs`. It concerns generating IDs
into a caller-supplied buffer, which this app never does. The suggested "fix" downgrades `exceljs` to a much older,
worse version, so it is intentionally **not** applied. Re-check when `exceljs` publishes an update.

## When a retailer blocks us

**What the user sees:** a red notice on that store's tab, "_Clicks is blocking automated requests right now (HTTP
403)…_", with a Try again button. The other store keeps working.

**What the app does:** it stops contacting that store for 3 minutes (the cooldown) so we don't make it worse.
Further attempts during that window show "Paused for another N min" and send no requests.

**What you should do:**

1. Wait. Most blocks clear within minutes to hours, especially if they were caused by a burst of requests.
2. Use smaller batches ("8 at a time") and avoid repeating the same search rapidly.
3. If it persists from the host but not from your own computer, see the hosting note above.
4. For heavy or team use, ask the retailer for a data feed or written permission. That is the only fix that always works.

Tunable values are in `src/config.js` (`fetch.cooldownMs`, `search.concurrency`, `search.maxLimit`).

## When a retailer changes their website

**Symptom:** a store shows _"loaded, but its page layout wasn't recognised. The site may have changed"_, or lots of
fields suddenly become "Not found".

**Fix:** only that retailer's parser needs updating.

1. Open the retailer's search page in a browser and "View source", or save the HTML.
2. Compare with the selectors in `src/retailers/<store>.js` (`parseSearchPage`, `parseProductPage`).
3. Update the selectors, and update the matching generator in `test/helpers/html.js` so the tests describe the
   new markup.
4. `npm run check`, then deploy.

Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## Health and logs

- `GET /healthz` → `ok` (used by Render's health check).
- Logs are written to the console (Render → **Logs**). Unexpected errors are logged as `unhandledRejection:` /
  `uncaughtException:` and the process keeps running.
- There is no database, so there is nothing to back up. The only state is each person's browser preferences.

## Release checklist

1. `npm run check` passes (lint, formatting, all tests).
2. Smoke-test locally: sign in, run a search on both stores, expand a row, export a sheet and open it in Excel.
3. `git push`. Render redeploys.
4. Open the hosted URL, sign in, run one search.
