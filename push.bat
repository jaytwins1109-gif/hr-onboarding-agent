@echo off
REM 双击即推送：%~dp0 = 本 bat 所在目录（仓库根），换任意路径都能用。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0onboard\scripts\push-with-retry.ps1"
echo.
pause
