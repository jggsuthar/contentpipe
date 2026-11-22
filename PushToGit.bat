@echo off
setlocal enabledelayedexpansion
title ContentPipe - Push to GitHub

:: Always run from the project root where this .bat lives
cd /d "%~dp0"

set "REPO_URL=https://github.com/jggsuthar/contentpipe.git"
set "BRANCH=main"

echo ============================================================
echo        ContentPipe - Prepare ^& Push to GitHub
echo        Target: %REPO_URL%
echo ============================================================
echo.

:: 1. Verify Git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not in PATH.
    echo Please install Git for Windows from https://git-scm.com/download/win
    pause
    exit /b 1
)

:: 2. Initialize Git repo if this folder is not yet tracked
if not exist ".git\" (
    echo [INFO] Initializing local Git repository on branch '%BRANCH%'...
    git init -b %BRANCH%
    if errorlevel 1 (
        echo [ERROR] Failed to initialize Git repository.
        pause
        exit /b 1
    )
) else (
    git branch -M %BRANCH% >nul 2>&1
)

:: 3. Configure origin remote
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [INFO] Adding remote 'origin': %REPO_URL%
    git remote add origin "%REPO_URL%"
) else (
    for /f "delims=" %%R in ('git remote get-url origin') do set "CURRENT_REMOTE=%%R"
    if /i not "!CURRENT_REMOTE!"=="%REPO_URL%" (
        echo [INFO] Updating remote 'origin' to %REPO_URL%...
        git remote set-url origin "%REPO_URL%"
    )
)

:: 4. Ensure Git user identity is configured
for /f "delims=" %%N in ('git config user.name 2^>nul') do set "GIT_NAME=%%N"
for /f "delims=" %%E in ('git config user.email 2^>nul') do set "GIT_EMAIL=%%E"
if "!GIT_NAME!"=="" (
    set /p "GIT_NAME=Enter Git user.name (e.g. Jaimin Suthar): "
    git config user.name "!GIT_NAME!"
)
if "!GIT_EMAIL!"=="" (
    set /p "GIT_EMAIL=Enter Git user.email: "
    git config user.email "!GIT_EMAIL!"
)

:: 5. Stage files while respecting .gitignore
echo.
echo [INFO] Staging project files (excluding .env*, node_modules, .next, *.db)...
git add -A

:: Safety guard: never allow secret/local DB files to be pushed
for %%F in (.env .env.local prisma/dev.db prisma/sqlite-export.json) do (
    git diff --cached --name-only | findstr /i /x "%%F" >nul 2>&1
    if not errorlevel 1 (
        echo [WARNING] Unstaging sensitive/local file: %%F
        git reset HEAD -- "%%F" >nul 2>&1
    )
)

echo.
echo --- Files Staged for Commit ---
git status --short
echo -------------------------------
echo.

:: 6. Check if there are staged changes to commit
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo [INFO] No new changes to commit. Checking if local commits need pushing...
    goto :DO_PUSH
)

:: 7. Prompt for commit message (or use timestamp default)
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set "NOW_TS=%%T"
set "COMMIT_MSG="
set /p "COMMIT_MSG=Enter commit message (press Enter for default: Update ContentPipe - %NOW_TS%): "
if "!COMMIT_MSG!"=="" (
    set "COMMIT_MSG=Update ContentPipe - !NOW_TS!"
)

echo.
echo [INFO] Committing: "!COMMIT_MSG!"
git commit -m "!COMMIT_MSG!"
if errorlevel 1 (
    echo [ERROR] Git commit failed.
    pause
    exit /b 1
)

:DO_PUSH
echo.
echo [INFO] Pushing branch '%BRANCH%' to %REPO_URL%...
git push -u origin %BRANCH%
if errorlevel 1 (
    echo.
    echo [WARNING] Direct push failed.
    echo If GitHub already has a README or license commit, you can pull ^& rebase it now.
    set "DO_REBASE="
    set /p "DO_REBASE=Pull remote '%BRANCH%' with rebase and retry push? (Y/N): "
    if /i "!DO_REBASE!"=="Y" (
        git pull --rebase --allow-unrelated-histories origin %BRANCH%
        if errorlevel 1 (
            echo [ERROR] Pull/rebase encountered conflicts or failed. Resolve manually and retry.
            pause
            exit /b 1
        )
        git push -u origin %BRANCH%
        if errorlevel 1 (
            echo [ERROR] Push still failed. Check your GitHub authentication or branch rules.
            pause
            exit /b 1
        )
    ) else (
        echo [ABORTED] Push cancelled.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo   SUCCESS! ContentPipe pushed to:
echo   https://github.com/jggsuthar/contentpipe
echo ============================================================
echo.
pause
exit /b 0
