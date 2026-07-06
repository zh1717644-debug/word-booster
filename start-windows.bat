@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 没有检测到 Node.js。请先安装 Node.js 20 或更新版本：https://nodejs.org/
  pause
  exit /b 1
)

echo 正在启动背单词抽卡...
echo 打开地址：http://127.0.0.1:4173/index.html?v=20260706-2
start "" "http://127.0.0.1:4173/index.html?v=20260706-2"
node server.mjs
pause

