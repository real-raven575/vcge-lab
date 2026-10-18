# vCGE Lab

The test lab for **vCGE** (vCard Generator Engine), the app that turns a photo of a business card into a phone
contact, entirely on the device.

This is the **plain** edition: every feature, no characters or themed styling.

Created by raven575 and Team vCGE (Claude).

The lab is a small web server on a machine you control. Every build of the app is published there, one folder per
commit, and a few tools sit beside the builds to test them:

| Tool | Folder | What it does |
|---|---|---|
| OCR bench | `bench/` | Runs one build's own edge finder, OCR reader and field mapper over a library of card photos in your browser, lets you correct the result, and scores it. |
| Wipe Trials | `wipe-trials/` | A step-by-step manual test guide (first trial: cross-browser wipe) that files a Markdown report on the lab. |
| Versions page | `versions-page/` | The lab's front page: every published build, newest first, with UTC and local times and a version number. |

The lab never becomes part of the app. Nothing here is built into vCGE, and the app's own rules (no internet,
nothing stored) are not loosened to make testing easier.

## Two editions

- **`main`** is the personalized edition: Glyph the owl hosts the Reading Room, Ghost the raccoon hosts Wipe Trials.
- **`plain`** has every feature of `main`, with the characters, themed wording and accent styling taken out: plain
  text and a basic light/dark theme.

Every update lands on both branches, unless it only changes branding or personality.

## Rules the lab keeps

- **Offline.** The pages load only files from the lab itself. No CDN, no web fonts, no analytics, no update checks.
  The OCR runs in your browser with the build's own bundled engine.
- **No tracking, no ads.** Nothing reports usage anywhere. There are no ad networks, banners, pop-ups or tracking scripts, now or later.
- **Calm.** Motion is soft, stops under "reduce motion", and nothing flashes or plays sound.
- **Local services only.** The two small file services (Python standard library, no packages) listen on 127.0.0.1
  and are reached through the web server. They log counts and file names, never what a card says.

## How the lab is laid out

The tools only assume this layout under one folder, `LAB_ROOT` (default `/srv/vcge-lab`):

```
LAB_ROOT/
  www/                      served by Caddy as the lab site
    index.html              the versions page (versions-page/vcge-lab-index.py writes it)
    v/<commit>/             one published build: the app's built files plus version.json and build.log
    latest -> v/<commit>    the newest build
    b/<branch> -> ../v/<commit>
    bench/                  the OCR bench (bench/vcge-lab-bench-install.sh)
    testing/                Wipe Trials (wipe-trials/, built installer)
  bin/                      the lab's scripts and services
  repo/                     a git checkout of the app (for version numbers and the bench's source copies)
  milestones.txt            optional, see versions-page/
```

`version.json` holds `{"short": "<commit>", "subject": "<commit message>", "date": "<ISO date>", "tests": "passed|FAILED"}`.
Whatever builds and publishes the app (a git hook, a timer, CI) only has to write that folder and the `latest`
link. That builder is specific to each lab and is not in this repository.

## Setting it up

1. Put a web server in front of `LAB_ROOT/www`. The installers expect [Caddy](https://caddyserver.com/) and add
   their routes to its Caddyfile (they back it up first and put it back if `caddy validate` fails).
2. Create the lab user (default `vcge`) that owns `LAB_ROOT/www` and runs the services.
3. Copy `lab.conf.example` to `lab.conf` and change what differs on your machine. `lab.conf` stays out of git.
4. Install the tools you want; each folder's README has the details:
   ```
   sudo bash bench/vcge-lab-bench-install.sh
   sudo bash bench/vcge-lab-bench-publish-src.sh
   python3 wipe-trials/make-installer.py && sudo bash wipe-trials/vcge-lab-testing-install.sh
   ```
   Every installer is safe to run again, prints `OK` lines, and prints how to undo it.

Keep the lab on your own network or behind a private VPN. It has no login.

## How the bench loads a vCGE build

The bench does not copy or re-implement the app. For the build you pick, it imports that build's own modules by URL
from `v/<commit>/src/...` (the camera's `cardFinder.js` and `perspective.js`, the OCR's `ocrWorker.js` with the
bundled Tesseract.js, and the field mapper's `formMapper.js`). Vite bundles most modules into `assets/`, so
`bench/vcge-lab-bench-publish-src.sh` copies each commit's `src/` from the lab's git checkout into `v/<commit>/`
beside the bundle, every 5 minutes. A build without its source shows "source not published yet" in the bench.

The only vCGE-specific part of the bench is `loadModules` and `runSample` in `bench/www/bench.js`. The file
service, the page and the scoring are generic, so the lab can be reused for other projects.

## Licence

MIT, see [LICENSE](LICENSE). Keep the credit "raven575 and Team vCGE" with any copy.
