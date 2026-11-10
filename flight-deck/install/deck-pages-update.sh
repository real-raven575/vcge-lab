#!/bin/bash
# Flight Deck pages update: the deck bar (one menu on every page), accurate rosters and plans, Cornerstone's page,
# Menu, Never Forget, emoji. Team vCGE, 2026-11-10.
# Run through the sudo gate from a copy of vcge-lab (this flight-deck/ folder next to card-shelf/):
#   sudo /usr/local/sbin/vcge-lab-run flight-deck/install/deck-pages-update.sh
# What it does, and nothing else:
#  1. Backs up the live deck folder to <portal>/www.before-deck-<UTC time>.
#  2. Copies the deck front page, every team page + team.css, the Menu, the Desk page, deckbar.css and
#     elephant.svg from ../www (root, 644). config.js, desk.js and portal.css are not touched.
#  3. The lab pages (Reading Room, Card Shelf, Paint Shop, Wipe Trials, Darkroom, Funhouse): puts the deck bar into
#     each live index.html IN PLACE (so parts that exist only on this server stay), first keeping a copy as
#     index.html.before-deckbar. The Card Shelf also gets shelf.js (a tile shows the photo if its preview fails).
#  4. The Elephant's Memory (the versions page script <lab>/bin/vcge-lab-index): emoji Windows 10 can draw, and the
#     deck bar. Backup kept as vcge-lab-index.before-emoji (the first one) and vcge-lab-index.before-deckbar; the page
#     is rebuilt as the lab user, and the old script comes back if that fails.
#  5. Checks the deck answers 200 on 127.0.0.1:8080 for every page it touched.
# No service, Caddy or port change. Undo lines are printed at the end.
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)            # the flight-deck folder
PORTAL=${PORTAL:-/srv/dataprojects/portal}
LAB=${LAB:-/srv/dataprojects/vcge}
LAB_USER=${LAB_USER:-vcge}
CHECK_URL=${CHECK_URL:-http://127.0.0.1:8080}
W=$PORTAL/www
[ "$(id -u)" = 0 ] || [ -n "${DECK_TEST:-}" ] || { echo "Run through the sudo gate: sudo /usr/local/sbin/vcge-lab-run flight-deck/install/deck-pages-update.sh" >&2; exit 1; }
for f in www/index.html www/menu/index.html www/desk/index.html www/teams/team.css www/teams/never-forget/index.html \
         www/deckbar.css www/elephant.svg install/put_deckbar.py install/deckbar-pages.json; do
    [ -f "$HERE/$f" ] || { echo "  STOP missing $HERE/$f. Nothing changed." >&2; exit 1; }
done
[ -f "$W/index.html" ] && [ -d "$W/desk" ] || { echo "  STOP $W is not the live deck (no index.html or desk/). Nothing changed." >&2; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BAK=$PORTAL/www.before-deck-$STAMP
[ -e "$BAK" ] && { echo "  STOP $BAK already exists; wait a second and run again. Nothing changed." >&2; exit 1; }

echo "[1/5] backup"
cp -a "$W" "$BAK"
echo "  OK   $BAK"

echo "[2/5] deck pages"
install -m 644 "$HERE/www/index.html" "$W/index.html"
install -m 644 "$HERE/www/deckbar.css" "$W/deckbar.css"
install -m 644 "$HERE/www/elephant.svg" "$W/elephant.svg"
install -m 644 "$HERE/www/desk/index.html" "$W/desk/index.html"
install -d -m 755 "$W/menu" "$W/teams"
install -m 644 "$HERE/www/menu/index.html" "$W/menu/index.html"
install -m 644 "$HERE/www/teams/team.css" "$W/teams/team.css"
n=0
for d in "$HERE"/www/teams/*/; do
    s=$(basename "$d"); install -d -m 755 "$W/teams/$s"; install -m 644 "$d/index.html" "$W/teams/$s/index.html"; n=$((n + 1))
done
echo "  OK   front page, Menu, Desk page, deck bar style, $n team pages"
ST=$HERE/www/teams/history/stash/index.html   # Team History's wiki (HIST-0031), built by Team History
if [ -f "$ST" ]; then
    install -d -m 755 "$W/teams/history/stash"; install -m 644 "$ST" "$W/teams/history/stash/index.html"
    echo "  OK   Team History's Stash at /teams/history/stash/"
fi

echo "[3/5] lab pages"
BARS=$HERE/install/deckbar-pages.json
for pair in bench/index.html=/vcge/bench/ bench/handwriting.html=/vcge/bench/handwriting.html \
            shelf/index.html=/vcge/shelf/ logo-bench/index.html=/vcge/logo-bench/ testing/index.html=/vcge/testing/ \
            edge-bench/index.html=/vcge/edge-bench/ funhouse/index.html=/vcge/funhouse/; do
    f=${pair%%=*}; url=${pair#*=}; P=$LAB/www/$f
    if [ ! -f "$P" ]; then echo "  WARN $P not found; skipped"; continue; fi
    [ -e "$P.before-deckbar" ] || cp -p "$P" "$P.before-deckbar"
    python3 "$HERE/install/put_deckbar.py" "$BARS" "$P=$url"
done
SJ=$HERE/../card-shelf/www/shelf.js
if [ -f "$SJ" ] && [ -d "$LAB/www/shelf" ]; then
    [ -e "$LAB/www/shelf/shelf.js.before-deckbar" ] || cp -p "$LAB/www/shelf/shelf.js" "$LAB/www/shelf/shelf.js.before-deckbar"
    install -o "$LAB_USER" -g "$LAB_USER" -m 644 "$SJ" "$LAB/www/shelf/shelf.js"
    echo "  OK   Card Shelf shelf.js (photo shows if its preview fails)"
fi

echo "[4/5] the Elephant's Memory"
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
print('  OK   emoji updated' if s != before else '  OK   emoji already up to date')
PY
    [ -e "$F.before-deckbar" ] || cp -p "$F" "$F.before-deckbar"
    python3 "$HERE/install/put_deckbar.py" "$BARS" "$F=/vcge/"
    if [ -n "${DECK_TEST:-}" ] || sudo -u "$LAB_USER" "$F" "$LAB/www"; then
        echo "  OK   versions page rebuilt (backup $F.before-emoji)"
    else
        cp -p "$F.before-emoji" "$F"; sudo -u "$LAB_USER" "$F" "$LAB/www" || true
        echo "  WARN the versions page did not rebuild; the old script is back"
    fi
fi

echo "[5/5] check"
if [ -z "${DECK_TEST:-}" ]; then
    for p in / /menu/ /desk/ /deckbar.css /teams/vcge/ /teams/never-forget/ /teams/history/stash/ /vcge/ /vcge/bench/ /vcge/bench/handwriting.html /vcge/shelf/ \
             /vcge/logo-bench/ /vcge/testing/ /vcge/edge-bench/ /vcge/funhouse/; do
        c=$(curl -s -o /dev/null -w '%{http_code}' "$CHECK_URL$p" || true)
        [ "$c" = 200 ] && echo "  OK   $p 200" || echo "  WARN $p answered $c"
    done
fi
echo
echo "  Done. Undo: rm -rf $W && cp -a $BAK $W; cp -p $F.before-deckbar $F && sudo -u $LAB_USER $F $LAB/www;"
echo "        for f in bench/index.html bench/handwriting.html shelf/index.html logo-bench/index.html testing/index.html edge-bench/index.html funhouse/index.html; do cp -p $LAB/www/\$f.before-deckbar $LAB/www/\$f; done"
