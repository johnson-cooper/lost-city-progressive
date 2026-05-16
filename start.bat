@echo off
cd /d %~dp0

echo Starting Node Launcher...
cd engine

npx tsx launcher.ts

pause