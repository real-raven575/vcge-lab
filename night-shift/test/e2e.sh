#!/usr/bin/env bash
# Night Shift end to end, no lab machine needed: bash night-shift/test/e2e.sh <path to a vCGE-Master checkout>
# Builds a throwaway lab with two "builds" (copies of the checkout's src/), makes 6 factory cards, one printed sheet and
# 3 snapshots of its cards (+1 photo of nothing), runs the robot in headless Chromium and checks the saved scoreboards.
set -euo pipefail
APP=${1:?usage: e2e.sh <vCGE-Master checkout>}
HERE=$(cd "$(dirname "$0")/.." && pwd); REPO=$(cd "$HERE/.." && pwd)
T=$(mktemp -d); PORT=18774
trap 'kill $API 2>/dev/null || true; rm -rf "$T"' EXIT
for b in aaa1111:2026-11-25 bbb2222:2026-11-26; do
    s=${b%%:*}; mkdir -p "$T/www/v/$s"; cp -r "$APP/src" "$T/www/v/$s/"
    printf '{"short":"%s","date":"%sT00:00:00Z","subject":"e2e"}' "$s" "${b#*:}" > "$T/www/v/$s/version.json"
done
F=(--fonts /usr/share/fonts/truetype/liberation --fonts /usr/share/fonts/truetype/dejavu)
python3 -I "$REPO/card-factory/factory.py" cards --out "$T/factory" --set night-e2e --count 6 --seed 3 "${F[@]}" >/dev/null
python3 -I "$REPO/card-factory/factory.py" sheets --out "$T/factory" --set print-e2e --sheets 1 --seed 4 "${F[@]}" >/dev/null
mkdir -p "$T/snaps/day1" "$T/scores" "$T/export"
python3 -I - "$REPO/card-factory" "$T" <<'PY'
import sys, random; sys.path.insert(0, sys.argv[1]); import factory
from PIL import Image
t = sys.argv[2]; page = Image.open(t + '/factory/print-e2e/sheet-01.png').convert('RGB')
for slot in (1, 4, 7):                       # "photograph" three cut-out cards
    r, c = (slot - 1) // 2, (slot - 1) % 2
    card = page.crop((225 + c * 1050, 150 + r * 600, 225 + (c + 1) * 1050, 150 + (r + 1) * 600))
    pic, *_ = factory.photo_look(card, random.Random(slot), strength=0.3)
    pic.save('%s/snaps/day1/IMG_%04d.jpg' % (t, slot), quality=90)
Image.effect_noise((800, 600), 40).convert('RGB').save(t + '/snaps/day1/IMG_9999.jpg')
PY
python3 -I "$HERE/night-shift-api.py" --www "$T/www" --factory "$T/factory" --snaps "$T/snaps" --scores "$T/scores" --page "$HERE/www" --port $PORT >/dev/null & API=$!
for _ in $(seq 50); do curl -fsS "http://127.0.0.1:$PORT/night-shift/api/health" >/dev/null 2>&1 && break; sleep 0.1; done
node "$HERE/night-shift.mjs" --url "http://127.0.0.1:$PORT" --scores "$T/scores" --export "$T/export" --set night-e2e --max 6 | tail -25
python3 -I - "$T" <<'PY'
import json, os, sys, glob
t = sys.argv[1]
boards = glob.glob(t + '/scores/*/*.json'); assert len(boards) == 4, boards                       # 2 builds x (factory, snaps)
exp = json.load(open(glob.glob(t + '/export/night-shift-*.json')[0]))
jobs = {r['job']: r for r in exp['runs']}; assert set(jobs) == {'factory', 'snaps'}, jobs.keys()
assert jobs['factory']['all']['n'] == 6 and jobs['factory']['before'] == 'aaa1111', jobs['factory']
assert jobs['snaps']['all']['n'] >= 2 and jobs['snaps']['unmatched_count'] >= 1, jobs['snaps']
md = open(t + '/export/night-shift-latest.md').read()
truths = [c['truth'] for c in json.load(open(t + '/factory/night-e2e/manifest.json'))['cards']]
for tr in truths:
    for k in ('name', 'email', 'company'):
        assert tr[k] not in md and tr[k] not in json.dumps(exp), 'card text leaked: ' + k
print('E2E OK: factory chars %.1f%%, all fields %.1f%%; snaps matched %d, unmatched %d' % (
    jobs['factory']['all']['chars'] * 100, jobs['factory']['all']['allFields'] * 100, jobs['snaps']['all']['n'], jobs['snaps']['unmatched_count']))
PY
