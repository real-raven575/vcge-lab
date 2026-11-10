#!/usr/bin/env bash
# Runs setrun.e2e.cjs on a throwaway lab: a build of the app published from a checkout, the bench service with the
# drawn scan card as its only business card (and its truth saved), the Funhouse service with the drawn sample set, and
# the Caddy stand-in. Drawn cards only (FUNHOUSE_DIR = the Funhouse source folder, outside git). Usage: test/run-e2e.sh <app checkout> <short sha>
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); LAB=$(cd "$HERE/../.." && pwd); FUN=${FUNHOUSE_DIR:-$LAB/funhouse}
APP=$1; SHORT=$2
T=$(mktemp -d)
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$T"' EXIT
W=$T/www; mkdir -p "$W/v/$SHORT" "$T/cards" "$T/shelf/variants"
cp -r "$APP/src" "$W/v/$SHORT/src"
printf '{"short":"%s","subject":"test build","date":"2026-10-30T00:00:00Z","tests":"n/a"}' "$SHORT" > "$W/v/$SHORT/version.json"
ln -s "v/$SHORT" "$W/latest"
cp -r "$HERE/../www" "$W/bench"
cp "$FUN/sample-sources/drawn-scan.jpg" "$T/cards/"
cp -r "$FUN/sample-set" "$T/shelf/variants/drawn-sample-1"
python3 -I "$HERE/../vcge-bench-api.py" --root "$W" --port 18965 --cards-dir "$T/cards" >/dev/null &
python3 -I "$FUN/funhouse-api.py" --shelf "$T/shelf" --port 18969 --shelf-api http://127.0.0.1:1 --edge-api http://127.0.0.1:1 >/dev/null &
node "$HERE/stand-in.cjs" "$W" 18966 18965 18969 &
node "$HERE/stand-in.cjs" "$W" 18967 18965 1 &
sleep 1.5
# The drawn scan card's answer key, saved the way the page's Go saves it
curl -sf -X PUT 'http://127.0.0.1:18965/bench/api/truth?set=business-cards&name=drawn-scan.jpg' --data-binary @- <<'JSON' >/dev/null
{"lines":[{"text":"Velmar Studio","role":"organization","drop":false},{"text":"Kalo Renmi","role":"name","drop":false},{"text":"555-0123","role":"phone","drop":false},{"text":"kalo@velmar.test","role":"email","drop":false},{"text":"42 Tesqu St, Marpo","role":"address","drop":false}],"edgesOk":true,"hadQuad":false}
JSON
node "$HERE/${E2E_SCRIPT:-setrun.e2e.cjs}" "$W" 18966 18967
cp "$T/setrun-phone.png" "${E2E_SHOT:-/dev/null}" 2>/dev/null || true
