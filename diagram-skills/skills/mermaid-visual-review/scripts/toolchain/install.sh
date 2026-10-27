#!/usr/bin/env bash
# Install both pinned render toolchains. Idempotent — safe to re-run.
#
# Uses `npm ci` when a lockfile exists (exact, reproducible) and falls back to
# `npm install` to generate one the first time. Puppeteer caches Chromium in
# ~/.cache/puppeteer, so the second toolchain reuses the first one's browser.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for which in target baseline; do
    dir="$SCRIPT_DIR/$which"
    echo "==> installing $which toolchain"
    if [[ -f "$dir/package-lock.json" ]]; then
        (cd "$dir" && npm ci)
    else
        (cd "$dir" && npm install)
    fi
done

echo "==> done"
