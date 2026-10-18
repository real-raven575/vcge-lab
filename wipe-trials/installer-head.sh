#!/usr/bin/env bash
# vCGE lab install (2026-10-17): the Trials pages (first trial: Wipe Trials, the cross-browser wipe guide), the
# save service behind them, and a "Wipe Trials" link on the versions page.
#   Pages:    <LAB_ROOT>/www/testing/            served by Caddy at /testing/ (static, like the builds)
#   Reports:  <LAB_ROOT>/www/testing/reports/    YYYYMMDD-HHMM-SS_<trial>.md, UTC, never overwritten
#   Drafts:   <LAB_ROOT>/testing/drafts/         autosaved while a tester works (not served)
#   Service:  <LAB_ROOT>/bin/vcge-testing-api    Python 3 standard library, 127.0.0.1:<TRIALS_PORT>, as <LAB_USER>,
#             systemd unit vcge-testing-api; Caddy proxies /testing/api/* to it (three lines added after the site's
#             "root" line; old Caddyfile kept as Caddyfile.before-testing; nothing changes if "caddy validate" fails)
#   Versions page: adds the link next to "Open the newest build" in bin/vcge-lab-index (old copy .before-testing)
# Lab only: nothing here goes into the app, its repo or its storage. Safe to run again (files are replaced, the
# Caddyfile and the versions page are only changed once).
#   Run: sudo bash vcge-lab-testing-install.sh
#   Settings (LAB_ROOT, LAB_USER, TRIALS_PORT, CADDYFILE) come from lab.conf beside this installer or at the repo root
#   (see lab.conf.example), or VCGE_LAB_CONF=<file>; every value has a default.
set -euo pipefail
R=${VCGE_TEST_ROOT:-}   # testing only: work under this folder, skip the user switch, systemd and Caddy reload
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=${VCGE_LAB_CONF:-}
[ -n "$CONF" ] || for c in "$HERE/lab.conf" "$HERE/../lab.conf"; do [ -f "$c" ] && { CONF=$c; break; }; done
[ -n "$CONF" ] && [ -f "$CONF" ] && . "$CONF"
P=${LAB_ROOT:-/srv/vcge-lab}
U=${LAB_USER:-vcge}
W="$R$P/www/testing"
B="$R$P/bin"
D="$R$P/testing/drafts"
CADDYFILE=${VCGE_CADDYFILE:-$R${CADDYFILE:-/etc/caddy/Caddyfile}}
PORT=${TRIALS_PORT:-8766}
[ -n "$R" ] || [ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
command -v python3 >/dev/null || { echo "  STOP python3 is needed and was not found. Nothing was changed." >&2; exit 1; }
mkdir -p "$W/trials" "$W/reports" "$D" "$B"
