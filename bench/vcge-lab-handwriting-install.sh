#!/usr/bin/env bash
# vCGE lab: adds The Scriptorium, Glyph's handwriting bench, next to the Reading Room. An add-on only:
#   1. checks the shipped page files against their reviewed sha256 (handwriting.SUMS beside this script)
#   2. copies handwriting.html, handwriting.js, handwriting.css and hwscore.js to <lab>/www/bench/ (owner vcge, 644).
#      The Reading Room's own files (index.html, bench.js, bench.css, setrun.js, ...) are NOT touched.
#   3. if a samples/ folder sits beside this script (made by Glyph, never from a repository): copies its images into
#      www/bench/data/samples/handwriting/ (an existing file of the same name is kept) and, from samples/manifest.json,
#      saves each new sample's written text as its truth, marked "not checked yet" (existing truth is never changed)
#   4. checks the page and the bench service answer
# No service, Caddy, port or file-service change. Undo lines are printed at the end.
#   Run through the lab's sudo gate, with this folder at /home/sandbox/vcge/lab-installers/handwriting/:
#     sudo /usr/local/sbin/vcge-lab-run handwriting/vcge-lab-handwriting-install.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
P=${LAB:-/srv/dataprojects/vcge}
WWW=$P/www
PORT=${BENCH_PORT:-8765}
CHECK_URL=${CHECK_URL:-http://127.0.0.1:8080/vcge}
PAGE="handwriting.html handwriting.js handwriting.css hwscore.js"
LAB_USER=${LAB_USER:-vcge}

[ "$(id -u)" = 0 ] || [ -n "${HW_TEST:-}" ] || { echo "Run through the sudo gate: sudo /usr/local/sbin/vcge-lab-run handwriting/vcge-lab-handwriting-install.sh" >&2; exit 1; }
total=4; step() { local n=$1; shift; local bar=""; for i in $(seq 1 $total); do [ "$i" -le "$n" ] && bar="$bar#" || bar="$bar."; done; echo "[$bar] $n of $total  $*"; }

step 1 "check the files"
(cd "$HERE" && sha256sum --quiet -c handwriting.SUMS) || { echo "  STOP the files differ from the reviewed ones (sha256 check above). Nothing changed." >&2; exit 1; }
[ -d "$WWW/bench" ] && [ -f "$WWW/bench/bench.js" ] || { echo "  STOP the Reading Room is not installed here ($WWW/bench). Nothing changed." >&2; exit 1; }
id "$LAB_USER" >/dev/null 2>&1 || [ -n "${HW_TEST:-}" ] || { echo "  STOP no '$LAB_USER' user on this machine; is this the lab VM?" >&2; exit 1; }
echo "  OK   sha256 match"

step 2 "page files"
NEW=""; for f in $PAGE; do [ -f "$WWW/bench/$f" ] || NEW="$NEW $WWW/bench/$f"; done
OWN=(); [ -n "${HW_TEST:-}" ] || OWN=(-o "$LAB_USER" -g "$LAB_USER")
install "${OWN[@]}" -m 644 $(for f in $PAGE; do printf '%s ' "$HERE/www/$f"; done) "$WWW/bench/"
echo "  OK   $WWW/bench/{$(echo $PAGE | tr ' ' ',')}"

step 3 "samples"
ADDED=""
if [ -d "$HERE/samples" ]; then
    S=$WWW/bench/data/samples/handwriting; T=$WWW/bench/data/truth/handwriting
    install "${OWN[@]}" -d -m 755 "$S" "$T"
    for f in "$HERE"/samples/*.jpg "$HERE"/samples/*.png; do
        [ -f "$f" ] || continue; b=$(basename "$f")
        if [ -e "$S/$b" ]; then continue; fi
        install "${OWN[@]}" -m 644 "$f" "$S/$b"; ADDED="$ADDED $S/$b"
    done
    if [ -f "$HERE/samples/manifest.json" ]; then
        python3 -I - "$HERE/samples/manifest.json" "$T" <<'PY'
import json, os, sys, time
man, tdir = sys.argv[1], sys.argv[2]
n = 0
for s in json.load(open(man)):
    out = os.path.join(tdir, s['name'] + '.json')
    if os.path.exists(out):
        continue
    t = {'lines': [{'text': l, 'role': 'note'} for l in s['lines']], 'hw': {'style': s['style'], 'case': s['case']},
         'checked': False, 'source': s.get('source', ''), 'license': s.get('license', ''),
         'savedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    with open(out, 'w') as f: json.dump(t, f, indent=1)
    n += 1
print('  OK   %d new truth files (not checked yet)' % n)
PY
        [ -n "${HW_TEST:-}" ] || chown "$LAB_USER:$LAB_USER" "$T"/*.json
    fi
    echo "  OK   $(echo $ADDED | wc -w) new sample images in $S"
else
    echo "  SKIP no samples/ folder beside this script"
fi

step 4 "checks"
if [ -z "${HW_TEST:-}" ]; then
    curl -fsS -o /dev/null "$CHECK_URL/bench/handwriting.html" && echo "  OK   page answers at $CHECK_URL/bench/handwriting.html" || echo "  WARN page did not answer at $CHECK_URL/bench/handwriting.html; open it from the deck and check"
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/bench/api/health" && echo "  OK   bench service answers on 127.0.0.1:$PORT" || echo "  WARN bench service not answering on 127.0.0.1:$PORT (the page needs it)"
fi

echo
echo "  Done. Open /vcge/bench/handwriting.html (The Scriptorium)."
echo "  To undo:${NEW:+ rm -f$NEW;}${ADDED:+ rm -f$ADDED;} (truth files of removed samples can stay; they are only text)"
