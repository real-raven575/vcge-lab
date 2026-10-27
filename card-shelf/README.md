# 📚 The Card Shelf: the benches' shared photos

One place for the lab's test photos, shared by 🦉 Glyph's OCR bench (The Reading Room), 🦎 Flipside's logo bench
(The Paint Shop) and 🐈 Iris's edge bench (The Darkroom). Upload a photo once, tick the benches that should test it,
archive it when you're done with it, and delete it for good only when it's a wrong file. Lab only.

## Where a photo can be
| Place | Folder | Meaning |
|---|---|---|
| 📥 Holding | `<shelf>/holding/` | new, not used by any bench yet |
| 🧪 Active | `<shelf>/active/{ocr,logo,edges}/` | tested on each ticked bench; one photo on two benches is one file, hard-linked (copied if the disk can't link) |
| 📦 Archive | `<shelf>/archive/` | kept for good, out of the benches' way; Restore puts it back in Holding |
| 🗑 Deleted | gone | only after two questions; its sha256 and time go in `<shelf>/deleted.json` (no names) so a bench can drop its answer keys |

A photo is known by the sha256 of its bytes. Moving never changes the bytes, so answer keys kept by hash (the Darkroom's)
follow the photo everywhere. Uploading the same photo twice keeps it once. `<shelf>` (`SHELF_ROOT`, default
`<LAB_ROOT>/shelf`) is outside the web root and outside every git repo; card photos never go into a repository.

## Files
- `card-shelf-api.py`: the service (Python standard library), as the lab user on 127.0.0.1:8768 behind Caddy at
  `shelf/api/`. `GET photos[?bench=ocr|logo|edges]`, `GET photo?hash=`, `GET deleted`, `PUT upload?name=&to=holding|ocr|logo|edges`,
  `POST move {hash, to: holding|archive|active, benches}`, `POST delete {hash, confirm: hash}`. It logs the method and
  path only, never a file name.
- `www/`: the page at `shelf/` (tabs for the three places, bench buttons on each photo, a bar for many at once).
- `vcge-lab-card-shelf-install.sh`: makes the folders, copies the photos already on Glyph's bench and in the
  Darkroom's local inbox onto the shelf (copies; originals stay), installs the service, adds the Caddy route, copies
  the page, and points Glyph's bench at `active/ocr` (`--cards-dir`). Backups and undo lines printed.
- `test/`: `test_shelf_api.py` (the service), `stand-in.cjs` and `shelf.e2e.cjs` (the page, Glyph's bench and the
  Paint Shop together, drawn cards only).

## How each bench uses it
- 🦉 **Glyph's bench**: its business cards are the shelf's `active/ocr` (`vcge-bench-api --cards-dir`); its own
  upload button adds straight to Active OCR. Handwriting samples stay in the bench's own folder.
- 🦎 **The Paint Shop**: lists the photos ticked Logo; its Add photos uploads to the shelf ticked Logo.
- 🐈 **The Darkroom** (Iris's part, a separate change): `EDGE_INBOX=<shelf>/active/edges`, read only; its Add photos
  uploads to `shelf/api/upload?to=holding`; it drops the answer keys of hashes in `shelf/api/deleted`.

## Testing (no lab machine needed)
```
python3 card-shelf/test/test_shelf_api.py
python3 card-shelf/card-shelf-api.py --shelf <tmp>/shelf &
python3 bench/vcge-bench-api.py --root <www> --cards-dir <tmp>/shelf/active/ocr &
node card-shelf/test/stand-in.cjs <www> 18930 &
node card-shelf/test/shelf.e2e.cjs http://127.0.0.1:18930
```
Lab layout: `<www>/v/<commit>/src` = the app's `src/`, `<www>/latest`, `<www>/shelf` = `www/` here,
`<www>/logo-bench`, `<www>/bench`. Passed 2026-10-27 (app decaab6): service 8 of 8, end to end 14 of 14; the installer
ran twice in a throwaway tree with stand-ins for systemctl, caddy and curl (photos copied once, route and bench unit
changed once, backups kept).
