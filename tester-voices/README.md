# 💬 Tester Voices: what testers told us

raven575 drops a chat, text or e-mail from someone who tested an app, tags it, and the team reads it later. One engine,
one shelf per app: **vCGE** at `/vcge/voices/` and **🐒 Auto-Fixer** at `/vcge/voices/?app=auto-fixer` (its own
folder, its own codenames, orange colours). Lab only.

## Keeping testers private
Testers are real people, so:
- **Names to hide**: on the page, list each person once (`Jane Doe` or `Jane Doe = T7`). The whole name and each part
  of it become the codename in the browser, *before* anything is sent. That box is never sent or saved, not even in
  the browser.
- E-mail addresses, @handles and phone numbers are hidden by the page and again by the service on arrival.
- **What will be saved** shows the cleaned words before Save.
- Screenshots cannot be cleaned and may show names or faces. They stay on the lab machine and are only shown on this
  page. The page says so next to the button.
- Everything lives in `VOICES_ROOT` (default `<LAB_ROOT>/voices`, mode 750), outside the web root and every git repo.
  `.gitignore` also refuses `drops.json` and `shots/` folders in case a copy ever lands in a checkout.

## On the page
- 📥 Drop a chat: a big paste box, Names to hide, tester codename (next free `T#` filled in), where it came from,
  when they said it, tags (🐞 Bug, 💡 Idea, 💚 Praise, ❓ Question, 😕 Confusing), screenshots.
- 🗂️ Dropped chats, newest first: filter by status (🆕 New, 👀 Read, 📨 Sent to the team, ✅ Done) or tag, change tags
  and status, add notes, 📋 Copy (plain text for a thread or Mailbox card), and Delete (three taps).
- Every time reads in UTC and Eastern.

## Files
- `voices-api.py`: the service (Python standard library), as the lab user on 127.0.0.1:8772 behind Caddy at
  `voices/api/`. Every call takes `?app=` (`vcge` default, `auto-fixer`). `GET drops`, `GET shot?id=&hash=`,
  `POST drop {text, tester?, tags, source, said?}`, `PUT drop?id= {tags?, status?, tester?}`, `POST note?id= {text}`,
  `PUT shot?id=` (PNG, JPEG, WebP or GIF up to 15 MB, checked by its bytes, at most 12 per drop),
  `POST delete?id= {confirm: id}`. No outside calls. Logs carry method and path only.
- `www/`: the page (`voices-core.js` holds the cleaning and time logic, `voices.js` the screen). Header and empty-list art (`tv-*.svg`) by 🐼 Team Creative, HQ-0396, Image Safety Check passed (CRTV-0096).
- `vcge-lab-voices-install.sh`: folders, service, Caddy route, page. Undo lines printed; drops are never deleted by it.
- `test/`: `test_voices_api.py` (service), `voices-core.test.mjs` (cleaning, codenames, times),
  `voices.e2e.cjs` + `stand-in.py` (the page on a phone-sized screen in Chromium; checks no real name is ever sent).

## Testing (no lab machine needed; every name in the tests is made up)
```
python3 tester-voices/test/test_voices_api.py
node --test tester-voices/test/voices-core.test.mjs
node tester-voices/test/voices.e2e.cjs        # needs Playwright with Chromium
```
