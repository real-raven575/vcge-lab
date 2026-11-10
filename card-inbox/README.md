# 📬 The Card Inbox: one card, every angle

Drop a zip of many photos of one card, loose photos, or a 3 to 5 second clip. Every angle goes onto the Card Shelf
(ticked for the Reading Room, the Darkroom and the Paint Shop), and the card page runs one published build's own code on
each angle in your browser: edges and crop (MOD03), reading (MOD04), lines to fields (MOD05), and the Paint Shop's logo
check. Type the right answers once per card; every angle is scored on them here, and the same lines are saved as the
Reading Room's shared key `<card>__card`, so its "same card, every angle" table agrees. Lab only.

## Video instead of one photo (for 🐈 Iris)
A clip stays in the inbox (the shelf holds photos). The card page looks at 10 frames a second, scores each one for
sharpness (variance of the Laplacian) and glare (share of blown-out pixels), keeps the best 8 at least 0.25 s apart,
and sends them back as photos marked "frame". The summary then compares photos, video frames and **All angles voted**
(the lines more than half of the angles agree on). Those numbers say whether the app should read a short burst of
frames from its live camera preview instead of one still.

## Files
- `card-inbox-api.py`: the service (Python standard library), as the lab user on 127.0.0.1:8770 behind Caddy at
  `inbox/api/`. `GET cards`, `GET card?id=`, `GET clip?id=&hash=`, `POST card {name}`, `PUT upload?id=&name=[&from=clip]`
  (a zip, a photo or a clip), `PUT truth?id= {lines: [{text, role}]}`, `PUT result?id=&hash=`. Zips: bare file names
  only, photos and clips only, at most 200 files and 600 MB unpacked. A `drop/` folder is picked up every 30 s
  (`<card>.zip` or a `<card>/` folder; moved to `drop/done/` after). Logs carry method and path only.
- `www/`: the page at `inbox/` (drop box, cards, the card page with progress, answers, and the frame picker).
- `vcge-lab-card-inbox-install.sh`: folders, service, Caddy route, page. Backups and undo lines printed.
- `test/`: `test_inbox_api.py` (service, against the real Card Shelf), `inbox.test.mjs` (frame scoring and the vote),
  `inbox.e2e.cjs` (the whole thing in Chromium with a published build; drawn cards and a clip recorded in the browser).

Cards and clips live in `INBOX_ROOT` (default `<LAB_ROOT>/inbox`), outside the web root and every git repo. Card
nicknames only, never a real person's name.

## Testing (no lab machine needed)
```
python3 card-inbox/test/test_inbox_api.py
node --test card-inbox/test/inbox.test.mjs
node card-inbox/test/inbox.e2e.cjs <vCGE-Master checkout>     # needs Playwright with Chromium
```
