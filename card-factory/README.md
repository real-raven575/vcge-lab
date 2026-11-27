# The Card Factory: made-up cards with known answers

Makes business cards for the lab benches and the Night Shift. Every card is invented, so its right answers are written
into the set's `manifest.json` when it is made: nobody types truth. Lab only; nothing here goes into the app.

## Who is on the cards
Made-up people only (`people.py`): everyday made-up names.
Phone numbers come from the 555-0100..0199 block kept for fiction. Every email and web address uses raven575's own
domains (vcge.app, herdofhelpers.com). Addresses use Flight Deck Way style streets with real towns and ZIP codes, so
the app's ZIP check sees a believable address. No real person's name, number or contact details are ever used.

## What it makes
| Command | Makes |
|---|---|
| `cards` | Photo-like cards: on a table (wood, desk, stone, cloth, dark, or your own background photos), tilted and turned, with shadow, dim or uneven light, glare, blur, shake, noise and JPEG loss. `--clean` gives flat cards. |
| `clips` | 3-second "videos" as zips of 30 frames: the card drifts and the focus hunts (for the Card Inbox and its best-frame picker). |
| `hand` | Handwritten-looking note lines from script fonts (the handwriting bench's watch score). |
| `sheets` | Print & Snap: US Letter pages at 300 dpi, 10 cards each with cut marks, as PNGs and one PDF. |

```
python3 -I card-factory/factory.py cards  --out <FACTORY_ROOT> --set night-20261127 --count 300 --seed 20261127 --fonts /usr/share/fonts
python3 -I card-factory/factory.py sheets --out <FACTORY_ROOT> --set print-01 --sheets 3 --fonts /usr/share/fonts/truetype/liberation
```
A seed makes the same set again. A set name is never overwritten. The manifest keeps, per card: file, font, font group
(sans, serif, mono, script, display), layout, the effects that made it harder (name -> strength 0..1), the card's four
corners in the picture (none for flat cards) and the answers.

## Fonts and where things live
- Fonts: every upright regular .ttf/.otf under the `--fonts` folders that draws plain English letters. On the sandbox VM
  that includes the Google Fonts the OCR training kit installs. raven575's own fonts may be used for **cards** on
  the lab (they never leave it), but **sheets** leave the lab when printed, so give `sheets` open-licence fonts only.
- Sets live in `FACTORY_ROOT` (default `<LAB_ROOT>/factory`), outside the web root and every git repo. They are never
  committed: test pictures and data stay out of repos.

## Tests
`python3 -I card-factory/test/test_factory.py` (Pillow and any system fonts).
