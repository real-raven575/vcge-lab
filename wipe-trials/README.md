# Wipe Trials

Step-by-step manual test guides that file a Markdown report on the lab. The first trial is the
cross-browser wipe guide: does anything a card leaves behind in one browser ever show up in another?

- `www/`: the page (`index.html`, `trials.css` in a basic light or dark theme, `trials.js`) and one JSON per
  trial in `www/trials/` (`cross-browser-wipe.json`: 7 ranges, 30 steps). A new test guide is a new JSON file,
  opened with `/testing/?trial=<id>`; no code change needed.
- `api/vcge-testing-api.py`: the save service (Python standard library) on 127.0.0.1 (`TRIALS_PORT`, default 8766).
  It files reports, keeps drafts and lists reports. Never give it the bench's port.
- `make-installer.py`: builds the one-file installer `vcge-lab-testing-install.sh` from `www/`, `api/`,
  `installer-head.sh` and `installer-tail.sh`. The built file is not kept in git; build it after any edit.

## Install
```
python3 wipe-trials/make-installer.py
sudo bash wipe-trials/vcge-lab-testing-install.sh
```
It reads `lab.conf` from the repo root (or `VCGE_LAB_CONF=<file>`), prints `OK` lines and undo commands, and only
replaces its own files when run again. To use it on another machine, copy the built installer and a `lab.conf`
into one folder.

## Reports and drafts
- Reports: `<LAB_ROOT>/www/testing/reports/YYYYMMDD-HHMM-SS_<trial>.md` (UTC, stamped at "Start a new report",
  never overwritten: a second filing of the same report gets `-2`). Also readable at `/testing/reports/<name>`.
- Drafts autosave to `<LAB_ROOT>/testing/drafts/` while a tester works, so switching browsers on the same device to
  run the app loses nothing; the page offers to resume the newest draft. Without the service the draft lives in the
  tab and Submit downloads the file instead.

## Local check
`python3 api/vcge-testing-api.py --reports R --drafts D --serve-www ROOT`, where `ROOT/testing/` is this folder's `www/`.
`VCGE_TEST_ROOT=<folder> bash vcge-lab-testing-install.sh` installs under that folder without root, systemd or a
Caddy reload.
