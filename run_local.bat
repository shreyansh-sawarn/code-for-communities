@echo off
title Prioritize Local Development Server
echo ===================================================
echo   Prioritize Local Server Bootstrapper
echo ===================================================
echo.

:: Check for Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Python detected. Launching local server on port 8080...
    start "" "http://localhost:8080/"
    python -m http.server 8080
    exit /b
)

:: Check for Node / npx
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Node/npx detected. Launching http-server on port 8080...
    start "" "http://localhost:8080/"
    npx http-server -p 8080
    exit /b
)

echo [ERROR] Neither Python nor Node/npx was found on your system PATH.
echo.
echo Please run a local server in this directory, or deploy the folder 
echo directly to Vercel/Netlify for a live hosting link.
echo.
pause
