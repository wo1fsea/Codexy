@echo off
setlocal
cd /d "%~dp0"
set "PORT=3001"

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

call npx next dev --hostname 0.0.0.0 --port %PORT%
exit /b %errorlevel%
