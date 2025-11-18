@echo off
REM 가?�환�?진입
cd /d "%~dp0"
cd scripts
"..\.venv\Scripts\python.exe" bridge.py
pause
