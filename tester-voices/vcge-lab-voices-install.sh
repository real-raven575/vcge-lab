#!/usr/bin/env bash
# vCGE lab: installs (or updates) Tester Voices, where raven575 drops what testers said (vCGE and Auto-Fixer).
# Idempotent; run again to update. Nothing already saved is touched on an update.
#   1. makes <VOICES_ROOT>/{vcge,auto-fixer}/shots (owner <LAB_USER>, mode 750), outside the web root and every git repo
#   2. installs the service as <LAB_ROOT>/bin/voices-api + a systemd unit (user <LAB_USER>, 127.0.0.1:<VOICES_PORT>,
#      no outside calls, writes only <VOICES_ROOT>)
#   3. adds "reverse_proxy /voices/api/* 127.0.0.1:<VOICES_PORT>" to Team vCGE's Caddy file (backup kept; validated first)
#   4. copies the page to <LAB_ROOT>/www/voices/ (vCGE at voices/, Auto-Fixer at voices/?app=auto-fixer)
# Undo lines are printed at the end.
#   Run, from the folder that holds this script:  sudo bash vcge-lab-voices-install.sh
#   Settings (LAB_ROOT, LAB_USER, VOICES_ROOT, VOICES_PORT, VCGE_CADDY): lab.conf, see lab.conf.example.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=${VCGE_LAB_CONF:-$HERE/../lab.conf}
[ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
WWW=$P/www
V=${VOICES_ROOT:-$P/voices}
PORT=${VOICES_PORT:-8772}
C=${VCGE_CADDY:-/etc/caddy/teams/vcge.caddy}
UNIT=/etc/systemd/system/voices-api.service
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
for f in voices-api.py www/index.html www/voices.js www/voices-core.js www/voices.css www/tv-header-vcge.svg www/tv-header-autofixer.svg www/tv-empty-vcge.svg www/tv-empty-autofixer.svg; do [ -f "$HERE/$f" ] || { echo "  STOP missing $HERE/$f" >&2; exit 1; }; done
id "$U" >/dev/null 2>&1 || { echo "  STOP no '$U' user on this machine (set LAB_USER in lab.conf)" >&2; exit 1; }
[ -d "$WWW" ] || { echo "  STOP $WWW not found (set LAB_ROOT in lab.conf)" >&2; exit 1; }
case "$V/" in "$WWW"/*) echo "  STOP VOICES_ROOT ($V) is inside the web root; put it outside $WWW" >&2; exit 1;; esac
if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && ! curl -fsS "http://127.0.0.1:$PORT/voices/api/health" >/dev/null 2>&1; then
    echo "  STOP something else already answers on 127.0.0.1:$PORT; set VOICES_PORT in lab.conf" >&2; exit 1
fi

echo "1. voices folders (private to the lab user)"
for d in "" vcge vcge/shots auto-fixer auto-fixer/shots; do install -d -o "$U" -g "$U" -m 750 "$V/$d"; done
echo "  OK   $V"

echo "2. voices service"
install -d "$P/bin"
install -o root -g root -m 755 "$HERE/voices-api.py" "$P/bin/voices-api"
cat > "$UNIT" <<UNITFILE
[Unit]
Description=vCGE lab Tester Voices, what testers told us (127.0.0.1:$PORT)
After=network.target

[Service]
User=$U
Group=$U
ExecStart=/usr/bin/python3 $P/bin/voices-api --root $V --port $PORT
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$V
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITFILE
systemctl daemon-reload
systemctl enable --now voices-api.service >/dev/null
systemctl restart voices-api.service
up=no; for _ in 1 2 3 4 5; do sleep 1; curl -fsS "http://127.0.0.1:$PORT/voices/api/health" >/dev/null 2>&1 && { up=yes; break; }; done
[ "$up" = yes ] && echo "  OK   service answers on 127.0.0.1:$PORT" || { echo "  FAIL service not answering: journalctl -u voices-api -n 30" >&2; exit 1; }

echo "3. Caddy route"
if [ ! -f "$C" ]; then
    echo "  WARN $C not found; add 'reverse_proxy /voices/api/* 127.0.0.1:$PORT' to Team vCGE's site block by hand"
elif grep -q 'voices/api' "$C"; then
    echo "  OK   $C already routes /voices/api"
else
    cp -p "$C" "$C.before-voices"
    # Right after the Card Shelf's route line, so it lands inside Team vCGE's block.
    sed -i "0,/reverse_proxy \/shelf\/api\/\*.*/s//&\n\treverse_proxy \/voices\/api\/* 127.0.0.1:$PORT/" "$C"
    if grep -q 'voices/api' "$C" && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
        systemctl reload caddy && echo "  OK   route added and Caddy reloaded (backup $C.before-voices)"
    else
        cp -p "$C.before-voices" "$C"; echo "  FAIL could not add the route; the old file is back. Add it by hand after the /shelf/api line." >&2; exit 1
    fi
fi

echo "4. voices page"
install -d -o "$U" -g "$U" "$WWW/voices"
install -o "$U" -g "$U" -m 644 "$HERE"/www/* "$WWW/voices/"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/voices/api/drops?app=auto-fixer")
[ "$code" = 200 ] && echo "  OK   $WWW/voices/ (both shelves answer)" || echo "  WARN Auto-Fixer's shelf answered $code"

echo
echo "  Done. Open the lab's vcge/voices/ page (Auto-Fixer: vcge/voices/?app=auto-fixer)."
echo "  To undo: systemctl disable --now voices-api; rm $UNIT $P/bin/voices-api; rm -r $WWW/voices;"
echo "           cp $C.before-voices $C && systemctl reload caddy"
echo "  The drops in $V are left in place on undo; delete that folder by hand only if you mean to lose them."
