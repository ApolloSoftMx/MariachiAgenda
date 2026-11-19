@echo off
setlocal
title MariachiTotal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro Node.js.
  echo Instala Node.js 24 o superior desde https://nodejs.org y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
  if errorlevel 1 goto :error
)

if not exist "dist\index.html" (
  echo Compilando la interfaz...
  call npm run build
  if errorlevel 1 goto :error
)

set "APP_PORT=3000"
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /I "%%A"=="PORT" set "APP_PORT=%%B"
  )
)

echo.
echo ============================================
echo   MariachiTotal
echo   http://localhost:%APP_PORT%
echo ============================================
echo.
echo Deja esta ventana abierta.
echo Para detener el sistema presiona Ctrl+C.
echo.

start "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:%APP_PORT%"
node server/index.js
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Ocurrio un error. Revisa los mensajes de arriba.
pause
exit /b 1
