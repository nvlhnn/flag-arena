@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing Flag Arena...
  call npm.cmd ci
  if errorlevel 1 exit /b 1
)
if not exist dist\index.html (
  call npm.cmd run build
  if errorlevel 1 exit /b 1
)
echo Open http://127.0.0.1:4318/ in your browser.
echo Keep this window open while streaming. Press Ctrl+C to stop.
call npm.cmd start
