#!/usr/bin/env bash
# vCGE lab: installs (or updates) the Night Shift: a nightly robot that scores the newest build on made-up cards.
# Idempotent; run again to update. Saved scoreboards, factory sets and Print & Snap photos are never touched.
#   1. makes <NIGHT_ROOT>/{snaps,scores,export} and <FACTORY_ROOT> (owner <LAB_USER>, mode 750), outside the web root
#   2. checks Node 18+ (installs nodejs + npm with apt if missing) and puts Playwright + its Chromium in the kit folder
#   3. copies the kit to <LAB_ROOT>/bin/night-shift/ (robot runner, Card Factory, pages) and writes night-shift.env
#   4. installs the read-only file service (user <LAB_USER>, 127.0.0.1:<NIGHT_PORT>, writes nothing)
#   5. adds "reverse_proxy /night-shift/* 127.0.0.1:<NIGHT_PORT>" to Team vCGE's Caddy file (backup kept; validated)
#   6. installs a timer that runs night-shift.sh as <LAB_USER> at 02:00 America/New_York every night
# Undo lines are printed at the end.
#   Run, from the folder that holds this script (the vcge-lab repo's night-shift/):  sudo bash vcge-lab-night-shift-install.sh
#   Settings (lab.conf): LAB_ROOT, LAB_USER, NIGHT_ROOT, NIGHT_PORT, FACTORY_ROOT, FACTORY_COUNT, FACTORY_FONTS,
#   SNAP_DROP (the Print & Snap drop folder; empty = none yet), NIGHT_EXPORT (where the morning summary goes).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=${VCGE_LAB_CONF:-$HERE/../lab.conf}
[ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
WWW=$P/www
N=${NIGHT_ROOT:-$P/night-shift}
F=${FACTORY_ROOT:-$P/factory}
PORT=${NIGHT_PORT:-8773}
C=${VCGE_CADDY:-/etc/caddy/teams/vcge.caddy}
KIT=$P/bin/night-shift
PW_VERSION=1.49.1
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
for f in night-shift-api.py night-shift.mjs night-shift.sh www/robot.html www/robot.js www/score.js www/index.html www/board.js www/night-shift.css ../card-factory/factory.py ../card-factory/people.py; do
    [ -f "$HERE/$f" ] || { echo "  STOP missing $HERE/$f" >&2; exit 1; }
done
id "$U" >/dev/null 2>&1 || { echo "  STOP no '$U' user on this machine (set LAB_USER in lab.conf)" >&2; exit 1; }
[ -d "$WWW" ] || { echo "  STOP $WWW not found (set LAB_ROOT in lab.conf)" >&2; exit 1; }
for d in "$N" "$F"; do case "$d/" in "$WWW"/*) echo "  STOP $d is inside the web root; put it outside $WWW" >&2; exit 1;; esac; done
python3 -c 'import PIL' 2>/dev/null || { echo "  STOP Pillow missing (apt-get install python3-pil)" >&2; exit 1; }
if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && ! curl -fsS "http://127.0.0.1:$PORT/night-shift/api/health" >/dev/null 2>&1; then
    echo "  STOP something else already answers on 127.0.0.1:$PORT; set NIGHT_PORT in lab.conf" >&2; exit 1
fi

echo "1. folders (private to the lab user)"
for d in "$N" "$N/snaps" "$N/scores" "$N/browsers" "$F"; do install -d -o "$U" -g "$U" -m 750 "$d"; done
# The morning summary is numbers only, so other lab users may read it: export 755, and its parent may be passed through (751, no listing)
chmod 751 "$N"; install -d -o "$U" -g "$U" -m 755 "$N/export"
[ -d "${NIGHT_EXPORT:-$N/export}" ] || install -d -o "$U" -g "$U" -m 755 "${NIGHT_EXPORT:-$N/export}"
echo "  OK   $N and $F (export readable)"

echo "2. Node and Playwright"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
    echo "  NOTE installing nodejs and npm with apt"; apt-get install -y nodejs npm >/dev/null
fi
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { echo "  STOP Node 18 or newer is needed" >&2; exit 1; }
install -d -o "$U" -g "$U" "$KIT"
if [ ! -d "$KIT/node_modules/playwright" ] || [ "$(node -p "require('$KIT/node_modules/playwright/package.json').version" 2>/dev/null)" != "$PW_VERSION" ]; then
    sudo -u "$U" bash -c "cd '$KIT' && npm install --no-audit --no-fund --silent playwright@$PW_VERSION" >/dev/null
fi
sudo -u "$U" env PLAYWRIGHT_BROWSERS_PATH="$N/browsers" "$KIT/node_modules/.bin/playwright" install chromium >/dev/null
"$KIT/node_modules/.bin/playwright" install-deps chromium >/dev/null 2>&1 || echo "  WARN could not install Chromium's system libraries; the robot may not start (run: $KIT/node_modules/.bin/playwright install-deps chromium)"
echo "  OK   Node $(node -v), Playwright $PW_VERSION, Chromium in $N/browsers"

echo "3. kit"
install -d -o "$U" -g "$U" "$KIT/www" "$KIT/card-factory"
install -o root -g root -m 755 "$HERE/night-shift.sh" "$HERE/night-shift.mjs" "$HERE/night-shift-api.py" "$KIT/"
install -o root -g root -m 644 "$HERE"/www/* "$KIT/www/"
install -o root -g root -m 644 "$HERE/../card-factory/factory.py" "$HERE/../card-factory/people.py" "$KIT/card-factory/"
cat > "$KIT/night-shift.env" <<ENV
NIGHT_ROOT=$N
FACTORY_ROOT=$F
NIGHT_PORT=$PORT
FACTORY_COUNT=${FACTORY_COUNT:-300}
FACTORY_KEEP_DAYS=${FACTORY_KEEP_DAYS:-14}
FACTORY_FONTS="${FACTORY_FONTS:-/usr/share/fonts /home/sandbox/vcge/lab-fonts/google}"
FACTORY_BACKGROUNDS=${FACTORY_BACKGROUNDS:-}
SNAP_DROP=${SNAP_DROP:-}
NIGHT_EXPORT=${NIGHT_EXPORT:-$N/export}
export PLAYWRIGHT_BROWSERS_PATH=$N/browsers
ENV
chmod 644 "$KIT/night-shift.env"
echo "  OK   $KIT"

echo "4. file service (read-only)"
UNIT=/etc/systemd/system/night-shift-api.service
cat > "$UNIT" <<UNITFILE
[Unit]
Description=vCGE lab Night Shift file service, read-only (127.0.0.1:$PORT)
After=network.target

[Service]
User=$U
Group=$U
ExecStart=/usr/bin/python3 $KIT/night-shift-api.py --www $WWW --factory $F --snaps $N/snaps --scores $N/scores --page $KIT/www --port $PORT
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITFILE
systemctl daemon-reload
systemctl enable --now night-shift-api.service >/dev/null
systemctl restart night-shift-api.service
up=no; for _ in 1 2 3 4 5; do sleep 1; curl -fsS "http://127.0.0.1:$PORT/night-shift/api/health" >/dev/null 2>&1 && { up=yes; break; }; done
[ "$up" = yes ] && echo "  OK   service answers on 127.0.0.1:$PORT" || { echo "  FAIL service not answering: journalctl -u night-shift-api -n 30" >&2; exit 1; }

echo "5. Caddy route"
if [ ! -f "$C" ]; then
    echo "  WARN $C not found; add 'reverse_proxy /night-shift/* 127.0.0.1:$PORT' to Team vCGE's site block by hand"
elif grep -q 'night-shift/' "$C"; then
    echo "  OK   $C already routes /night-shift/"
else
    cp -p "$C" "$C.before-night-shift"
    sed -i "0,/reverse_proxy \/shelf\/api\/\*.*/s//&\n\treverse_proxy \/night-shift\/* 127.0.0.1:$PORT/" "$C"
    if grep -q 'night-shift/' "$C" && caddy validate --config "${CADDYFILE:-/etc/caddy/Caddyfile}" --adapter caddyfile >/dev/null 2>&1; then
        systemctl reload caddy && echo "  OK   route added and Caddy reloaded (backup $C.before-night-shift)"
    else
        cp -p "$C.before-night-shift" "$C"; echo "  FAIL could not add the route; the old file is back. Add it by hand after the /shelf/api line." >&2; exit 1
    fi
fi

echo "6. nightly timer (02:00 Eastern)"
cat > /etc/systemd/system/night-shift.service <<UNITFILE
[Unit]
Description=vCGE lab Night Shift: make tonight's cards and score the newest build
After=night-shift-api.service
Wants=night-shift-api.service

[Service]
Type=oneshot
User=$U
Group=$U
Nice=10
TimeoutStartSec=6h
ExecStart=/bin/bash $KIT/night-shift.sh
UNITFILE
cat > /etc/systemd/system/night-shift.timer <<UNITFILE
[Unit]
Description=vCGE lab Night Shift, every night at 02:00 Eastern

[Timer]
OnCalendar=*-*-* 02:00:00 America/New_York
Persistent=true

[Install]
WantedBy=timers.target
UNITFILE
systemctl daemon-reload
systemctl enable --now night-shift.timer >/dev/null
echo "  OK   next run: $(systemctl show night-shift.timer -p NextElapseUSecRealtime --value 2>/dev/null || echo 'see systemctl list-timers')"

echo
echo "  Done. Scoreboard page: the lab's vcge/night-shift/. Run one now (takes a while): sudo systemctl start night-shift"
echo "  Logs: journalctl -u night-shift -n 80. Summary for the morning reader: ${NIGHT_EXPORT:-$N/export}/night-shift-latest.md"
echo "  To undo: systemctl disable --now night-shift.timer night-shift-api; rm /etc/systemd/system/night-shift.{service,timer} $UNIT;"
echo "           rm -r $KIT; cp $C.before-night-shift $C && systemctl reload caddy"
echo "  Scores, factory sets and photos in $N and $F are left in place on undo; delete them by hand only if you mean to."
