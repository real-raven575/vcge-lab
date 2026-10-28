#!/usr/bin/env bash
# vCGE lab: installs (or updates) the Card Shelf, the benches' shared photo place. Idempotent; run again to update.
#   1. makes the shelf folders <SHELF_ROOT>/{holding,archive,active/ocr,active/logo,active/edges} (owner <LAB_USER>),
#      outside the web root and every git repo
#   2. copies photos already on the benches onto the shelf (COPIES; the originals stay where they are):
#      the OCR bench's business cards -> active/ocr, the edge bench's local inbox -> active/edges; only into an empty folder
#   3. installs the shelf service as <LAB_ROOT>/bin/card-shelf-api + a systemd unit (user <LAB_USER>, 127.0.0.1:<SHELF_PORT>)
#   4. adds "reverse_proxy /shelf/api/* 127.0.0.1:<SHELF_PORT>" to Team vCGE's Caddy file (backup kept; validated first)
#   5. copies the page to <LAB_ROOT>/www/shelf/
#   6. points the OCR bench at the shelf: its unit gets --cards-dir <SHELF_ROOT>/active/ocr (backup kept)
# Nothing in the app repo or any published build is touched. Undo lines are printed at the end.
#   Run, from the folder that holds this script:  sudo bash vcge-lab-card-shelf-install.sh
#   Settings (LAB_ROOT, LAB_USER, SHELF_ROOT, SHELF_PORT, VCGE_CADDY): lab.conf, see lab.conf.example.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=${VCGE_LAB_CONF:-$HERE/../lab.conf}
[ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
WWW=$P/www
SH=${SHELF_ROOT:-$P/shelf}
PORT=${SHELF_PORT:-8768}
C=${VCGE_CADDY:-/etc/caddy/teams/vcge.caddy}
UNIT=/etc/systemd/system/card-shelf-api.service
BENCH_UNIT=/etc/systemd/system/vcge-bench-api.service
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
for f in card-shelf-api.py www/index.html www/shelf.js www/shelf.css; do [ -f "$HERE/$f" ] || { echo "  STOP missing $HERE/$f" >&2; exit 1; }; done
id "$U" >/dev/null 2>&1 || { echo "  STOP no '$U' user on this machine (set LAB_USER in lab.conf)" >&2; exit 1; }
[ -d "$WWW" ] || { echo "  STOP $WWW not found (set LAB_ROOT in lab.conf)" >&2; exit 1; }
case "$SH/" in "$WWW"/*) echo "  STOP SHELF_ROOT ($SH) is inside the web root; put it outside $WWW" >&2; exit 1;; esac

echo "1. shelf folders"
for d in holding archive active/ocr active/logo active/edges; do install -d -o "$U" -g "$U" -m 750 "$SH/$d"; done
echo "  OK   $SH"

echo "2. copy photos already on the benches (originals stay)"
copy_in() {   # from-folder to-folder label
    local from=$1 to=$2 n=0
    [ -d "$from" ] || { echo "  OK   $3: nothing to copy ($from not there)"; return; }
    if [ -n "$(ls -A "$to" 2>/dev/null)" ]; then echo "  OK   $3: $to already has photos, nothing copied"; return; fi
    for f in "$from"/*; do
        [ -f "$f" ] || continue
        case "${f,,}" in *.jpg|*.jpeg|*.png|*.webp|*.gif|*.bmp) install -o "$U" -g "$U" -m 640 -p "$f" "$to/"; n=$((n+1));; esac
    done
    echo "  OK   $3: $n copied"
}
copy_in "$WWW/bench/data/samples/business-cards" "$SH/active/ocr" "the OCR bench's business cards"
copy_in "$WWW/edge-bench/data/inbox" "$SH/active/edges" "the edge bench's local inbox"

echo "3. shelf service"
install -d "$P/bin"
install -o root -g root -m 755 "$HERE/card-shelf-api.py" "$P/bin/card-shelf-api"
cat > "$UNIT" <<UNITFILE
[Unit]
Description=vCGE lab Card Shelf, the benches' shared photos (127.0.0.1:$PORT)
After=network.target

[Service]
User=$U
Group=$U
ExecStart=/usr/bin/python3 $P/bin/card-shelf-api --shelf $SH --port $PORT
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$SH
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITFILE
systemctl daemon-reload
systemctl enable --now card-shelf-api.service >/dev/null
systemctl restart card-shelf-api.service
sleep 1
curl -fsS "http://127.0.0.1:$PORT/shelf/api/health" >/dev/null && echo "  OK   service answers on 127.0.0.1:$PORT" || { echo "  FAIL service not answering: journalctl -u card-shelf-api" >&2; exit 1; }

echo "4. Caddy route"
if [ ! -f "$C" ]; then
    echo "  WARN $C not found; add 'reverse_proxy /shelf/api/* 127.0.0.1:$PORT' to Team vCGE's site block by hand"
elif grep -q 'shelf/api' "$C"; then
    echo "  OK   $C already routes /shelf/api"
else
    cp -p "$C" "$C.before-shelf"
    # Right after the OCR bench's route line, so it lands inside Team vCGE's block.
    sed -i "0,/reverse_proxy \/bench\/api\/\*.*/s//&\n\treverse_proxy \/shelf\/api\/* 127.0.0.1:$PORT/" "$C"
    if grep -q 'shelf/api' "$C" && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
        systemctl reload caddy && echo "  OK   route added and Caddy reloaded (backup $C.before-shelf)"
    else
        cp -p "$C.before-shelf" "$C"; echo "  FAIL could not add the route; the old file is back. Add it by hand after the /bench/api line." >&2; exit 1
    fi
fi

echo "5. shelf page"
install -d -o "$U" -g "$U" "$WWW/shelf"
install -o "$U" -g "$U" -m 644 "$HERE"/www/* "$WWW/shelf/"
echo "  OK   $WWW/shelf/"

echo "6. the OCR bench reads the shelf"
if [ ! -f "$BENCH_UNIT" ]; then
    echo "  WARN $BENCH_UNIT not found; install the OCR bench first, then run this again"
elif grep -q -- '--cards-dir' "$BENCH_UNIT"; then
    echo "  OK   the OCR bench already reads a cards folder"
else
    cp -p "$BENCH_UNIT" "$BENCH_UNIT.before-shelf"
    sed -i "s|^\(ExecStart=.*vcge-bench-api.*\)$|\1 --cards-dir $SH/active/ocr|; s|^\(ReadWritePaths=.*\)$|\1 $SH/active/ocr|" "$BENCH_UNIT"
    systemctl daemon-reload && systemctl restart vcge-bench-api.service && sleep 1
    if curl -fsS "http://127.0.0.1:${BENCH_PORT:-8765}/bench/api/health" >/dev/null; then echo "  OK   the OCR bench restarted on the shelf (backup $BENCH_UNIT.before-shelf)"
    else cp -p "$BENCH_UNIT.before-shelf" "$BENCH_UNIT"; systemctl daemon-reload; systemctl restart vcge-bench-api.service; echo "  FAIL the OCR bench did not come back; old unit restored" >&2; exit 1; fi
fi

echo
echo "  Done. Open the lab's shelf/ page."
echo "  To undo: systemctl disable --now card-shelf-api; rm $UNIT $P/bin/card-shelf-api; rm -r $WWW/shelf;"
echo "           cp $C.before-shelf $C && systemctl reload caddy;"
echo "           cp $BENCH_UNIT.before-shelf $BENCH_UNIT && systemctl daemon-reload && systemctl restart vcge-bench-api"
echo "  The photos in $SH are left in place on undo; they are copies, and the benches' originals were never moved."
