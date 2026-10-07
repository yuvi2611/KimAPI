# Kimi · A product of MoTaljaard

Live product search across Clicks and Dis-Chem, with Excel export.

## Run locally
Double-click `start.bat`, or:

    npm install
    npm start

Open http://localhost:3000

## Settings
- `APP_PASSWORD` (optional): when set, the site asks for this password (any username). Leave unset for local use.
- `PORT` (optional): defaults to 3000.

## Notes
Retailer pages are read live. Anything a retailer doesn't state is exported as "Not found".
Retailers may block automated requests, especially from cloud hosts. The app reports this instead of failing silently.
