#!/usr/bin/env bash
# Flight Deck: installs (or updates) the Test Bench, one engine with one bench per team (benches/<team>.json: vCGE,
# Auto-Fixer). Idempotent; run again to update the lists: the seeds are replaced, everything raven575 recorded stays.
#   1. makes <TESTBENCH_ROOT>/evidence (owner <LAB_USER>), outside the web root and every git repo
#   2. installs the service as <LAB_ROOT>/bin/testbench-api + the seeds in <LAB_ROOT>/bin/testbench-benches/, and a
#      systemd unit (user <LAB_USER>, 127.0.0.1:<TESTBENCH_PORT>). Its only outside call reads public GitHub Actions
#      results from api.github.com every 15 minutes.
#   3. adds "reverse_proxy /testbench/api/* 127.0.0.1:<TESTBENCH_PORT>" to Team vCGE's Caddy file (backup kept;
#      validated first)
#   4. copies the page to <LAB_ROOT>/www/testbench/
# Nothing in the app repo or any published build is touched. Undo lines at the end.
#   Run, from the folder that holds this script:  sudo bash vcge-lab-testbench-install.sh
#   Settings (LAB_ROOT, LAB_USER, TESTBENCH_ROOT, TESTBENCH_PORT, VCGE_CADDY): lab.conf, see lab.conf.example.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=${VCGE_LAB_CONF:-$HERE/../lab.conf}
[ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
WWW=$P/www
TB=${TESTBENCH_ROOT:-$P/testbench}
PORT=${TESTBENCH_PORT:-8771}
C=${VCGE_CADDY:-/etc/caddy/teams/vcge.caddy}
UNIT=/etc/systemd/system/testbench-api.service
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
for f in testbench-api.py benches/vcge.json www/index.html www/testbench.js www/testbench.css; do [ -f "$HERE/$f" ] || { echo "  STOP missing $HERE/$f" >&2; exit 1; }; done
for f in "$HERE"/benches/*.json; do
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["items"] and d["title"]' "$f" 2>/dev/null || { echo "  STOP $f is not a valid bench. Nothing changed." >&2; exit 1; }
done
id "$U" >/dev/null 2>&1 || { echo "  STOP no '$U' user on this machine (set LAB_USER in lab.conf)" >&2; exit 1; }
[ -d "$WWW" ] || { echo "  STOP $WWW not found (set LAB_ROOT in lab.conf)" >&2; exit 1; }
case "$TB/" in "$WWW"/*) echo "  STOP TESTBENCH_ROOT ($TB) is inside the web root; put it outside $WWW" >&2; exit 1;; esac
if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && ! curl -fsS "http://127.0.0.1:$PORT/testbench/api/health" >/dev/null 2>&1; then
    echo "  STOP something else already answers on 127.0.0.1:$PORT; set TESTBENCH_PORT in lab.conf" >&2; exit 1
fi

echo "1. Test Bench folders"
for d in "" evidence; do install -d -o "$U" -g "$U" -m 750 "$TB/$d"; done
echo "  OK   $TB"

echo "2. Test Bench service"
install -d "$P/bin"
install -o root -g root -m 755 "$HERE/testbench-api.py" "$P/bin/testbench-api"
install -d -o root -g root -m 755 "$P/bin/testbench-benches"
install -o root -g root -m 644 "$HERE"/benches/*.json "$P/bin/testbench-benches/"
cat > "$UNIT" <<UNITFILE
[Unit]
Description=vCGE lab Test Bench, every open test in one list (127.0.0.1:$PORT)
After=network-online.target
Wants=network-online.target

[Service]
User=$U
Group=$U
ExecStart=/usr/bin/python3 $P/bin/testbench-api --root $TB --seeds $P/bin/testbench-benches --port $PORT
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$TB
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITFILE
systemctl daemon-reload
systemctl enable --now testbench-api.service >/dev/null
systemctl restart testbench-api.service
up=no; for _ in 1 2 3 4 5; do sleep 1; curl -fsS "http://127.0.0.1:$PORT/testbench/api/health" >/dev/null 2>&1 && { up=yes; break; }; done
[ "$up" = yes ] && echo "  OK   service answers on 127.0.0.1:$PORT" || { echo "  FAIL service not answering: journalctl -u testbench-api -n 30" >&2; exit 1; }
for f in "$HERE"/benches/*.json; do
    b=$(basename "$f" .json)
    n=$(curl -fsS "http://127.0.0.1:$PORT/testbench/api/items?bench=$b" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["items"]))')
    echo "  OK   bench $b: $n on the list"
done

echo "3. Caddy route"
if [ ! -f "$C" ]; then
    echo "  WARN $C not found; add 'reverse_proxy /testbench/api/* 127.0.0.1:$PORT' to Team vCGE's site block by hand"
elif grep -q 'testbench/api' "$C"; then
    echo "  OK   $C already routes /testbench/api"
else
    cp -p "$C" "$C.before-testbench"
    # Right after the Card Shelf's route line, so it lands inside Team vCGE's block.
    sed -i "0,/reverse_proxy \/shelf\/api\/\*.*/s//&\n\treverse_proxy \/testbench\/api\/* 127.0.0.1:$PORT/" "$C"
    if grep -q 'testbench/api' "$C" && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
        systemctl reload caddy && echo "  OK   route added and Caddy reloaded (backup $C.before-testbench)"
    else
        cp -p "$C.before-testbench" "$C"; echo "  FAIL could not add the route; the old file is back. Add it by hand after the /shelf/api line." >&2; exit 1
    fi
fi

echo "4. Test Bench page"
install -d -o "$U" -g "$U" "$WWW/testbench"
install -o "$U" -g "$U" -m 644 "$HERE"/www/* "$WWW/testbench/"
echo "  OK   $WWW/testbench/"

echo
echo "  Done. Open https://<lab>/vcge/testbench/ (vCGE) and https://<lab>/vcge/testbench/?bench=auto-fixer (Auto-Fixer)."
echo "  To undo: systemctl disable --now testbench-api; rm -r $UNIT $P/bin/testbench-api $P/bin/testbench-benches;"
echo "           rm -r $WWW/testbench; cp $C.before-testbench $C && systemctl reload caddy"
echo "  What raven575 recorded (notes, results, pictures) in $TB is left in place on undo."
