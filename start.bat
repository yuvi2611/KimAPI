@echo off
rem Starts Kimi on this computer and opens it in your browser.
rem Keep this window open while you use Kimi. Close it (or press Ctrl+C) to stop.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies, this takes a minute...
  call npm install --omit=dev
)

if not exist .env (
  echo.
  echo Note: no .env file found, so sign-in is OFF.
  echo To turn it on, copy .env.example to .env and set APP_USER and APP_PASSWORD.
  echo.
)

start "" http://localhost:3000
node server.js
pause
