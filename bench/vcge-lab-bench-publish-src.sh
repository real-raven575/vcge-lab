#!/usr/bin/env bash
# vCGE lab: publishes each build's source tree beside its Vite output, so the OCR test bench can import a build's own
# modules (v/<commit>/src/modules/...). The lab deploys Vite's dist/, which carries only src/vendor and
# src/modules/mod01-shell; the other modules are bundled into assets/. This script copies the repo's src/ for that exact
# commit, from the lab's own git checkout, into v/<commit>/ (files already there, vendor and mod01-shell, are identical
# and are overwritten with the same bytes). The app's build, repo and the published index.html are not touched.
# Idempotent: builds that already have src/modules/mod04-ocr/ocrWorker.js are skipped. Safe to run on a timer.
#   sudo bash vcge-lab-bench-publish-src.sh      (as root: installs a 5-minute systemd timer that runs this as the lab
#                                                 user, publishes every build now, and prints one OK per build)
#   bash vcge-lab-bench-publish-src.sh --once    (as the lab user, what the timer runs: publish only, no install)
#   Settings (LAB_ROOT, LAB_USER, LAB_REPO): lab.conf next to the repo root, see lab.conf.example.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# Settings come from lab.conf (see lab.conf.example at the top of the repo); every value has a default.
CONF=${VCGE_LAB_CONF:-$HERE/../lab.conf}
[ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
WWW=$P/www
REPO=${VCGE_LAB_REPO:-${LAB_REPO:-$P/repo}}
MARK=src/modules/mod04-ocr/ocrWorker.js

if [ "$(id -u)" = 0 ] && [ "${1:-}" != "--once" ]; then
    install -o root -g root -m 755 "$0" "$P/bin/vcge-bench-publish-src"
    cat > /etc/systemd/system/vcge-bench-publish-src.service <<UNIT
[Unit]
Description=vCGE lab: publish each build's source beside its Vite output (for the OCR test bench)

[Service]
Type=oneshot
User=$U
Group=$U
Environment=LAB_ROOT=$P LAB_USER=$U VCGE_LAB_REPO=$REPO VCGE_LAB_CONF=/dev/null
ExecStart=/bin/bash $P/bin/vcge-bench-publish-src --once
UNIT
    cat > /etc/systemd/system/vcge-bench-publish-src.timer <<UNIT
[Unit]
Description=vCGE lab: publish build sources for the OCR test bench every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload
    systemctl enable --now vcge-bench-publish-src.timer >/dev/null
    systemctl start vcge-bench-publish-src.service
    echo "  OK   timer installed (systemctl list-timers vcge-bench-publish-src.timer); first run done, see below"
    sudo -u "$U" env LAB_ROOT="$P" LAB_USER="$U" VCGE_LAB_REPO="$REPO" VCGE_LAB_CONF=/dev/null bash "$0" --once; exit $?
fi

[ -d "$WWW/v" ] || { echo "  STOP $WWW/v not found; is this the lab VM?" >&2; exit 1; }
[ -d "$REPO" ] || { echo "  STOP no git checkout at $REPO (set LAB_REPO in lab.conf)" >&2; exit 1; }
git -c safe.directory='*' -C "$REPO" fetch -q --all 2>/dev/null || true     # newest commits, if the checkout has a remote
done=0; skipped=0; missing=0
for dir in "$WWW"/v/*/; do
    short=$(basename "$dir")
    [ -f "$dir/version.json" ] || continue
    if [ -f "$dir/$MARK" ]; then skipped=$((skipped + 1)); continue; fi
    if ! git -c safe.directory='*' -C "$REPO" cat-file -e "$short^{commit}" 2>/dev/null; then
        echo "  SKIP $short: commit not in the lab checkout"; missing=$((missing + 1)); continue
    fi
    tmp=$(mktemp -d "$dir/.src-XXXXXX")
    if git -c safe.directory='*' -C "$REPO" archive "$short" src | tar -x -C "$tmp" && [ -f "$tmp/$MARK" ]; then
        cp -a "$tmp/src/." "$dir/src/"
        rm -rf "$tmp"; done=$((done + 1)); echo "  OK   $short: source published"
    else
        rm -rf "$tmp"; echo "  SKIP $short: no src/ with $MARK at that commit"; missing=$((missing + 1))
    fi
done
echo "  Done: $done published, $skipped already had source, $missing skipped."
