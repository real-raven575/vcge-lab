#!/usr/bin/env python3
"""vCGE lab: the Card Factory. Makes made-up business cards whose right answers are known. Lab only; never in the app.

Every card is invented (people.py), so its answers are written into the set's manifest when it is made and nobody types
truth. Sets live outside the web root and every git repo (FACTORY_ROOT, default <LAB_ROOT>/factory).

    factory.py cards  --out DIR --set NAME --count N [--seed S] [--fonts DIR ...] [--backgrounds DIR] [--clean]
    factory.py clips  --out DIR --set NAME --count N [--seed S] [--fonts DIR ...]   (short "videos" as frame zips)
    factory.py hand   --out DIR --set NAME --count N [--seed S] [--fonts DIR ...]   (handwritten note lines)
    factory.py sheets --out DIR --set NAME --sheets K [--seed S] [--fonts DIR ...]  (Print & Snap: 10 cards per Letter page)

A set folder holds manifest.json and the pictures. The manifest keeps, per card: its file, font, font group, layout,
the effects applied (name -> strength 0..1) and the four card corners in picture order, plus the answers (people.truth).
Fonts: every .ttf/.otf under the --fonts folders that can draw plain English letters. Sheets meant for printing should
be given open-licence fonts only (Google Fonts, Liberation, DejaVu): a printed sheet leaves the lab.
Needs Pillow (the lab already has it for the Funhouse).
"""
import argparse, hashlib, io, json, math, os, random, sys, time, zipfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import people  # noqa: E402

CARD_W, CARD_H = 1050, 600            # 3.5 x 2 inches at 300 dpi
SYSTEM_FONT_DIRS = ['/usr/share/fonts']
PLAIN_HINTS = ('arimo', 'liberationsans', 'dejavusans', 'opensans', 'roboto', 'lato', 'carlito', 'notosans', 'freesans')
MAX_COUNT = 20000

# ---- Fonts --------------------------------------------------------------------------------------------------------

def group_of(name):
    """A font's group from its file name: script, mono, serif, display or sans (good enough for a scoreboard)."""
    n = name.lower()
    if any(k in n for k in ('script', 'hand', 'brush', 'signature', 'calligraph', 'cursive', 'marker', 'scrawl', 'pacifico', 'caveat', 'dancing', 'satisfy', 'kalam')):
        return 'script'
    if 'mono' in n or 'code' in n or 'courier' in n:
        return 'mono'
    if any(k in n for k in ('serif', 'times', 'garamond', 'georgia', 'baskerville', 'caslon', 'merriweather', 'playfair', 'lora', 'libertine', 'caladea', 'tinos')) and 'sans' not in n:
        return 'serif'
    if any(k in n for k in ('display', 'condensed', 'black', 'poster', 'bebas', 'anton', 'oswald', 'impact', 'stencil', 'slab')):
        return 'display'
    return 'sans'


def upright_regular(path):
    n = os.path.basename(path).lower()
    return not any(k in n for k in ('italic', 'oblique', 'thin', 'hairline', 'extralight', '-light'))


def draws_english(path):
    """True when the font loads and draws distinct shapes for A, g and 5 (skips symbol and broken fonts)."""
    try:
        f = ImageFont.truetype(path, 40)
        masks = [bytes(f.getmask(c)) for c in ('A', 'g', '5')]
        return all(any(m) for m in masks) and len(set(masks)) == 3
    except Exception:
        return False


def find_fonts(dirs):
    seen, out = set(), []
    for d in dirs:
        for root, _, files in os.walk(d):
            for fn in sorted(files):
                if not fn.lower().endswith(('.ttf', '.otf')):
                    continue
                p = os.path.join(root, fn)
                key = fn.lower()
                if key in seen or not upright_regular(p):
                    continue
                seen.add(key)
                out.append(p)
    out.sort()
    return out


