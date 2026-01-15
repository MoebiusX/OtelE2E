@echo off
echo.
echo ========================================
echo    FULL RESTART - ALL SERVICES
echo ========================================
echo.

echo [1/4] Stopping all Node processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo       Node processes terminated
) else (
    echo       No Node processes were running
)

echo.
echo [2/4] Restarting Docker services...
docker-compose down
echo       Docker services stopped
docker-compose up -d
echo       Docker services starting...

echo.
echo [3/4] Waiting for services to be ready (5 seconds)...
timeout /t 5 /nobreak >nul
echo       Services should be ready

echo.
echo [4/4] Starting development environment...
echo.
echo ========================================
npm run dev
