#!/bin/zsh
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "没有检测到 Node.js。请先安装 Node.js 20 或更新版本：https://nodejs.org/"
  read "dummy?按回车退出..."
  exit 1
fi

echo "正在启动背单词抽卡..."
echo "打开地址：http://127.0.0.1:4173/index.html?v=20260706-4"
open "http://127.0.0.1:4173/index.html?v=20260706-4"
node server.mjs