class Fonts:
    def __init__(self, dirs):
        paths = [p for p in find_fonts(dirs) if draws_english(p)]
        if not paths:
            raise SystemExit('No usable fonts found in: %s' % ', '.join(dirs))
        self.all = paths
        self.plain = [p for p in paths if any(h in os.path.basename(p).lower().replace('-', '').replace('_', '') for h in PLAIN_HINTS) and group_of(os.path.basename(p)) == 'sans'] or paths[:1]
        self.script = [p for p in paths if group_of(os.path.basename(p)) == 'script']
        self._cache = {}

    def get(self, path, size):
        k = (path, size)
        if k not in self._cache:
            self._cache[k] = ImageFont.truetype(path, size)
        return self._cache[k]


def fit(fonts, path, text, start, width):
    """The biggest size up to start that fits text into width pixels."""
    size = start
    while size > 12:
        f = fonts.get(path, size)
        if f.getlength(text) <= width:
            return f
        size -= 2
    return fonts.get(path, 12)

# ---- One flat card ------------------------------------------------------------------------------------------------

PALETTES = [  # (paper, ink, accent, band text)
    ('#ffffff', '#1d232b', '#1f5fa8', '#ffffff'), ('#fbf8f1', '#2b2620', '#a3462d', '#ffffff'),
    ('#f4f6f8', '#16202c', '#2f7a4f', '#ffffff'), ('#ffffff', '#222222', '#c58b12', '#1b1b1b'),
    ('#1c2430', '#f2f2ee', '#e0b43a', '#1c2430'), ('#0f3b2e', '#f4efe2', '#d8b25a', '#0f3b2e'),
    ('#fffdf6', '#30343b', '#6b4fa0', '#ffffff'), ('#eef3fb', '#13233a', '#d2463c', '#ffffff')]
LAYOUTS = ['classic', 'centered', 'band', 'split', 'stacked']


