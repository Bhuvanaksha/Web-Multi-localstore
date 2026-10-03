#!/usr/bin/env bash
# Stops any stale dev servers so `npm run dev` starts clean.
# A leftover backend on :5347 (or frontend on :8175) causes "port in use"
# and 500 errors in the browser — run this whenever something looks off.
set -e

pkill -f "tsx [w]atch" 2>/dev/null || true
pkill -f "node_modules/.bin/vite" 2>/dev/null || true
fuser -k 5347/tcp 2>/dev/null || true
fuser -k 8175/tcp 2>/dev/null || true

sleep 1
echo "✓ Stale dev servers stopped. Run 'npm run dev' to start fresh."
