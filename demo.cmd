@echo off
call "%~dp0bin\easyreview.cmd" render "%~dp0examples\demo.md" --out "%~dp0reviews" --agent auto
pause
