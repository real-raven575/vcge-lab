# The Night Shift: the lab's robot

Every night at 02:00 Eastern a timer on the lab:
1. copies new **Print & Snap** photos from the drop folder (`SNAP_DROP`) into `<NIGHT_ROOT>/snaps/` (the drop folder is only read),
2. has the **Card Factory** make tonight's set `night-<YYYYMMDD>` (300 cards by default; old night sets are removed after 14 days and can be made again from their seed),
3. opens the **robot page** in headless Chromium for the newest **main** build **and the main build before it**, and for the newest branch build (if newer than main) **against the newest main build**, so each pair reads the same cards and a branch is never compared with another branch,
4. saves each scoreboard under `<NIGHT_ROOT>/scores/<build>/` and writes a numbers-only summary to `NIGHT_EXPORT`
   (`night-shift-latest.md` and `night-shift-<date>.json`) for the morning reader. A field that got 2 points worse
   than the build before is flagged.

The robot runs a build's own code the way the app does (MOD03 edges and crop, MOD04 reader, MOD05 field mapper), the
same steps as the OCR bench's "as the app does it". It scores characters right, each field (name, title, company,
phone, email, web, address), "every field right", and edges found (photo cards), grouped by font group, layout, name
style and effect. Print & Snap photos are matched to the printed card they show by what was read (phone digits and
email count most), so their answers are known too; a photo it can't match is counted and left for a person.

**What leaves the lab:** scores and labels only. Photos, sheets and what cards say stay on the lab. The robot never
merges, ships or deletes anything outside its own night sets.

## Files
| File | What |
|---|---|
| `night-shift.sh` | One night: intake, factory set, robot. The timer runs it as the lab user. |
| `night-shift.mjs` | The robot runner (Node + Playwright). |
| `night-shift-api.py` | Read-only file service, 127.0.0.1:`NIGHT_PORT` (8773): pages, sets, pictures, photos, scoreboards, and `/v/<build>/` for the robot. It writes nothing. |
| `www/robot.html`, `robot.js` | The headless robot page. |
| `www/score.js` | Scoring and matching (pure functions). |
| `www/index.html`, `board.js` | The scoreboard page at `/vcge/night-shift/`, with Print & Snap sheet downloads. |
| `vcge-lab-night-shift-install.sh` | The installer (sudo gate). |

## Install (sudo gate; raven575's typed yes)
Copy the repo's `night-shift/` and `card-factory/` folders side by side to the VM, then
`sudo bash night-shift/vcge-lab-night-shift-install.sh`. It needs Node 18+ (installs it with apt if missing) and
downloads Playwright 1.49.1 and its Chromium into the kit. Undo lines are printed at the end.
Settings in `lab.conf`: `NIGHT_ROOT`, `NIGHT_PORT`, `FACTORY_ROOT`, `FACTORY_COUNT`, `FACTORY_FONTS`, `SNAP_DROP`,
`NIGHT_EXPORT`. `SNAP_DROP` stays empty until raven575 approves a drop folder.

## Print & Snap, start to finish
1. Make a printed set: `factory.py sheets --set print-01 --sheets 3` (open-licence fonts). Its PDF is on the scoreboard page.
2. raven575 prints, cuts on the marks, and photographs or films the cards in a few rooms and lights.
3. The photos go into the drop folder; the next night copies them in, reads them and matches each to its printed card.

## Tests
```
node --test night-shift/test/score.test.mjs            # scoring and matching
node --test night-shift/test/plan.test.mjs             # which builds are compared
python3 -I night-shift/test/test_api.py               # the file service (read-only, stays inside its folders)
bash night-shift/test/e2e.sh <vCGE-Master checkout>   # the whole night on a throwaway lab, headless Chromium (~3 min)
```
