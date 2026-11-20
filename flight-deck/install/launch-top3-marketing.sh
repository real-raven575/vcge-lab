#!/bin/bash
# One install, 2026-11-20 (raven575's poke 00:41 UTC): the Launch bench ("Do This First") puts Team vCGE's top 3
# first, and Team Marketing's own Flight Deck page goes into its hangar. Team vCGE.
# Run through the sudo gate from a copy of vcge-lab:
#   sudo /usr/local/sbin/vcge-lab-run flight-deck/install/launch-top3-marketing.sh
# What it does, and nothing else:
#  1. Checks Marketing's page (MARKETING_PAGE, default the vCGE Nextcloud marketing-drop/) against its sha256
#     (starts 3f24c72b, ends 3f1a). A mismatch stops everything before any change.
#  2. Reinstalls the Test Bench from ../testbench (new launch.json order; what raven575 recorded is kept, it lives
#     in the bench's state.json, not the seed).
#  3. Updates the deck pages with deck-pages-update.sh (front page gets the link; it backs up the deck first).
#  4. Puts Marketing's page at /teams/marketing/deck/ (root, 644; the old one, if any, kept as index.html.before).
#  5. Checks the page and the Launch bench answer.
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)            # the flight-deck folder
REPO=$(cd "$HERE/.." && pwd)
PORTAL=${PORTAL:-/srv/dataprojects/portal}
CHECK_URL=${CHECK_URL:-http://127.0.0.1:8080}
MARKETING_PAGE=${MARKETING_PAGE:-/home/t-vcge/Nextcloud/marketing-drop/marketing-flight-deck-page.html}
[ "$(id -u)" = 0 ] || { echo "Run through the sudo gate: sudo /usr/local/sbin/vcge-lab-run flight-deck/install/launch-top3-marketing.sh" >&2; exit 1; }

echo "[1/5] Marketing's page"
[ -f "$MARKETING_PAGE" ] || { echo "  STOP $MARKETING_PAGE not found. Nothing changed." >&2; exit 1; }
SUM=$(sha256sum "$MARKETING_PAGE" | cut -d' ' -f1)
case "$SUM" in 3f24c72b*3f1a) echo "  OK   sha256 $SUM";; *) echo "  STOP sha256 $SUM is not the one Marketing sent (3f24c72b...3f1a). Nothing changed." >&2; exit 1;; esac

echo "[2/5] Test Bench (Launch bench order)"
(cd "$REPO/testbench" && bash vcge-lab-testbench-install.sh)

echo "[3/5] deck pages"
bash "$HERE/install/deck-pages-update.sh"

echo "[4/5] Marketing's page into its hangar"
D=$PORTAL/www/teams/marketing/deck
install -d -m 755 "$D"
[ -f "$D/index.html" ] && [ ! -e "$D/index.html.before" ] && cp -p "$D/index.html" "$D/index.html.before"
install -m 644 "$MARKETING_PAGE" "$D/index.html"
echo "  OK   $D/index.html"

echo "[5/5] check"
code=$(curl -s -o /dev/null -w '%{http_code}' "$CHECK_URL/teams/marketing/deck/")
[ "$code" = 200 ] && echo "  OK   /teams/marketing/deck/ answers 200" || echo "  WARN /teams/marketing/deck/ answered $code"
echo "Done. Undo Marketing's page: rm -r $D (or put back index.html.before). The deck backup line is printed above."
