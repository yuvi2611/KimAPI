# Kimi · A product of MoTaljaard

Live product search across Clicks and Dis-Chem, with Excel export.

## Run locally
Double-click `start.bat`, or:

    npm install
    npm start

Open http://localhost:3000

## Sign-in
One user, set through environment variables (nothing is stored in the repo):

| Name | Purpose |
|---|---|
| `APP_USER` | The sign-in email |
| `APP_PASSWORD` | The password. If unset, the site has no sign-in (local development) |
| `SESSION_SECRET` | Optional. Any long random string |

Locally: copy `.env.example` to `.env` and fill it in (`.env` is git-ignored).
On Render: add the same names under **Environment**, then redeploy.

Five wrong attempts lock that address out for 15 minutes.

## Notes
Retailer pages are read live. Anything a retailer doesn't state is exported as "Not found".
Retailers may block automated requests, especially from cloud hosts. The app reports this instead of failing silently.
