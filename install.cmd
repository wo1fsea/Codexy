@echo off
setlocal EnableExtensions

set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

set "BIN_DIR=%USERPROFILE%\.codexy\bin"
set "TARGET=%BIN_DIR%\codexy.cmd"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required before Codexy can complete setup.
  exit /b 1
)

call node "%INSTALL_DIR%\scripts\install.mjs"
if errorlevel 1 exit /b %errorlevel%

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

> "%TARGET%" (
  echo @echo off
  echo setlocal
  echo set "CODEXY_INSTALL_DIR=%INSTALL_DIR%"
  echo if not exist "%%CODEXY_INSTALL_DIR%%\scripts\codexy.mjs" ^(
  echo   echo Codexy install directory not found: %%CODEXY_INSTALL_DIR%%
  echo   echo Rerun install.cmd from the current Codexy checkout.
  echo   exit /b 1
  echo ^)
  echo call node "%%CODEXY_INSTALL_DIR%%\scripts\codexy.mjs" %%*
)

set "PATH_UPDATED=0"
if /I not "%CODEXY_SKIP_PATH_UPDATE%"=="1" (
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$bin = [System.IO.Path]::GetFullPath('%BIN_DIR%'); $current = [Environment]::GetEnvironmentVariable('Path', 'User'); $parts = if ([string]::IsNullOrWhiteSpace($current)) { @() } else { $current -split ';' | Where-Object { $_ } }; if ($parts -notcontains $bin) { $newValue = if ([string]::IsNullOrWhiteSpace($current)) { $bin } else { $current + ';' + $bin }; [Environment]::SetEnvironmentVariable('Path', $newValue, 'User'); '1' } else { '0' }"` ) do set "PATH_UPDATED=%%I"
)

echo;%PATH%; | find /I ";%BIN_DIR%;" >nul
if errorlevel 1 set "PATH=%BIN_DIR%;%PATH%"

echo Installed Codexy launcher at "%TARGET%".
if /I "%CODEXY_SKIP_PATH_UPDATE%"=="1" (
  echo Skipped persistent PATH update because CODEXY_SKIP_PATH_UPDATE=1.
) else if "%PATH_UPDATED%"=="1" (
  echo Added "%BIN_DIR%" to your user PATH.
) else (
  echo "%BIN_DIR%" was already present on your user PATH.
)
echo Next steps:
echo   codexy help
echo   codexy doctor
