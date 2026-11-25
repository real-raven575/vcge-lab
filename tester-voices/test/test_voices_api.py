"""Tester Voices service tests (standard library only): python3 tester-voices/test/test_voices_api.py
Every name, address and number below is made up."""
import importlib.util, json, os, shutil, tempfile, threading, unittest, urllib.request, urllib.error
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('voices', os.path.join(HERE, '..', 'voices-api.py'))
voices = importlib.util.module_from_spec(spec); spec.loader.exec_module(voices)

PNG = bytes.fromhex('89504e470d0a1a0a') + b'drawn-shot' * 40


class VoicesTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        voices.ROOT = self.dir
        self.srv = ThreadingHTTPServer(('127.0.0.1', 0), voices.Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = 'http://127.0.0.1:%d/voices/api/' % self.srv.server_address[1]

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close(); shutil.rmtree(self.dir)

    def call(self, method, path, body=None):
        data = body if isinstance(body, bytes) else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method)
        try:
            with urllib.request.urlopen(req) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if r.headers.get('Content-Type', '').startswith('application/json') else raw)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def drop(self, app='vcge', **kw):
        body = {'text': 'The scan button is hard to find.', 'tags': ['bug'], 'source': 'chat', **kw}
        code, r = self.call('POST', 'drop?app=' + app, body)
        self.assertEqual(code, 200, r)
        return r['drop']

    def test_health_and_empty(self):
        self.assertEqual(self.call('GET', 'health')[0], 200)
        code, r = self.call('GET', 'drops')
        self.assertEqual((code, r['drops'], r['nextTester'], r['app']['id']), (200, [], 'T1', 'vcge'))

    def test_contact_data_never_saved(self):
        d = self.drop(text='Mail me at pat.sample@example.com or call (555) 123-4567, or @patsample on chat. +1 555 987 6543')
        for bad in ('example.com', '123-4567', '@patsample', '987 6543'):
            self.assertNotIn(bad, d['text'])
        with open(os.path.join(self.dir, 'vcge', 'drops.json')) as f:
            disk = f.read()
        self.assertNotIn('example.com', disk)
        self.assertIn('[email hidden]', disk)
        self.assertIn('[phone hidden]', disk)

    def test_codenames_count_up_and_apps_are_apart(self):
        self.assertEqual(self.drop()['tester'], 'T1')
        self.assertEqual(self.drop()['tester'], 'T2')
        self.drop(tester='T4')
        self.assertEqual(self.call('GET', 'drops')[1]['nextTester'], 'T3')
        self.assertEqual(self.drop(app='auto-fixer')['tester'], 'T1')   # Auto-Fixer counts its own testers
        self.assertEqual(len(self.call('GET', 'drops?app=auto-fixer')[1]['drops']), 1)
        self.assertEqual(len(self.call('GET', 'drops')[1]['drops']), 3)
        self.assertEqual(self.call('GET', 'drops?app=nope')[0], 404)

    def test_bad_input_refused(self):
        self.assertEqual(self.call('POST', 'drop', {'text': '  '})[0], 400)
        self.assertEqual(self.call('POST', 'drop', {'text': 'hi', 'tags': ['spam']})[0], 400)
        self.assertEqual(self.call('POST', 'drop', {'text': 'hi', 'tester': 'Jane <b>'})[0], 400)
        self.assertEqual(self.call('POST', 'drop', b'not json')[0], 400)

    def test_tags_status_note(self):
        d = self.drop()
        code, r = self.call('PUT', 'drop?id=' + d['id'], {'tags': ['idea', 'praise'], 'status': 'sent'})
        self.assertEqual((code, r['drop']['tags'], r['drop']['status']), (200, ['idea', 'praise'], 'sent'))
        self.assertEqual(self.call('PUT', 'drop?id=' + d['id'], {'status': 'lost'})[0], 400)
        code, r = self.call('POST', 'note?id=' + d['id'], {'text': 'Sent to Iris. Reply to x@example.org'})
        self.assertEqual(code, 200)
        self.assertIn('[email hidden]', r['drop']['notes'][0]['text'])
        self.assertEqual(self.call('PUT', 'drop?id=d20260101-000000-abcd', {'status': 'read'})[0], 404)

    def test_screenshots_and_delete(self):
        d = self.drop()
        self.assertEqual(self.call('PUT', 'shot?id=' + d['id'], b'<html>not a picture')[0], 400)
        code, r = self.call('PUT', 'shot?id=' + d['id'], PNG)
        self.assertEqual(code, 200)
        h = r['drop']['shots'][0]['hash']
        self.assertTrue(self.call('PUT', 'shot?id=' + d['id'], PNG)[1]['duplicate'])
        code, raw = self.call('GET', 'shot?id=%s&hash=%s' % (d['id'], h))
        self.assertEqual((code, raw), (200, PNG))
        self.assertEqual(self.call('POST', 'delete?id=' + d['id'], {})[0], 400)   # needs confirm
        self.assertEqual(self.call('POST', 'delete?id=' + d['id'], {'confirm': d['id']})[0], 200)
        self.assertEqual(os.listdir(os.path.join(self.dir, 'vcge', 'shots')), [])
        self.assertEqual(self.call('GET', 'drops')[1]['drops'], [])


if __name__ == '__main__':
    unittest.main()
