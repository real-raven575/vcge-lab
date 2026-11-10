#!/bin/bash
# Flight Deck pages update (Menu, breadcrumbs, Never Forget, emoji). Team vCGE, 2026-11-10.
# Run through the sudo gate from a copy of vcge-lab's flight-deck/ folder:
#   sudo /usr/local/sbin/vcge-lab-run flight-deck/install/deck-pages-update.sh
# What it does, and nothing else:
#  1. Backs up the live deck folder to <portal>/www.before-deck-<UTC time>.
#  2. Copies the deck front page, every team page + team.css, the Menu and the Desk page from ../www (root, 644).
#     config.js, desk.js and portal.css are not touched.
#  3. The Elephant's Memory (the versions page script <lab>/bin/vcge-lab-index): swaps two emoji that Windows 10
#     cannot draw (mirror -> circus tent, jar -> peanuts) and adds a Menu link next to "Flight Deck". Backup kept
#     as vcge-lab-index.before-emoji; the page is rebuilt as the lab user, and the old script comes back if that fails.
#  4. Checks the deck answers 200 on 127.0.0.1:8080 for /, /menu/ and /teams/never-forget/.
# No service, Caddy or port change. Undo lines are printed at the end.
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)            # the flight-deck folder
PORTAL=${PORTAL:-/srv/dataprojects/portal}
LAB=${LAB:-/srv/dataprojects/vcge}
LAB_USER=${LAB_USER:-vcge}
CHECK_URL=${CHECK_URL:-http://127.0.0.1:8080}
W=$PORTAL/www
[ "$(id -u)" = 0 ] || [ -n "${DECK_TEST:-}" ] || { echo "Run through the sudo gate: sudo /usr/local/sbin/vcge-lab-run flight-deck/install/deck-pages-update.sh" >&2; exit 1; }
for f in www/index.html www/menu/index.html www/desk/index.html www/teams/team.css www/teams/never-forget/index.html; do
    [ -f "$HERE/$f" ] || { echo "  STOP missing $HERE/$f. Nothing changed." >&2; exit 1; }
done
[ -f "$W/index.html" ] && [ -d "$W/desk" ] || { echo "  STOP $W is not the live deck (no index.html or desk/). Nothing changed." >&2; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BAK=$PORTAL/www.before-deck-$STAMP
[ -e "$BAK" ] && { echo "  STOP $BAK already exists; wait a second and run again. Nothing changed." >&2; exit 1; }

echo "1. backup"
cp -a "$W" "$BAK"
echo "  OK   $BAK"

echo "2. deck pages"
install -m 644 "$HERE/www/index.html" "$W/index.html"
install -m 644 "$HERE/www/desk/index.html" "$W/desk/index.html"
install -d -m 755 "$W/menu" "$W/teams"
install -m 644 "$HERE/www/menu/index.html" "$W/menu/index.html"
install -m 644 "$HERE/www/teams/team.css" "$W/teams/team.css"
n=0
for d in "$HERE"/www/teams/*/; do
    s=$(basename "$d"); install -d -m 755 "$W/teams/$s"; install -m 644 "$d/index.html" "$W/teams/$s/index.html"; n=$((n + 1))
done
echo "  OK   front page, Menu, Desk page, $n team pages"

echo "3. the Elephant's Memory"
F=$LAB/bin/vcge-lab-index
if [ ! -f "$F" ]; then
    echo "  WARN $F not found; versions page left as it is"
else
    [ -e "$F.before-emoji" ] || cp -p "$F" "$F.before-emoji"   # keep the first, untouched copy
    python3 - "$F" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read(); before = s
s = s.replace('\U0001FA9E', '\U0001F3AA').replace('\U0001FAD9', '\U0001F95C')
old = """'<a class="back" href="/">&larr; Flight Deck</a>' if portal"""
if old in s and '/menu/' not in s:
    s = s.replace(old, """'<a class="back" href="/">&larr; Flight Deck</a> &middot; <a class="back" href="/menu/">&#9776; Menu</a>' if portal""")
open(p, 'w', encoding='utf-8').write(s)
print('  OK   script updated' if s != before else '  OK   script already up to date')
PY
    if [ -n "${DECK_TEST:-}" ] || sudo -u "$LAB_USER" "$F" "$LAB/www"; then
        echo "  OK   versions page rebuilt (backup $F.before-emoji)"
    else
        cp -p "$F.before-emoji" "$F"; sudo -u "$LAB_USER" "$F" "$LAB/www" || true
        echo "  WARN the versions page did not rebuild; the old script is back"
    fi
fi

echo "4. check"
if [ -z "${DECK_TEST:-}" ]; then
    for p in / /menu/ /teams/never-forget/; do
        c=$(curl -s -o /dev/null -w '%{http_code}' "$CHECK_URL$p" || true)
        [ "$c" = 200 ] && echo "  OK   $p 200" || echo "  WARN $p answered $c"
    done
fi
echo
echo "  Done. Undo: rm -rf $W && cp -a $BAK $W; cp -p $F.before-emoji $F && sudo -u $LAB_USER $F $LAB/www"
