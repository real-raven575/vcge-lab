# Versions page

`vcge-lab-index.py` writes the lab's front page, `www/index.html`: one row per branch and per published build,
newest first, each time shown in UTC with the viewer's local time beside it, and a version number `0.MMM.BB`.
It also writes `www/reset.html`, the "Start fresh" page that clears everything a browser saved for the lab.

```
sudo -u vcge VCGE_MAIN_BRANCH=main python3 versions-page/vcge-lab-index.py <LAB_ROOT>/www
```
Run it after each build is published (your builder can call it). Install it as `<LAB_ROOT>/bin/vcge-lab-index` so the
bench and Wipe Trials installers can add their links to it.

- Version numbers: `MMM` is the milestone, `BB` counts the commits on `VCGE_MAIN_BRANCH` since that milestone began,
  from 01. Milestones start at the commits in `<LAB_ROOT>/milestones.txt` (see `milestones.txt.example`). A build that
  is only on a side branch shows "branch build". The count comes from the app checkout under `LAB_ROOT`; nothing is
  fetched from the internet.
- Start fresh: have the web server send `Clear-Site-Data: "cache", "cookies", "storage"` with `/reset.html`; the page
  also clears the same things itself for browsers that ignore that header.
