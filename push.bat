@echo off
cd /d "d:\codebuddy\HR Assistant\onboard"
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\codebuddy\HR Assistant\onboard\scripts\push-with-retry.ps1"
echo.
pause
