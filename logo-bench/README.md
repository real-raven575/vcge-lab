# 🦎 The Paint Shop: the logo bench

Flipside's (MOD06, 3D Card) tool for finding the logo on business card photos, with 🦉 Glyph (MOD04, OCR) telling
the logo from the contact text. For each card it points at the likely logo, you confirm it or show the right spot, and
the logo is redrawn as a small SVG of flat shapes, to look at and toss. Lab only: nothing here goes into the app.

## Files
- `www/index.html`, `www/logo.js`, `www/logo.css`: the page, served at `logo-bench/` on the lab (leaf green and
  sunset orange; Flipside comments in a speech bubble). Nothing moves except the progress bar; nothing flashes.
- `www/logoFinder.js`: the finder. Pure functions: the card colour is its most common colour, everything far from it
  is ink, the contact lines Glyph is sure of are blanked out, the rest is joined into blobs and each blob is scored
  on what logos usually are (taller than the text, in colour, a sensible size and shape, near the top or a side,
  solid). The weights are `LOGO_WEIGHTS` at the top; the bench's results are what tune them.
- `www/posterize.js`: the shape maker. Boils the logo's colours down to 1 to 4 inks (the card colour is left out, so
  the SVG is see-through), traces each ink with the build's own MOD06 tracer (`outlines`, `soften` in
  `card3dView.js`), drops specks and simplifies the outlines. The SVG has paths only, usually well under 10 KB.
- `vcge-lab-logo-bench-install.sh`: copies the page files to `<LAB_ROOT>/www/logo-bench/`. No service, no port and
  no Caddy change; prints the undo line.
- `test/`: `logo.unit.test.mjs` (the finder and shape maker on drawn cards), `stand-in.cjs` (a static server) and
  `logo.e2e.cjs` (the whole page in headless Chromium, drawn cards only).

## Where the photos come from
- **The Card Shelf** (`../card-shelf/`): the photos ticked Logo there are listed here. **Add photos** on this page
  uploads to the shelf, ticked Logo. Where the Darkroom (🐈 Iris's edge bench) holds saved card corners for a photo
  (by its sha256), they are used to flatten the card.
- Without the shelf, photos added on this page stay in this browser's memory only and are gone when the page closes.

## Use
1. Open `logo-bench/` from the lab. Pick a build (newest by default; it needs its source published, as for the
   other benches).
2. Leave **Glyph reads the text first** on for better picks (slower), and pick how many colours the shapes keep.
3. **Run all.** Each card is flattened (Iris's saved corners, else the build's Snap to card), read, and searched.
   The green box is the first pick, amber boxes the next two, each with its score and reasons.
4. Press **Right**, **No, #2** / **No, #3**, **No logo**, or **Draw it** and drag a box over the real logo.
5. The confirmed logo appears twice: Flipside's flat colours, and the app's own one-colour trace (or why the app would
   keep the picture). **Save SVG** downloads one.
6. The tally counts first picks right, later picks right, drawn by hand and no logo. **Download the results** gives
   a JSON with the picks, scores and verdicts: no pictures and no text read from the cards.

Your answers are kept in this browser (localStorage, key `vcge-logo-bench-keys`), so the next run, or another build,
is scored without asking again. The lab's `reset.html` ("Start fresh") clears them too. Card photos and answers never
go into this repository.

## Testing the bench itself (no lab machine needed)
Lab layout for the test: `<www>/v/<commit>/src` = the app repo's `src/`, `<www>/latest -> v/<commit>`,
`<www>/logo-bench` = this folder's `www/`. Then, with Playwright on `NODE_PATH`:
```
VCGE_APP=<app checkout> node logo-bench/test/logo.unit.test.mjs
node logo-bench/test/stand-in.cjs <www> 18920 &
node logo-bench/test/logo.e2e.cjs <www> http://127.0.0.1:18920
```
Passed on 2026-10-27 with the app at decaab6: unit 14 of 14, end to end 18 of 18.
