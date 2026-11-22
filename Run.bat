@echo off
title Starting Creator App...

:: Ensure we run inside the folder where this bat file is placed
cd /d "%~dp0"

echo ===================================================
echo           Starting Creator App Environment
echo ===================================================
echo.

:: Check if server is already running on port 3000 or 3001
powershell -NoProfile -Command "$tcp = New-Object System.Net.Sockets.TcpClient; try { $tcp.Connect('127.0.0.1', 3000); $tcp.Close(); exit 0 } catch { try { $tcp.Connect('127.0.0.1', 3001); $tcp.Close(); exit 2 } catch { exit 1 } }"
if %errorlevel% equ 0 (
    echo [INFO] Next.js dev server is already running on http://localhost:3000!
    echo [INFO] Launching browser...
    start "" "http://localhost:3000"
    exit /b 0
)
if %errorlevel% equ 2 (
    echo [INFO] Next.js dev server is already running on http://localhost:3001!
    echo [INFO] Launching browser...
    start "" "http://localhost:3001"
    exit /b 0
)

:: Check if node_modules exists; if not, install dependencies
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b %errorlevel%
    )
)

:: Ensure Prisma Client is generated for the local SQLite database
echo [INFO] Generating Prisma Client...
call npx prisma generate

:: Check if database file exists; if not, initialize schema
if not exist "prisma\dev.db" (
    echo [INFO] Database not found. Initializing schema...
    call npx prisma db push
)

:: Launch browser automatically once the server is ready
echo [INFO] Preparing auto-launch in your browser once server starts...
start "" powershell -NoProfile -WindowStyle Hidden -Command "$ports = @(3000, 3001); $found = $null; for ($i=0; $i -lt 80; $i++) { foreach ($p in $ports) { try { $tcp = [System.Net.Sockets.TcpClient]::new(); $tcp.Connect('127.0.0.1', $p); $tcp.Close(); $found = $p; break } catch {} }; if ($found) { break }; Start-Sleep -Milliseconds 500 }; if ($found) { Start-Process \"http://localhost:$found\" } else { Start-Process \"http://localhost:3000\" }"

:: Start the Next.js development server
echo [INFO] Starting Next.js Dev Server...
echo (Keep this window open while using the app. Press Ctrl+C to stop.)
echo.
call npm run dev

pause
