#!/usr/bin/env bash
# vCGE lab: installs (or updates) the OCR test bench on the lab VM. Idempotent; run again to update the files.
#   1. copies the bench page to <LAB_ROOT>/www/bench/ (served by Caddy like every other lab file)
#   2. makes the sample, truth and run folders under www/bench/data/ (owner <LAB_USER>)
#   3. installs the file service as <LAB_ROOT>/bin/vcge-bench-api + a systemd unit (user <LAB_USER>, 127.0.0.1:<BENCH_PORT>)
#   4. adds "handle /bench/api/* { reverse_proxy 127.0.0.1:8765 }" to the Caddyfile (backup kept; validated first)
#   5. adds an "OCR test bench" link to the versions page script vcge-lab-index (backup kept) and rebuilds the page
# Nothing in the app repo or in any published build is touched. Undo lines are printed at the end.
#   Run, from the folder that holds this script and its files:  sudo bash vcge-lab-bench-install.sh
#   Settings (LAB_ROOT, LAB_USER, BENCH_PORT, CADDYFILE): lab.conf, see lab.conf.example.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# Settings come from lab.conf (see lab.conf.example at the top of the repo); every value has a default.
CONF=${VCGE_LAB_CONF:-$HERE/../lab.conf}
[ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
WWW=$P/www
PORT=${BENCH_PORT:-8765}
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
for f in www/index.html www/bench.js www/bench.css vcge-bench-api.py; do [ -f "$HERE/$f" ] || { echo "  STOP missing $HERE/$f" >&2; exit 1; }; done
id "$U" >/dev/null 2>&1 || { echo "  STOP no '$U' user on this machine (set LAB_USER in lab.conf)" >&2; exit 1; }
[ -d "$WWW/v" ] || { echo "  STOP $WWW/v not found (set LAB_ROOT in lab.conf to the folder that holds www/v/)" >&2; exit 1; }

echo "1. bench page"
install -d -o "$U" -g "$U" "$WWW/bench"
install -o "$U" -g "$U" -m 644 "$HERE"/www/* "$WWW/bench/"    # every page file (index, script, styles, images)

echo "2. data folders"
for d in samples/business-cards samples/handwriting truth/business-cards truth/handwriting runs; do install -d -o "$U" -g "$U" "$WWW/bench/data/$d"; done

echo "3. file service"
install -d "$P/bin"
install -o root -g root -m 755 "$HERE/vcge-bench-api.py" "$P/bin/vcge-bench-api"
cat > /etc/systemd/system/vcge-bench-api.service <<UNIT
[Unit]
Description=vCGE lab OCR test bench file service (127.0.0.1:$PORT)
After=network.target

[Service]
User=$U
Group=$U
ExecStart=/usr/bin/python3 $P/bin/vcge-bench-api --root $WWW --port $PORT
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$WWW/bench/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now vcge-bench-api.service >/dev/null
systemctl restart vcge-bench-api.service
sleep 1
curl -fsS "http://127.0.0.1:$PORT/bench/api/health" >/dev/null && echo "  OK   service answers on 127.0.0.1:$PORT" || { echo "  FAIL service not answering: journalctl -u vcge-bench-api" >&2; exit 1; }

echo "4. Caddy route"
C=${CADDYFILE:-/etc/caddy/Caddyfile}
if grep -q 'bench/api' "$C"; then
    echo "  OK   Caddyfile already routes /bench/api"
else
    cp -p "$C" "$C.before-bench"
    # Insert the handle block right after the first line that opens a site block ("host {" or "{" after an address).
    python3 - "$C" "$PORT" <<'PY'
import re, sys
path, port = sys.argv[1], sys.argv[2]
lines = open(path).read().split('\n')
for i, line in enumerate(lines):
    s = line.strip()
    if s.endswith('{') and not s.startswith('#') and not s.startswith('(') and s != '{':   # a site address line, not the global block
        lines.insert(i + 1, '\thandle /bench/api/* {\n\t\treverse_proxy 127.0.0.1:%s\n\t}' % port)
        break
else:
    sys.exit('  STOP no site block found in the Caddyfile; add the handle block by hand')
open(path, 'w').write('\n'.join(lines))
PY
    if caddy validate --config "$C" --adapter caddyfile >/dev/null 2>&1; then
        systemctl reload caddy && echo "  OK   Caddyfile updated and reloaded (backup $C.before-bench)"
    else
        cp -p "$C.before-bench" "$C"; echo "  FAIL the edited Caddyfile did not validate; the old one is back. Add this inside the site block by hand:" >&2
        printf '\thandle /bench/api/* {\n\t\treverse_proxy 127.0.0.1:%s\n\t}\n' "$PORT" >&2; exit 1
    fi
fi

echo "5. link on the versions page"
F=$P/bin/vcge-lab-index
if [ -f "$F" ]; then
    if grep -q 'bench/' "$F"; then echo "  OK   versions page already links the bench"
    else
        cp -p "$F" "$F.before-bench"
        sed -i 's|<a href="latest/">Open the newest build</a>\.|<a href="latest/">Open the newest build</a>. <a href="bench/">OCR test bench</a>.|' "$F"
        grep -q 'bench/' "$F" || { cp -p "$F.before-bench" "$F"; echo "  FAIL could not add the link; old script restored (open /bench/ directly)" >&2; }
    fi
    sudo -u "$U" "$F" "$WWW" && grep -q 'bench/' "$WWW/index.html" && echo "  OK   versions page rebuilt with the bench link" || echo "  WARN versions page not rebuilt; open /bench/ directly"
else
    echo "  WARN $F not found; open /bench/ directly"
fi

echo
echo "  Done. Open the lab's /bench/ page. Samples go in $WWW/bench/data/samples/{business-cards,handwriting}."
echo "  To undo: systemctl disable --now vcge-bench-api; rm /etc/systemd/system/vcge-bench-api.service $P/bin/vcge-bench-api;"
echo "           cp $C.before-bench $C && systemctl reload caddy; cp $F.before-bench $F && sudo -u vcge $F $WWW; rm -r $WWW/bench"
