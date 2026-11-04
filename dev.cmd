@echo off
chcp 65001 >nul
set "PATH=C:\Users\35232\.local\share\nodejs\node-v20.18.0-win-x64;%PATH%"
cd /d "%~dp0"
echo 正在启动伦蒂尼姆协议原型...
npm run dev
pause
