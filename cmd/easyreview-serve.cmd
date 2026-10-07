@echo off
REM easyreview helper wrapper: serves a folder over loopback HTTP for the
REM Review pane, answers /reveal, and accepts POST /feedback (archives it and,
REM with a local OpenCode session, delivers it to the conversation).
REM Usage: easyreview-serve.cmd [<folder>] [--port 7803]
setlocal
set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=%CD%"
"%~dp0..\bin\easyreview-helper.exe" --root "%ROOT%" --port 7803
