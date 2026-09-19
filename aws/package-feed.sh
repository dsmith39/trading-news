#!/usr/bin/env bash
# Builds the feed function's deployment package into $1.
#
# Exists so the file list has ONE home. It was previously written out in both
# deploy.sh and the workflow, which is a trap: core.mjs gained an import, the
# lists did not, and the zip would have shipped missing a module it needs.
# check.yml builds through this same script and imports the result.
set -euo pipefail

DEST="${1:?usage: package-feed.sh <dir>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$DEST"
cp "$ROOT/aws/lambda/feed/index.mjs" \
   "$ROOT/feed/core.mjs" \
   "$ROOT/feed/sources.mjs" \
   "$ROOT/feed/instruments.mjs" \
   "$ROOT/feed/score.mjs" \
   "$ROOT/feed/history.mjs" \
   "$DEST/"

# npm walks UP for a package.json and this repo has one at its root, so without
# a manifest here it installs to the root and the zip ships without the client.
echo '{"name":"nq-feed","private":true,"type":"module"}' > "$DEST/package.json"

if command -v npm >/dev/null; then
  ( cd "$DEST" && npm install --silent --no-audit --no-fund --omit=dev @aws-sdk/client-s3 >/dev/null 2>&1 ) \
    || echo "    npm install failed - falling back to the runtime's bundled SDK" >&2
fi
