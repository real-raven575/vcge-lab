# 🧪 The Test Bench: every open test in one list

One engine, one bench per team. raven575 works down a bench instead of hunting through threads:

- **Hands-on cards** (vCGE: "Needs raven575"; Auto-Fixer: one card per open PR). Each card has steps; each step is
  👤 (raven575 by hand) or 🤖 (a Claude robot run, with its own result line). Every step takes ✅ Pass / ❌ Fail /
  ⏭ Skip, a "what I saw" box and a picture. Each card has a status, a notes log, photos or screenshots as evidence,
  and **📋 Copy my results** (plain text to paste into the card's thread).
- **🔁 Interactive** cards name a thread: raven575 posts what each step shows there before going on, so Claude can
  check it step by step.
- **👉 Needs my yes/no** cards carry `decision: {ask, where?, label?, link}`: a one-tap button, on the closed card too,
  to the exact place the choice is answered (a PR, a Run button, or claude.ai with the thread named in `where`).
  Links are https only. Every card waiting on a raven575 choice must have one.
- **🤖 Automatic** lines read the newest real GitHub Actions run (workflow + branch, or one job) every 15 minutes and on
  "Check CI now": jobs green, the failed job and step, the build, a link to the run.
- Filters (Still to do, All, 👉 Needs my yes/no, 👤 Mine, 🤖 Robot, 🔁 Interactive, Failed, Passed), an overall progress bar and one per card.

Pages: `/vcge/testbench/` (vCGE) and `/vcge/testbench/?bench=auto-fixer` (Auto-Fixer, its own theme).

## Files
- `testbench-api.py`: the service (Python standard library), as the lab user on 127.0.0.1:8771 behind Caddy at
  `testbench/api/`. Every call takes `?bench=` (default `vcge`). `GET items`, `GET evidence?id=&hash=`,
  `PUT step?id=&n= {result: pass|fail|skip|"", note, robot?}`, `PUT status?id= {status}`, `POST note?id= {text}`,
  `PUT evidence?id=&name=[&step=]` (a PNG, JPEG, WebP or GIF, checked by its bytes, up to 15 MB),
  `POST item {title, steps, area?, why?, link?, interactive?, thread?, robotSteps?, decisionLink?}`, `POST refresh` (read CI now).
  Its only outside call is a read of public GitHub Actions results from api.github.com. Logs carry method and path only.
- `benches/<team>.json`: each bench's seed: title, emoji, theme, section names and its cards. Kept in git: names and
  steps only. A step is a string or `{text, who: human|robot, section, robot, resultAt, state}`; a robot's `state`
  shows as the step's result until raven575 changes it. **To update a list, change the seed in a PR and run the
  installer again**; what raven575 recorded is kept (matched by card id and step number, so add steps at the end of a
  card, or give a changed card a new id).
- `www/`: the page.
- `vcge-lab-testbench-install.sh`: folders, service, Caddy route, page. Backups and undo lines printed.
- `test/`: `test_testbench_api.py` (service), `testbench.test.mjs` (page helpers), `testbench.e2e.cjs` (both benches
  in Chromium with a stand-in GitHub).

What raven575 records lives in `TESTBENCH_ROOT` (default `<LAB_ROOT>/testbench/<bench>/`), outside the web root and
every git repo. Test-card pictures are fine there; they never go in a repo. No real person's name or number in a note.

## Testing (no lab machine needed)
```
python3 testbench/test/test_testbench_api.py
node --test testbench/test/testbench.test.mjs
node testbench/test/testbench.e2e.cjs          # needs Playwright with Chromium
```
