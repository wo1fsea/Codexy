@echo off
setlocal
cd /d "%~dp0"
set "PORT=3000"

if not "%~1"=="" (
  if /i "%~1"=="--port" (
    if not "%~2"=="" (
      set "PORT=%~2"
      shift
      shift
    )
  ) else (
    set "PORT=%~1"
    shift
  )
)

call node scripts\next-start.mjs --port %PORT%
exit /b %errorlevel%
