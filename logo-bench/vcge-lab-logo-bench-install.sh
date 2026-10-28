#!/usr/bin/env bash
# vCGE lab: installs (or updates) the logo bench, "The Paint Shop", on the lab VM. Idempotent; run again to update.
# It only copies the page's static files to <LAB_ROOT>/www/logo-bench/ (served by Caddy like every other lab file):
# no service, no port, no Caddy change. A copy of the old folder is kept, and the undo line is printed at the end.
#   Run, from the folder that holds this script:  sudo bash vcge-lab-logo-bench-install.sh
#   Settings (LAB_ROOT, LAB_USER): lab.conf, see lab.conf.example.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=${VCGE_LAB_CONF:-$HERE/../lab.conf}
[ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
WWW=$P/www
FILES="index.html logo.js logo.css logoFinder.js posterize.js"
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
for f in $FILES; do [ -f "$HERE/www/$f" ] || { echo "  STOP missing $HERE/www/$f" >&2; exit 1; }; done
id "$U" >/dev/null 2>&1 || { echo "  STOP no '$U' user on this machine (set LAB_USER in lab.conf)" >&2; exit 1; }
[ -d "$WWW/v" ] || { echo "  STOP $WWW/v not found (set LAB_ROOT in lab.conf to the folder that holds www/v/)" >&2; exit 1; }

if [ -d "$WWW/logo-bench" ]; then rm -rf "$WWW/logo-bench.before-update"; cp -a "$WWW/logo-bench" "$WWW/logo-bench.before-update"; fi
install -d -o "$U" -g "$U" "$WWW/logo-bench"
for f in $FILES; do install -o "$U" -g "$U" -m 644 "$HERE/www/$f" "$WWW/logo-bench/$f"; done
echo "  OK   page files in $WWW/logo-bench/"
ls "$WWW"/v/*/src/modules/mod06-gui/card3dView.js >/dev/null 2>&1 && echo "  OK   at least one build has its source published" \
  || echo "  WARN no build has its source published yet (bench/vcge-lab-bench-publish-src.sh); the bench needs it"
echo
echo "  Done. Open the lab's logo-bench/ page."
echo "  To undo: rm -r $WWW/logo-bench$( [ -d "$WWW/logo-bench.before-update" ] && echo " && mv $WWW/logo-bench.before-update $WWW/logo-bench")"
