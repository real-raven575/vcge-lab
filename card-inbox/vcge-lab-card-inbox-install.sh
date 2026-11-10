#!/usr/bin/env bash
# vCGE lab: installs (or updates) the Card Inbox (one card, every angle). Idempotent; run again to update.
#   1. makes <INBOX_ROOT>/{cards,drop} (owner <LAB_USER>), outside the web root and every git repo
#   2. installs the inbox service as <LAB_ROOT>/bin/card-inbox-api + a systemd unit (user <LAB_USER>, 127.0.0.1:<INBOX_PORT>)
#   3. adds "reverse_proxy /inbox/api/* 127.0.0.1:<INBOX_PORT>" to Team vCGE's Caddy file (backup kept; validated first)
#   4. copies the page to <LAB_ROOT>/www/inbox/
# Needs the Card Shelf (photos go there) and the Reading Room (builds list, shared answer key); the Paint Shop's
# logoFinder.js is used when it is installed. Nothing in the app repo or any published build is touched. Undo lines at the end.
#   Run, from the folder that holds this script:  sudo bash vcge-lab-card-inbox-install.sh
#   Settings (LAB_ROOT, LAB_USER, INBOX_ROOT, INBOX_PORT, SHELF_PORT, VCGE_CADDY): lab.conf, see lab.conf.example.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=${VCGE_LAB_CONF:-$HERE/../lab.conf}
[ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
WWW=$P/www
IN=${INBOX_ROOT:-$P/inbox}
PORT=${INBOX_PORT:-8770}
SHELF=${SHELF_PORT:-8768}
C=${VCGE_CADDY:-/etc/caddy/teams/vcge.caddy}
UNIT=/etc/systemd/system/card-inbox-api.service
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
for f in card-inbox-api.py www/index.html www/inbox.js www/inbox.css; do [ -f "$HERE/$f" ] || { echo "  STOP missing $HERE/$f" >&2; exit 1; }; done
id "$U" >/dev/null 2>&1 || { echo "  STOP no '$U' user on this machine (set LAB_USER in lab.conf)" >&2; exit 1; }
[ -d "$WWW" ] || { echo "  STOP $WWW not found (set LAB_ROOT in lab.conf)" >&2; exit 1; }
case "$IN/" in "$WWW"/*) echo "  STOP INBOX_ROOT ($IN) is inside the web root; put it outside $WWW" >&2; exit 1;; esac
curl -fsS "http://127.0.0.1:$SHELF/shelf/api/health" >/dev/null 2>&1 || { echo "  STOP the Card Shelf is not answering on 127.0.0.1:$SHELF; install it first" >&2; exit 1; }
[ -f "$WWW/bench/bench.js" ] || { echo "  STOP the Reading Room is not installed ($WWW/bench); the inbox uses its build list and scoring" >&2; exit 1; }
[ -f "$WWW/logo-bench/logoFinder.js" ] || echo "  NOTE the Paint Shop is not installed; the inbox runs without the logo check"

echo "1. inbox folders"
for d in "" cards drop; do install -d -o "$U" -g "$U" -m 750 "$IN/$d"; done
echo "  OK   $IN"

echo "2. inbox service"
install -d "$P/bin"
install -o root -g root -m 755 "$HERE/card-inbox-api.py" "$P/bin/card-inbox-api"
cat > "$UNIT" <<UNITFILE
[Unit]
Description=vCGE lab Card Inbox, one card every angle (127.0.0.1:$PORT)
After=network.target card-shelf-api.service

[Service]
User=$U
Group=$U
ExecStart=/usr/bin/python3 $P/bin/card-inbox-api --root $IN --port $PORT --shelf-api http://127.0.0.1:$SHELF
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$IN
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITFILE
systemctl daemon-reload
systemctl enable --now card-inbox-api.service >/dev/null
systemctl restart card-inbox-api.service
up=no; for _ in 1 2 3 4 5; do sleep 1; curl -fsS "http://127.0.0.1:$PORT/inbox/api/health" >/dev/null 2>&1 && { up=yes; break; }; done
[ "$up" = yes ] && echo "  OK   service answers on 127.0.0.1:$PORT" || { echo "  FAIL service not answering: journalctl -u card-inbox-api -n 30" >&2; exit 1; }

echo "3. Caddy route"
if [ ! -f "$C" ]; then
    echo "  WARN $C not found; add 'reverse_proxy /inbox/api/* 127.0.0.1:$PORT' to Team vCGE's site block by hand"
elif grep -q 'inbox/api' "$C"; then
    echo "  OK   $C already routes /inbox/api"
else
    cp -p "$C" "$C.before-inbox"
    # Right after the Card Shelf's route line, so it lands inside Team vCGE's block.
    sed -i "0,/reverse_proxy \/shelf\/api\/\*.*/s//&\n\treverse_proxy \/inbox\/api\/* 127.0.0.1:$PORT/" "$C"
    if grep -q 'inbox/api' "$C" && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
        systemctl reload caddy && echo "  OK   route added and Caddy reloaded (backup $C.before-inbox)"
    else
        cp -p "$C.before-inbox" "$C"; echo "  FAIL could not add the route; the old file is back. Add it by hand after the /shelf/api line." >&2; exit 1
    fi
fi

echo "4. inbox page"
install -d -o "$U" -g "$U" "$WWW/inbox"
install -o "$U" -g "$U" -m 644 "$HERE"/www/* "$WWW/inbox/"
echo "  OK   $WWW/inbox/"

echo
echo "  Done. Open the lab's inbox/ page. Pilots can copy <card>.zip into $IN/drop/ (as $U)."
echo "  To undo: systemctl disable --now card-inbox-api; rm $UNIT $P/bin/card-inbox-api; rm -r $WWW/inbox;"
echo "           cp $C.before-inbox $C && systemctl reload caddy"
echo "  Cards and clips in $IN are left in place on undo; the photos stay on the Card Shelf."
