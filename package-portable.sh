#!/bin/zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$ROOT_DIR/portable-build/word-booster-portable"
ZIP_PATH="$ROOT_DIR/word-booster-portable.zip"

rm -rf "$ROOT_DIR/portable-build" "$ZIP_PATH"
mkdir -p "$PACKAGE_DIR"

cp \
  "$ROOT_DIR/index.html" \
  "$ROOT_DIR/app.js" \
  "$ROOT_DIR/api.js" \
  "$ROOT_DIR/db.js" \
  "$ROOT_DIR/local-ai.js" \
  "$ROOT_DIR/server.mjs" \
  "$ROOT_DIR/styles.css" \
  "$ROOT_DIR/manifest.webmanifest" \
  "$ROOT_DIR/service-worker.js" \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/.env.example" \
  "$ROOT_DIR/start-mac.command" \
  "$ROOT_DIR/start-windows.bat" \
  "$ROOT_DIR/PORTABLE_README.md" \
  "$PACKAGE_DIR/"

chmod +x "$PACKAGE_DIR/start-mac.command"

cd "$ROOT_DIR/portable-build"
zip -r "$ZIP_PATH" "word-booster-portable" >/dev/null

echo "已生成：$ZIP_PATH"
