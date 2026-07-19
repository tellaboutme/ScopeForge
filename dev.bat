@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Node.js was not found on PATH.
    echo         Install Node.js 20+ from https://nodejs.org, then re-run this file.
    echo.
    pause
    exit /b 1
)

echo ScopeForge — starting API + Web in debug mode
echo scripts\dev.mjs will check dependencies, .env, DATABASE_URL, AI_API_KEY,
echo and optional CAPTCHA/email settings first, and install/repair anything
echo missing before starting the servers.
echo.

node scripts\dev.mjs
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [FAIL] dev.mjs exited with code %EXIT_CODE% — see the messages above.
)

echo.
pause
