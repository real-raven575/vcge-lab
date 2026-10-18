# OCR bench

A tool for testing the reader on real photos. It runs one published build's own edge finder, crop, OCR reader
and field mapper over every sample, in your browser, then lets you correct the result and scores it.

## Files
- `www/index.html`, `www/bench.js`, `www/bench.css`: the page, served at `/bench/` on the lab, in a basic light or
  dark theme. Motion stops under "reduce motion"; nothing flashes.
- `vcge-bench-api.py`: the file service (Python standard library) that lists builds and samples, takes uploads, keeps
  each sample's truth and stores runs. Runs as the lab user on 127.0.0.1 (`BENCH_PORT`, default 8765); Caddy
  forwards `/bench/api/*` to it.
- `vcge-lab-bench-install.sh`: installs or updates all of it (service, Caddy route, a link on the versions page).
- `vcge-lab-bench-publish-src.sh`: copies each commit's `src/` from the lab's git checkout (`LAB_REPO`) into
  `v/<commit>/` beside the bundle, so the bench can import that build's modules. Run as root with no arguments it
  installs a 5-minute systemd timer (as the lab user) and publishes every build now.

## Install (once; run again to update)
Set `lab.conf` at the repo root (see `lab.conf.example`), then:
```
sudo bash bench/vcge-lab-bench-install.sh
sudo bash bench/vcge-lab-bench-publish-src.sh
```
Each prints `OK` lines; the installer also prints undo commands.

## Use
1. Open `/bench/` from the lab's versions page. Pick a build (newest by default; a build without published source
   cannot be benched, and the list says so).
2. Add photos with the two upload buttons, or drop files into `www/bench/data/samples/business-cards/` and
   `.../handwriting/` on the lab.
3. Run all. Each sample goes through that build's own code in your browser.
4. Correct the lines on the right, tick *drop* for noise, add missed lines with +, and untick "edges are right" if the
   green outline is wrong. Go saves the truth per sample (`data/truth/<set>/<file>.json`) and scores the run.
5. The analysis shows character accuracy, lines exact / missed / invented / in the wrong field, the "please check"
   flags that were right, needless or missing, edge finding, and the top character confusions. Each run is kept under
   `data/runs/<build>/<time>/` (results.json, summary.json, summary.md, report.html) and listed under Past runs.

A sample with saved truth is scored on every later run without typing; edit its truth on the page if it was wrong.
Sample photos and truth stay on your lab; they are not part of this repository.

## Testing the bench itself (no lab machine needed)
- `test/caddy-stand-in.cjs <www> <port>` serves a lab-shaped folder and forwards `/bench/api/*` to the service on 8765.
- `test/bench.e2e.cjs <www> <card-photo.jpg>` (needs Playwright, for example from the app repo) uploads your card
  photo and a drawn card, runs, corrects, presses Go and checks the saved truth and run. It expects the stand-in on
  port 18900.

Lab layout for the test: `www/v/<commit>/` = the app repo at that commit plus a `version.json`,
`www/latest -> v/<commit>`, and `www/bench/` = this folder's `www/`.
