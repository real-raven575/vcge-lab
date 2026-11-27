"""Night Shift file service tests: python3 -I night-shift/test/test_api.py"""
import json, os, subprocess, sys, tempfile, time, unittest, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.dirname(HERE)
PORT = 18773


def get(path, method='GET'):
    req = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.headers.get('Content-Type'), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Content-Type'), e.read()


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t = cls.tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(t, 'www', 'v', 'abc1234', 'src', 'modules', 'mod04-ocr'))
        open(os.path.join(t, 'www', 'v', 'abc1234', 'src', 'modules', 'mod04-ocr', 'ocrWorker.js'), 'w').write('export {}')
        json.dump({'short': 'abc1234', 'date': '2026-11-26T00:00:00Z', 'subject': 'test'}, open(os.path.join(t, 'www', 'v', 'abc1234', 'version.json'), 'w'))
        open(os.path.join(t, 'secret.txt'), 'w').write('outside')
        os.makedirs(os.path.join(t, 'factory', 'night-1'))
        json.dump({'kind': 'cards', 'made_utc': '2026-11-27T00:00:00Z', 'cards': [{'n': 1, 'file': '00001.jpg'}]}, open(os.path.join(t, 'factory', 'night-1', 'manifest.json'), 'w'))
        open(os.path.join(t, 'factory', 'night-1', '00001.jpg'), 'wb').write(b'\xff\xd8jpeg')
        os.makedirs(os.path.join(t, 'snaps', '2026-11-27')); open(os.path.join(t, 'snaps', '2026-11-27', 'a1.jpg'), 'wb').write(b'x')
        os.makedirs(os.path.join(t, 'scores'))
        cls.p = subprocess.Popen([sys.executable, '-I', os.path.join(KIT, 'night-shift-api.py'), '--www', os.path.join(t, 'www'), '--factory', os.path.join(t, 'factory'),
                                  '--snaps', os.path.join(t, 'snaps'), '--scores', os.path.join(t, 'scores'), '--page', os.path.join(KIT, 'www'), '--port', str(PORT)], stdout=subprocess.DEVNULL)
        for _ in range(50):
            try:
                get('/night-shift/api/health'); break
            except Exception:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.p.terminate(); cls.p.wait()

    def test_lists(self):
        self.assertEqual(json.loads(get('/night-shift/api/builds')[2])['builds'][0]['source'], True)
        self.assertEqual(json.loads(get('/night-shift/api/sets')[2])['sets'][0]['name'], 'night-1')
        self.assertEqual(json.loads(get('/night-shift/api/snaps')[2])['photos'][0]['name'], '2026-11-27/a1.jpg')
        self.assertEqual(json.loads(get('/night-shift/api/scoreboards')[2])['scoreboards'], [])

    def test_files(self):
        self.assertEqual(get('/night-shift/api/image?set=night-1&file=00001.jpg')[:2], (200, 'image/jpeg'))
        self.assertEqual(get('/night-shift/api/snap?name=2026-11-27/a1.jpg')[0], 200)
        self.assertEqual(get('/night-shift/robot.html')[0], 200)
        self.assertEqual(get('/v/abc1234/src/modules/mod04-ocr/ocrWorker.js')[1], 'text/javascript')

    def test_nothing_outside_its_folders(self):
        for p in ('/v/../secret.txt', '/v/%2e%2e/secret.txt', '/night-shift/../secret.txt', '/night-shift/api/snap?name=../secret.txt',
                  '/night-shift/api/image?set=../&file=secret.txt', '/night-shift/api/set?name=..', '/secret.txt'):
            self.assertNotEqual(get(p)[0], 200, p)

    def test_read_only(self):
        for m in ('POST', 'PUT', 'DELETE'):
            self.assertEqual(get('/night-shift/api/sets', m)[0], 501)


if __name__ == '__main__':
    unittest.main(verbosity=1)
