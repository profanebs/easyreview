@echo off
REM easyreview render wrapper: forwards every argument to the bundled generator.
REM Usage: easyreview-render.cmd <file.md> [--lang zh|en] [--out <dir>] [--no-paths]
"%~dp0..\bin\easyreview-render.exe" %*
