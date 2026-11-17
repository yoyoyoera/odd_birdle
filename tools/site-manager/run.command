#!/bin/zsh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")/../.."
node tools/site-manager/bot.mjs
echo "보고서: $(pwd)/tools/site-manager/output/latest.md"
