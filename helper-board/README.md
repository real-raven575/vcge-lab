# ⌨️ Helper Board (prototype)

*Types what you meant. Keeps what you said. Never goes online.*

An Android keyboard from the Herd of Helpers, part of the 🦒 Never Forget family. This folder holds the
**prototype**: real enough to install and use, not yet the store app. Plan:
<https://claude.ai/artifact/8x2qLkMs4sZiJe7vdaaMaR>

## The three promises (on by default)

1. **Never lose a take.** The 🎙 key records to a file first and syncs it every second. Text is made *from that file*,
   so a garbled result can be redone with 🔁 Re-listen in the Take Vault.
2. **Never change what you said.** No autocorrect. Space types a space. Suggestions only replace a word when you tap one.
3. **Never online, never sneaky.** The app has no internet permission (CI fails the build if it ever does).
   Password and private boxes are never learned and their takes are never saved, unless you opt in.

## What works in this prototype

| Area | Status |
|---|---|
| ⌨️ Keys: QWERTY, always-visible mode strip (ABC · 123 · #+= · Takes), "my row" (@ · .com · caps · keypad), ↶ undo, ◀ ▶ cursor | ✅ |
| 🔢 Numbers as a row, a phone keypad grid, or off; key height and row gap sliders; same-size space bar everywhere | ✅ |
| ⇧ Clear shift: tap = one capital, double-tap = caps lock, hold = lock | ✅ |
| 🎙 Voice: record → saved every second → text on the phone (Android 13+ on-device recognizer) | ✅ prototype engine |
| 🗄 Take Vault: play, Keep, Toss to Trash, Restore, Re-listen, Copy; cleanup 7 days → Trash → 14 days, storage limit | ✅ |
| 🎨 Look: your photo (strength, tile, position, tint), key color palette, bubble strength, key font; all free | ✅ |
| 📖 My words: save a word with one tap; optional learning that asks first | ✅ |
| 🇪🇸 English and Spanish voice | ✅ (needs the phone's offline speech pack) |
| 🚗 Phone or Bluetooth mic; music should not restart after a take | 🧪 needs a car test |
| 👆 Swipe typing, next-word guesses, floating pads, dyslexia fonts, colorblind palettes, Moonshine voice model | ⏭ next |
| 🍎 iPhone | ⏭ later (recorder app + paste keyboard) |

## Try it on an Android phone

1. Open the latest **Helper Board** run under the repository's **Actions** tab and download
   `helper-board-proto-N` (a zip holding the `.apk`).
2. Open the `.apk` on the phone and allow installing from this source when asked.
3. Open **Helper Board** and tap the three setup buttons: turn it on, allow the mic, switch to it.
4. For voice → text: Android 13 or newer, with **Settings › System › Languages › On-device speech recognition**
   downloaded for English (and Spanish). Without it, every take is still saved as audio.

## How it is built and tested (automatic)

- `core/`: the keyboard's rules in plain Kotlin (cleanup, private boxes, shift, layouts, my words, audio file
  format), with unit tests. Runs anywhere: `gradle :core:test`.
- `app/`: the Android app. No libraries beyond Android itself.
- GitHub Actions (`.github/workflows/helper-board.yml`): rules tests, app build and lint, the no-internet check,
  and an Android 14 emulator run that installs the keyboard, turns it on, opens it, and fails on any crash.
  Screenshots are uploaded with each run.

© 2026 raven575, Herd of Helpers (claude) & gemini
