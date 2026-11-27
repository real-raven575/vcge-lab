#!/usr/bin/env bash
# vCGE lab: one Night Shift (run by the nightly timer as the lab user; safe to run by hand: bash night-shift.sh).
#   1. Print & Snap intake: copies new photos from SNAP_DROP into <NIGHT_ROOT>/snaps/<date>/ (a photo seen before, by
#      sha256, is skipped). The drop folder is only read, never changed.
#   2. Card Factory: makes tonight's set night-<YYYYMMDD> (FACTORY_COUNT cards, seed = the date) unless it exists, and
#      removes night-* sets older than FACTORY_KEEP_DAYS (they can be made again from their seed). Other sets stay.
#   3. Runs the robot (night-shift.mjs) on the newest build and the one before it, and writes the summary to NIGHT_EXPORT.
# Settings come from the environment file the installer writes (<NIGHT_ROOT>/night-shift.env).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ENVF=${NIGHT_ENV:-$HERE/night-shift.env}
[ -f "$ENVF" ] && . "$ENVF"
: "${NIGHT_ROOT:?set NIGHT_ROOT}" "${FACTORY_ROOT:?set FACTORY_ROOT}"
SNAPS=$NIGHT_ROOT/snaps; SCORES=$NIGHT_ROOT/scores; EXPORT=${NIGHT_EXPORT:-$NIGHT_ROOT/export}
PORT=${NIGHT_PORT:-8773}; COUNT=${FACTORY_COUNT:-300}; KEEP=${FACTORY_KEEP_DAYS:-14}
mkdir -p "$SNAPS" "$SCORES" "$EXPORT" "$FACTORY_ROOT"
echo "== Night Shift $(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "1. Print & Snap intake"
if [ -n "${SNAP_DROP:-}" ] && [ -d "$SNAP_DROP" ]; then
    seen=$SNAPS/.seen; touch "$seen"; day=$(date -u +%Y-%m-%d); n=0
    while IFS= read -r -d '' f; do
        h=$(sha256sum "$f" | cut -d' ' -f1)
        grep -qx "$h" "$seen" && continue
        ext=$(printf '%s' "${f##*.}" | tr 'A-Z' 'a-z')
        mkdir -p "$SNAPS/$day"; cp -p "$f" "$SNAPS/$day/${h:0:16}.$ext"; echo "$h" >> "$seen"; n=$((n+1))
    done < <(find "$SNAP_DROP" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) -print0)
    echo "  OK   $n new photo(s)"
else
    echo "  SKIP no SNAP_DROP folder set (Print & Snap photos can also be copied into $SNAPS by hand)"
fi

echo "2. Card Factory"
set_name=night-$(date -u +%Y%m%d)
fonts=(); for d in ${FACTORY_FONTS:-/usr/share/fonts}; do [ -d "$d" ] && fonts+=(--fonts "$d"); done
if [ -f "$FACTORY_ROOT/$set_name/manifest.json" ]; then
    echo "  OK   $set_name already made"
else
    python3 -I "$HERE/card-factory/factory.py" cards --out "$FACTORY_ROOT" --set "$set_name" --count "$COUNT" --seed "$(date -u +%Y%m%d)" "${fonts[@]}" ${FACTORY_BACKGROUNDS:+--backgrounds "$FACTORY_BACKGROUNDS"} | tail -1
fi
find "$FACTORY_ROOT" -maxdepth 1 -type d -name 'night-*' -mtime +"$KEEP" -print -exec rm -r {} + | sed 's/^/  removed old set /' || true

echo "3. Robot"
node "$HERE/night-shift.mjs" --url "http://127.0.0.1:$PORT" --scores "$SCORES" --export "$EXPORT" --set "$set_name" --max "$COUNT"
echo "== done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
