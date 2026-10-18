# ---- permissions and the service
chmod 755 "$B/vcge-testing-api"
if [ -z "$R" ]; then
    id "$U" >/dev/null 2>&1 || { echo "  STOP user $U does not exist (set LAB_USER in lab.conf). Nothing else was changed." >&2; exit 1; }
    chown -R "$U:$U" "$W" "$R$P/testing"
    cat > /etc/systemd/system/vcge-testing-api.service <<VCGE_UNIT
[Unit]
Description=vCGE lab: save service for the Trials pages (reports and drafts)
After=network.target

[Service]
User=$U
Group=$U
ExecStart=/usr/bin/env python3 $P/bin/vcge-testing-api --reports $P/www/testing/reports --drafts $P/testing/drafts --port $PORT
Restart=on-failure
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=$P/www/testing/reports $P/testing/drafts

[Install]
WantedBy=multi-user.target
VCGE_UNIT
    systemctl daemon-reload
    systemctl enable --now vcge-testing-api >/dev/null
    systemctl restart vcge-testing-api
    sleep 1
    if curl -fsS "http://127.0.0.1:$PORT/testing/api/health" >/dev/null 2>&1; then echo "  OK   save service answers on 127.0.0.1:$PORT"
    else echo "  FAIL save service not answering: journalctl -u vcge-testing-api -n 30" >&2; fi
fi

# ---- Caddy: proxy /testing/api/* to the service, no caching under /testing/, reports shown as text
if [ ! -f "$CADDYFILE" ]; then
    echo "  SKIP no Caddyfile at $CADDYFILE: add these lines to the lab site yourself:" >&2
    echo "       reverse_proxy /testing/api/* 127.0.0.1:$PORT" >&2
elif grep -q "reverse_proxy /testing/api/\*" "$CADDYFILE"; then
    echo "  OK   Caddyfile already routes /testing/api/"
else
    n=$(grep -cE '^[[:space:]]*root[[:space:]]' "$CADDYFILE" || true)
    if [ "$n" != 1 ]; then
        echo "  SKIP Caddyfile has $n 'root' lines (expected 1), so it was not changed. Add these lines inside the lab site block:" >&2
        echo "       reverse_proxy /testing/api/* 127.0.0.1:$PORT" >&2
        echo "       header /testing/* Cache-Control no-store" >&2
        echo "       header /testing/reports/* Content-Type \"text/plain; charset=utf-8\"" >&2
    else
        cp -p "$CADDYFILE" "$CADDYFILE.before-testing"
        python3 - "$CADDYFILE" "$PORT" <<'VCGE_PY'
import re, sys
path, port = sys.argv[1], sys.argv[2]
lines = open(path).read().split('\n')
out = []
for line in lines:
    out.append(line)
    if re.match(r'^\s*root\s', line):
        indent = re.match(r'^\s*', line).group(0)
        out += [f'{indent}reverse_proxy /testing/api/* 127.0.0.1:{port}',
                f'{indent}header /testing/* Cache-Control no-store',
                f'{indent}header /testing/reports/* Content-Type "text/plain; charset=utf-8"']
open(path, 'w').write('\n'.join(out))
VCGE_PY
        if command -v caddy >/dev/null; then
            if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
                [ -n "$R" ] || systemctl reload caddy
                echo "  OK   Caddyfile routes /testing/api/ to the service (old copy: $CADDYFILE.before-testing)"
            else
                cp -p "$CADDYFILE.before-testing" "$CADDYFILE"
                echo "  STOP the changed Caddyfile did not validate; the old one is back and Caddy was not touched." >&2
                echo "       Run: caddy validate --config $CADDYFILE --adapter caddyfile   to see why." >&2
                exit 1
            fi
        else
            [ -n "$R" ] && echo "  OK   (test) Caddyfile edited; caddy not installed here so it was not validated" \
                        || { cp -p "$CADDYFILE.before-testing" "$CADDYFILE"; echo "  STOP caddy command not found; Caddyfile left as it was." >&2; exit 1; }
        fi
    fi
fi

# ---- the versions page: a link next to "Open the newest build"
F="$B/vcge-lab-index"
if [ ! -f "$F" ]; then
    echo "  SKIP $F not found: no link added to the versions page (open /testing/ by hand)"
elif grep -q 'href="testing/"' "$F"; then
    echo "  OK   versions page already links to Wipe Trials"
elif grep -q '<a href="latest/">Open the newest build</a>\.' "$F"; then
    cp -p "$F" "$F.before-testing"
    sed -i 's|<a href="latest/">Open the newest build</a>\.|<a href="latest/">Open the newest build</a>. <a href="testing/">Wipe Trials</a>.|' "$F"
    if [ -n "$R" ]; then python3 "$F" "$R$P/www" 2>/dev/null || true; else sudo -u "$U" "$F" "$P/www"; fi
    grep -q 'href="testing/"' "$R$P/www/index.html" 2>/dev/null && echo "  OK   versions page links to Wipe Trials (old script: $F.before-testing)" \
        || echo "  NOTE link added to $F; it shows after the next page rebuild"
else
    echo "  SKIP versions page script is not the expected version; no link added (open /testing/ by hand)"
fi

echo
echo "  Open https://<lab address>/testing/ ; reports land in $P/www/testing/reports/ (also at /testing/reports/<name>)."
echo "  To undo: systemctl disable --now vcge-testing-api; cp $CADDYFILE.before-testing $CADDYFILE; systemctl reload caddy;"
echo "           cp $F.before-testing $F; rm -r $P/www/testing $P/testing"
