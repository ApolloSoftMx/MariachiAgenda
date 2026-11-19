@echo off
setlocal
title Respaldo - MariachiTotal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org
  pause
  exit /b 1
)

node scripts/backup.mjs
if errorlevel 1 (
  echo.
  echo No se pudo crear el respaldo.
  pause
  exit /b 1
)

echo.
echo Listo. El archivo quedo en la carpeta data\backups.
pause