def render_card(fonts, rnd, f, font_path, layout=None):
    """Draws one card flat at 300 dpi. Returns (image, info)."""
    layout = layout or rnd.choice(LAYOUTS)
    paper, ink, accent, band_ink = rnd.choice(PALETTES)
    small_path = font_path if rnd.random() < 0.3 and group_of(os.path.basename(font_path)) in ('sans', 'serif') else rnd.choice(fonts.plain)
    img = Image.new('RGB', (CARD_W, CARD_H), paper)
    d = ImageDraw.Draw(img)
    top, contact = people.printed_lines(f)
    M = 60
    name_f = fit(fonts, font_path, f['name'], 64, CARD_W - 2 * M)
    comp_f = fit(fonts, font_path, f['company'], 44, CARD_W - 2 * M)
    small = lambda text, w: fit(fonts, small_path, text, 30, w)

    def lines_at(x, y, items, w, anchor='la', gap=8):
        for t in items:
            fo = small(t, w)
            d.text((x, y), t, font=fo, fill=ink, anchor=anchor)
            y += fo.size + gap
        return y

    if layout == 'band':
        bh = 150
        d.rectangle([0, 0, CARD_W, bh], fill=accent)
        d.text((M, bh // 2), f['company'], font=fit(fonts, font_path, f['company'], 52, CARD_W - 2 * M), fill=band_ink, anchor='lm')
        y = bh + 30
        d.text((M, y), f['name'], font=name_f, fill=ink); y += name_f.size + 6
        if f['title']:
            y = lines_at(M, y, [f['title']], CARD_W - 2 * M)
        lines_at(M, max(y + 14, CARD_H - M - len(contact) * 36), contact, CARD_W - 2 * M, gap=4)
    elif layout == 'centered':
        cx = CARD_W // 2
        d.text((cx, M), f['company'], font=comp_f, fill=accent, anchor='ma')
        y = M + comp_f.size + 40
        d.text((cx, y), f['name'], font=name_f, fill=ink, anchor='ma'); y += name_f.size + 4
        if f['title']:
            y = lines_at(cx, y, [f['title']], CARD_W - 2 * M, anchor='ma')
        lines_at(cx, max(y + 20, CARD_H - M - len(contact) * 34), contact, CARD_W - 2 * M, anchor='ma', gap=2)
    elif layout == 'split':
        half = CARD_W // 2
        d.line([half, M, half, CARD_H - M], fill=accent, width=3)
        y = M + 40
        nf = fit(fonts, font_path, f['name'], 56, half - M - 30)
        d.text((M, y), f['name'], font=nf, fill=ink); y += nf.size + 6
        if f['title']:
            y = lines_at(M, y, [f['title']], half - M - 30)
        cf = fit(fonts, font_path, f['company'], 36, half - M - 30)
        d.text((M, CARD_H - M - cf.size), f['company'], font=cf, fill=accent)
        lines_at(half + 30, M + 20, contact, half - M - 30, gap=6)
    elif layout == 'stacked':
        y = M
        d.text((M, y), f['name'], font=name_f, fill=ink); y += name_f.size + 4
        if f['title']:
            y = lines_at(M, y, [f['title']], CARD_W - 2 * M)
        d.rectangle([M, y + 10, M + 120, y + 16], fill=accent)
        y += 34
        d.text((M, y), f['company'], font=comp_f, fill=accent); y += comp_f.size + 18
        lines_at(M, y, contact, CARD_W - 2 * M, gap=2)
    else:  # classic
        y = M
        d.text((M, y), f['company'], font=comp_f, fill=accent); y += comp_f.size + 30
        d.text((M, y), f['name'], font=name_f, fill=ink); y += name_f.size + 4
        if f['title']:
            y = lines_at(M, y, [f['title']], CARD_W - 2 * M)
        lines_at(M, max(y + 16, CARD_H - M - len(contact) * 34), contact, CARD_W - 2 * M, gap=2)
    return img, {'layout': layout, 'font': os.path.basename(font_path), 'group': group_of(os.path.basename(font_path)),
                 'small_font': os.path.basename(small_path), 'paper': paper}

# ---- Photo look ---------------------------------------------------------------------------------------------------

def solve(a, b):
    """Gaussian elimination for the 8x8 perspective system."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c and m[c][c]:
                k = m[r][c] / m[c][c]
                m[r] = [x - k * y for x, y in zip(m[r], m[c])]
    return [m[i][n] / m[i][i] for i in range(n)]


def perspective_coeffs(dst, src):
    """Coefficients for Image.transform(PERSPECTIVE): maps output points dst to input points src."""
    a, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return solve(a, b)


def background(rnd, w, h, bg_dir=None):
    pics = []
    if bg_dir and os.path.isdir(bg_dir):
        pics = [os.path.join(bg_dir, p) for p in sorted(os.listdir(bg_dir)) if p.lower().endswith(('.jpg', '.jpeg', '.png'))]
    if pics and rnd.random() < 0.7:
        im = ImageOps.fit(Image.open(rnd.choice(pics)).convert('RGB'), (w, h))
        return im, 'photo'
    kind = rnd.choice(['wood', 'desk', 'granite', 'cloth', 'dark'])
    base = {'wood': (139, 98, 62), 'desk': (205, 200, 190), 'granite': (120, 120, 118), 'cloth': (52, 70, 110), 'dark': (34, 34, 38)}[kind]
    im = Image.new('RGB', (w, h), base)
    d = ImageDraw.Draw(im)
    if kind == 'wood':
        for y in range(0, h, 6):
            s = rnd.randint(-18, 18)
            d.line([0, y + rnd.randint(-2, 2), w, y], fill=tuple(max(0, min(255, c + s)) for c in base), width=4)
    elif kind == 'cloth':
        for x in range(0, w, 24):
            d.line([x, 0, x, h], fill=tuple(c + 14 for c in base), width=3)
        for y in range(0, h, 24):
            d.line([0, y, w, y], fill=tuple(c + 10 for c in base), width=3)
    noise = Image.effect_noise((w, h), 28 if kind == 'granite' else 10).convert('RGB')
    return Image.blend(im, noise, 0.12 if kind == 'granite' else 0.05), kind


def photo_look(card, rnd, bg_dir=None, size=None, strength=1.0, fixed=None):
    """Puts a flat card on a table and adds camera trouble. Returns (picture, corners, effects).
    fixed: dict of corner/back-ground choices to reuse (clips keep the table and move the card)."""
    W, H = size or rnd.choice([(1600, 1200), (2000, 1500), (1200, 1600)])
    fx = {}
    if fixed and 'bg' in fixed:
        bg, kind = fixed['bg'].copy(), fixed['bg_kind']
    else:
        bg, kind = background(rnd, W, H, bg_dir)
    fx['background:' + kind] = 1.0
    # Card size on the picture and where it sits
    if fixed and 'corners' in fixed:
        corners = fixed['corners']
    else:
        scale = rnd.uniform(0.45, 0.85) * min(W / CARD_W, H / CARD_H)
        offx, offy = rnd.uniform(-0.12, 0.12) * W, rnd.uniform(-0.12, 0.12) * H
        turn = rnd.uniform(-12, 12) * strength
        if rnd.random() < 0.1:
            turn += rnd.choice([90, -90, 180])
        t = math.radians(turn)
        tilt = rnd.uniform(0, 0.12) * strength
        jitter = [(rnd.uniform(-tilt, tilt), rnd.uniform(-tilt, tilt)) for _ in range(4)]
        for _ in range(30):                       # shrink and pull to the middle until the whole card is in the picture
            cw, ch = CARD_W * scale, CARD_H * scale
            cx, cy = W / 2 + offx, H / 2 + offy
            base = [(-cw / 2, -ch / 2), (cw / 2, -ch / 2), (cw / 2, ch / 2), (-cw / 2, ch / 2)]
            corners = [(cx + (x + jx * cw) * math.cos(t) - (y + jy * ch) * math.sin(t), cy + (x + jx * cw) * math.sin(t) + (y + jy * ch) * math.cos(t))
                       for (x, y), (jx, jy) in zip(base, jitter)]
            if all(8 <= x <= W - 8 and 8 <= y <= H - 8 for x, y in corners):
                break
            scale *= 0.9; offx *= 0.8; offy *= 0.8
        # Only what makes a picture harder is listed, so "effect: none" on the scoreboard means an easy picture
        if abs(turn) > 20: fx['turned'] = round(min(1, abs(turn) / 180), 3)
        if tilt > 0.04: fx['tilt'] = round(tilt / 0.12, 3)
        size = scale * max(CARD_W, CARD_H) / max(W, H)
        if size < 0.4: fx['small_in_frame'] = round(1 - size / 0.4, 3)
    # Shadow under the card
    if rnd.random() < 0.6:
        sh = Image.new('L', (W, H), 0)
        off = rnd.uniform(6, 24)
        ImageDraw.Draw(sh).polygon([(x + off, y + off) for x, y in corners], fill=110)
        sh = sh.filter(ImageFilter.GaussianBlur(14))
        bg.paste((0, 0, 0), (0, 0), sh)
        fx['shadow'] = round(off / 24, 3)
    # The card itself, warped onto its corners
    coeffs = perspective_coeffs(corners, [(0, 0), (CARD_W, 0), (CARD_W, CARD_H), (0, CARD_H)])
    warped = card.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    mask = Image.new('L', (CARD_W, CARD_H), 255).transform((W, H), Image.PERSPECTIVE, coeffs, Image.BILINEAR)
    bg.paste(warped, (0, 0), mask)
    pic = bg
    # Light: a dim room, uneven light, glare
    if rnd.random() < 0.35:
        k = rnd.uniform(0.45, 0.85)
        pic = Image.eval(pic, lambda v, k=k: int(v * k))
        fx['dim'] = round((1 - k) / 0.55, 3)
    if rnd.random() < 0.35:
        grad = Image.linear_gradient('L').resize((W, H)).rotate(rnd.choice([0, 90, 180, 270]), expand=False)
        dark = Image.eval(pic, lambda v: int(v * 0.55))
        pic = Image.composite(pic, dark, grad)
        fx['uneven_light'] = 1.0
    if rnd.random() < 0.3:
        g = Image.new('L', (W, H), 0)
        gx, gy = rnd.choice(corners)
        gx, gy = (gx + W / 2) / 2, (gy + H / 2) / 2
        r = rnd.uniform(0.08, 0.2) * W
        ImageDraw.Draw(g).ellipse([gx - r, gy - r * 0.6, gx + r, gy + r * 0.6], fill=rnd.randint(140, 230))
        g = g.filter(ImageFilter.GaussianBlur(r / 3))
        pic = Image.composite(Image.new('RGB', (W, H), (255, 255, 250)), pic, g)
        fx['glare'] = round(r / (0.2 * W), 3)
    # Camera faults
    if rnd.random() < 0.35:
        b = rnd.uniform(0.6, 3.2) * strength
        pic = pic.filter(ImageFilter.GaussianBlur(b))
        fx['blur'] = round(b / 3.2, 3)
    if rnd.random() < 0.2:
        n = rnd.choice([3, 5])                       # a sideways smear, like a shaky hand
        pic = pic.filter(ImageFilter.Kernel((n, n), [1.0 / n if i // n == n // 2 else 0 for i in range(n * n)]))
        fx['motion_blur'] = round(n / 5, 3)
    if rnd.random() < 0.3:
        noise = Image.effect_noise((W, H), rnd.uniform(20, 60)).convert('RGB')
        a = rnd.uniform(0.04, 0.14)
        pic = Image.blend(pic, noise, a)
        fx['noise'] = round(a / 0.14, 3)
    q = rnd.choice([92, 85, 75, 60, 45]) if rnd.random() < 0.6 else 92
    if q < 92:
        fx['jpeg'] = round((92 - q) / 47, 3)
    return pic, [[round(x, 1), round(y, 1)] for x, y in corners], fx, q

# ---- Commands -----------------------------------------------------------------------------------------------------

def new_set(out, name):
    if not name.replace('-', '').replace('_', '').isalnum():
        raise SystemExit('Set names use letters, digits, - and _ only.')
    folder = os.path.join(out, name)
    if os.path.exists(os.path.join(folder, 'manifest.json')):
        raise SystemExit('Set %s already exists; pick another name.' % name)
    os.makedirs(folder, exist_ok=True)
    return folder


def save_manifest(folder, man):
    tmp = os.path.join(folder, '.manifest.tmp')
    with open(tmp, 'w') as fh:
        json.dump(man, fh, indent=1)
    os.replace(tmp, os.path.join(folder, 'manifest.json'))


def seed_of(a):
    return a.seed if a.seed is not None else int(time.strftime('%Y%m%d'))


def cmd_cards(a, fonts):
    rnd = random.Random(seed_of(a))
    folder = new_set(a.out, a.set)
    man = {'kind': 'cards', 'set': a.set, 'seed': seed_of(a), 'clean': a.clean, 'made_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'cards': []}
    for n in range(1, a.count + 1):
        f = people.person(rnd)
        font = rnd.choice(fonts.all)
        card, info = render_card(fonts, rnd, f, font)
        fname = '%05d.jpg' % n
        if a.clean:
            card.save(os.path.join(folder, fname), quality=95)
            corners, fx = None, {}            # a flat card has no table edge to find
        else:
            pic, corners, fx, q = photo_look(card, rnd, a.backgrounds)
            pic.save(os.path.join(folder, fname), quality=q)
        man['cards'].append({'n': n, 'file': fname, **info, 'effects': fx, 'corners': corners, 'truth': people.truth(f)})
        if n % 100 == 0:
            save_manifest(folder, man)
            print('  %d of %d' % (n, a.count)); sys.stdout.flush()
    save_manifest(folder, man)
    print('OK   %s: %d cards in %s' % (a.set, a.count, folder))


def cmd_clips(a, fonts):
    """A clip is a zip of 30 frames (3 seconds at 10 frames a second): the card drifts and the focus hunts."""
    rnd = random.Random(seed_of(a))
    folder = new_set(a.out, a.set)
    man = {'kind': 'clips', 'set': a.set, 'seed': seed_of(a), 'fps': 10, 'made_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'cards': []}
    for n in range(1, a.count + 1):
        f = people.person(rnd)
        font = rnd.choice(fonts.all)
        card, info = render_card(fonts, rnd, f, font)
        W, H = 1280, 960
        bg, kind = background(rnd, W, H, a.backgrounds)
        scale = rnd.uniform(0.55, 0.8) * min(W / CARD_W, H / CARD_H)
        cw, ch = CARD_W * scale, CARD_H * scale
        cx, cy, turn = W / 2, H / 2, rnd.uniform(-8, 8)
        dx, dy, dt = rnd.uniform(-3, 3), rnd.uniform(-3, 3), rnd.uniform(-0.3, 0.3)
        frames, best = [], (None, 99)
        clip_seed = rnd.random()                       # the same light and faults in every frame of one clip
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_STORED) as z:
            for i in range(30):
                t = math.radians(turn + dt * i)
                px, py = cx + dx * i, cy + dy * i
                corners = [(px + x * math.cos(t) - y * math.sin(t), py + x * math.sin(t) + y * math.cos(t))
                           for x, y in [(-cw / 2, -ch / 2), (cw / 2, -ch / 2), (cw / 2, ch / 2), (-cw / 2, ch / 2)]]
                pic, corners, fx, q = photo_look(card, random.Random(clip_seed), size=(W, H), fixed={'bg': bg, 'bg_kind': kind, 'corners': corners}, strength=0.5)
                focus = abs(math.sin(i / 4.0)) * 3.0          # the focus hunts in and out
                if focus > 0.3:
                    pic = pic.filter(ImageFilter.GaussianBlur(focus))
                b = io.BytesIO(); pic.save(b, 'JPEG', quality=85)
                z.writestr('frame-%02d.jpg' % (i + 1), b.getvalue())
                frames.append({'i': i + 1, 'focus_blur': round(focus, 2), 'corners': [[round(x, 1), round(y, 1)] for x, y in corners]})
                if focus < best[1]:
                    best = (i + 1, focus)
        fname = '%05d.zip' % n
        with open(os.path.join(folder, fname), 'wb') as fh:
            fh.write(buf.getvalue())
        man['cards'].append({'n': n, 'file': fname, **info, 'effects': {'background:' + kind: 1.0, 'clip': 1.0}, 'sharpest_frame': best[0], 'frames': frames, 'truth': people.truth(f)})
    save_manifest(folder, man)
    print('OK   %s: %d clips in %s' % (a.set, a.count, folder))


def cmd_hand(a, fonts):
    """Handwritten-looking note lines (the app reads cards only for now; these feed the Scriptorium's watch score)."""
    rnd = random.Random(seed_of(a))
    pool = fonts.script or fonts.all
    folder = new_set(a.out, a.set)
    man = {'kind': 'hand', 'set': a.set, 'seed': seed_of(a), 'made_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'cards': []}
    for n in range(1, a.count + 1):
        text = people.hand_note(rnd)
        if rnd.random() < 0.3:
            text = text.upper()
        font_path = rnd.choice(pool)
        img = Image.new('RGB', (1400, 360), rnd.choice(['#ffffff', '#fbf6e6', '#f1f4f7']))
        x = 60
        for word in text.split():
            fo = fonts.get(font_path, rnd.randint(70, 96))
            w = int(fo.getlength(word)) + 20
            tile = Image.new('RGBA', (w, 200), (0, 0, 0, 0))
            ImageDraw.Draw(tile).text((10, 40), word, font=fo, fill=rnd.choice(['#1b2a6b', '#202020', '#3a2a1a']))
            tile = tile.rotate(rnd.uniform(-4, 4), resample=Image.BICUBIC)
            img.paste(tile, (x, 60 + rnd.randint(-10, 10)), tile)
            x += w + rnd.randint(4, 24)
        img = img.crop((0, 0, min(1400, x + 60), 360)).filter(ImageFilter.GaussianBlur(rnd.uniform(0, 1.2)))
        fname = '%05d.jpg' % n
        img.save(os.path.join(folder, fname), quality=88)
        man['cards'].append({'n': n, 'file': fname, 'font': os.path.basename(font_path), 'group': group_of(os.path.basename(font_path)),
                             'case': 'upper' if text.isupper() else 'mixed', 'effects': {}, 'truth': {'text': text}})
    save_manifest(folder, man)
    print('OK   %s: %d handwriting lines in %s' % (a.set, a.count, folder))


def cmd_sheets(a, fonts):
    """Print & Snap: Letter pages at 300 dpi, 10 cards each (2 across, 5 down), with cut marks. Saves PNGs and one PDF.
    The manifest is the robot's list of printed cards: a photo is matched to one of these by what it reads."""
    rnd = random.Random(seed_of(a))
    folder = new_set(a.out, a.set)
    PW, PH, MX, MY = 2550, 3300, 225, 150
    man = {'kind': 'printed', 'set': a.set, 'seed': seed_of(a), 'made_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'cards': []}
    pages, n = [], 0
    label_font = fonts.get(fonts.plain[0], 28)
    for s in range(1, a.sheets + 1):
        page = Image.new('RGB', (PW, PH), 'white')
        d = ImageDraw.Draw(page)
        for row in range(5):
            for col in range(2):
                n += 1
                f = people.person(rnd)
                font = rnd.choice(fonts.all)
                card, info = render_card(fonts, rnd, f, font)
                x, y = MX + col * CARD_W, MY + row * CARD_H
                page.paste(card, (x, y))
                for (cx, cy) in [(x, y), (x + CARD_W, y), (x, y + CARD_H), (x + CARD_W, y + CARD_H)]:
                    d.line([cx - 30, cy, cx - 8, cy], fill='#888888', width=2); d.line([cx + 8, cy, cx + 30, cy], fill='#888888', width=2)
                    d.line([cx, cy - 30, cx, cy - 8], fill='#888888', width=2); d.line([cx, cy + 8, cx, cy + 30], fill='#888888', width=2)
                man['cards'].append({'n': n, 'sheet': s, 'slot': row * 2 + col + 1, **info, 'truth': people.truth(f)})
        d.text((MX, PH - 70), 'vCGE Card Factory, set %s, sheet %d of %d. Made-up people for testing. Cut on the marks.' % (a.set, s, a.sheets), font=label_font, fill='#666666')
        fname = 'sheet-%02d.png' % s
        page.save(os.path.join(folder, fname), dpi=(300, 300))
        pages.append(page)
    pages[0].save(os.path.join(folder, '%s.pdf' % a.set), save_all=True, append_images=pages[1:], resolution=300)
    save_manifest(folder, man)
    print('OK   %s: %d sheets, %d cards, PDF %s' % (a.set, a.sheets, n, os.path.join(folder, '%s.pdf' % a.set)))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('command', choices=['cards', 'clips', 'hand', 'sheets'])
    ap.add_argument('--out', required=True)
    ap.add_argument('--set', required=True)
    ap.add_argument('--count', type=int, default=100)
    ap.add_argument('--sheets', type=int, default=1)
    ap.add_argument('--seed', type=int)
    ap.add_argument('--fonts', action='append', default=[])
    ap.add_argument('--backgrounds')
    ap.add_argument('--clean', action='store_true', help='flat cards, no photo look')
    a = ap.parse_args(argv)
    if not 1 <= a.count <= MAX_COUNT or not 1 <= a.sheets <= 50:
        raise SystemExit('count must be 1..%d and sheets 1..50' % MAX_COUNT)
    fonts = Fonts(a.fonts or SYSTEM_FONT_DIRS)
    {'cards': cmd_cards, 'clips': cmd_clips, 'hand': cmd_hand, 'sheets': cmd_sheets}[a.command](a, fonts)


if __name__ == '__main__':
    main()
