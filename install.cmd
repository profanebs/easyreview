@echo off
set /p EASYREVIEW_PROJECT=Project directory: 
if not defined EASYREVIEW_PROJECT exit /b 1
call "%~dp0bin\easyreview.cmd" install --project "%EASYREVIEW_PROJECT%" --agent all
pause
