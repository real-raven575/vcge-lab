"""Card Factory tests: python3 -I card-factory/test/test_factory.py (needs Pillow and any system fonts)."""
import json, os, re, sys, tempfile, unittest, zipfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import factory, people  # noqa: E402
from PIL import Image  # noqa: E402

FONT_DIRS = ['/usr/share/fonts']
PHONE = re.compile(r'^\(?\d{3}\)?[ .-]?555[ .-]01\d\d$')


def make(cmd, **kw):
    out = tempfile.mkdtemp()
    args = [cmd, '--out', out, '--set', 's1', '--seed', str(kw.get('seed', 5))]
    for d in FONT_DIRS: args += ['--fonts', d]
    if cmd == 'sheets': args += ['--sheets', str(kw.get('sheets', 1))]
    else: args += ['--count', str(kw.get('count', 4))]
    if kw.get('clean'): args.append('--clean')
    factory.main(args)
    with open(os.path.join(out, 's1', 'manifest.json')) as f:
        return out, json.load(f)


class People(unittest.TestCase):
    def test_only_made_up_contacts(self):
        import random
        rnd = random.Random(1)
        for _ in range(500):
            p = people.person(rnd)
            for k in ('phone', 'mobile', 'fax'):
                if p[k]: self.assertRegex(p[k], PHONE, 'every number sits in the 555-01xx fiction block')
            self.assertRegex(p['email'], r'@(vcge\.app|herdofhelpers\.com)$')
            if p['web']: self.assertRegex(p['web'], r'^(www\.)?(vcge\.app|herdofhelpers\.com)$')


class Cards(unittest.TestCase):
    def test_photo_cards_have_answers_and_corners_inside(self):
        out, m = make('cards', count=6)
        self.assertEqual(m['kind'], 'cards'); self.assertEqual(len(m['cards']), 6)
        for c in m['cards']:
            im = Image.open(os.path.join(out, 's1', c['file']))
            self.assertEqual(len(c['corners']), 4)
            for x, y in c['corners']:
                self.assertTrue(-5 <= x <= im.width + 5 and -5 <= y <= im.height + 5)
            self.assertTrue(c['truth']['name'] and c['truth']['company'] and c['truth']['email'])
            self.assertIn(c['group'], ('sans', 'serif', 'mono', 'script', 'display'))

    def test_same_seed_same_cards(self):
        _, a = make('cards', count=3, seed=11)
        _, b = make('cards', count=3, seed=11)
        self.assertEqual([c['truth'] for c in a['cards']], [c['truth'] for c in b['cards']])
        self.assertEqual([c['effects'] for c in a['cards']], [c['effects'] for c in b['cards']])

    def test_clean_cards_are_flat(self):
        out, m = make('cards', count=2, clean=True)
        im = Image.open(os.path.join(out, 's1', m['cards'][0]['file']))
        self.assertEqual(im.size, (factory.CARD_W, factory.CARD_H))
        self.assertEqual(m['cards'][0]['effects'], {})
        self.assertIsNone(m['cards'][0]['corners'])    # nothing to find on a flat card

    def test_existing_set_is_not_overwritten(self):
        out, _ = make('cards', count=1)
        with self.assertRaises(SystemExit):
            factory.main(['cards', '--out', out, '--set', 's1', '--count', '1', '--fonts', FONT_DIRS[0]])


class Others(unittest.TestCase):
    def test_sheets(self):
        out, m = make('sheets', sheets=2)
        self.assertEqual(m['kind'], 'printed'); self.assertEqual(len(m['cards']), 20)
        self.assertTrue(os.path.isfile(os.path.join(out, 's1', 's1.pdf')))
        page = Image.open(os.path.join(out, 's1', 'sheet-01.png'))
        self.assertEqual(page.size, (2550, 3300))                 # US Letter at 300 dpi
        self.assertEqual(sorted({c['slot'] for c in m['cards']}), list(range(1, 11)))

    def test_clips(self):
        out, m = make('clips', count=1)
        z = zipfile.ZipFile(os.path.join(out, 's1', m['cards'][0]['file']))
        self.assertEqual(len(z.namelist()), 30)
        self.assertIn(m['cards'][0]['sharpest_frame'], range(1, 31))

    def test_hand(self):
        _, m = make('hand', count=3)
        self.assertTrue(all(c['truth']['text'] for c in m['cards']))

    def test_font_groups(self):
        self.assertEqual(factory.group_of('DancingScript-Regular.ttf'), 'script')
        self.assertEqual(factory.group_of('JetBrainsMono-Regular.ttf'), 'mono')
        self.assertEqual(factory.group_of('LiberationSerif-Regular.ttf'), 'serif')
        self.assertEqual(factory.group_of('BebasNeue-Regular.ttf'), 'display')
        self.assertEqual(factory.group_of('LiberationSans-Regular.ttf'), 'sans')


if __name__ == '__main__':
    unittest.main(verbosity=1)
