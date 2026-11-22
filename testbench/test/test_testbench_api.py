"""Test Bench service tests (standard library only):
    python3 testbench/test/test_testbench_api.py
Drawn bytes only; no photos. GitHub is a stand-in served here."""
import importlib.util, json, os, shutil, tempfile, threading, unittest, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('tb', os.path.join(HERE, '..', 'testbench-api.py'))
tb = importlib.util.module_from_spec(spec); spec.loader.exec_module(tb)

PNG = bytes.fromhex('89504e470d0a1a0a') + b'drawn' * 40
JPG = b'\xff\xd8\xff\xe0' + b'drawn' * 40
WEBP = b'RIFF\x10\x00\x00\x00WEBPVP8 ' + b'x' * 20
SEED = {'items': [
    {'id': 'hand', 'section': 'raven', 'title': 'A hands-on test', 'steps': ['one', 'two', 'three'], 'status': 'ready'},
    {'id': 'later', 'section': 'raven', 'title': 'Not built yet', 'steps': ['one'], 'status': 'waiting',
     'interactive': {'thread': 'some thread', 'how': 'post each step'}},
    {'id': 'ci', 'section': 'auto', 'title': 'CI', 'ci': {'repo': 'o/r', 'workflow': 'ci.yml', 'branch': 'main'}},
    {'id': 'ci-one', 'section': 'auto', 'title': 'one job', 'ci': {'repo': 'o/r', 'workflow': 'ci.yml', 'branch': 'main', 'job': 'B'}},
]}


class FakeGitHub(BaseHTTPRequestHandler):
    calls = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        FakeGitHub.calls.append(self.path)
        if '/workflows/ci.yml/runs' in self.path:
            body = {'workflow_runs': [{'id': 7, 'html_url': 'https://github.com/o/r/actions/runs/7', 'head_sha': 'abcdef1234',
                                       'display_title': 'a push', 'updated_at': '2026-11-14T05:40:00Z', 'run_attempt': 1, 'conclusion': 'failure'}]}
        elif '/runs/7/jobs' in self.path:
            body = {'jobs': [{'name': 'A', 'conclusion': 'success', 'steps': []},
                             {'name': 'B', 'conclusion': 'failure', 'steps': [{'name': 'setup', 'conclusion': 'success'}, {'name': 'e2e', 'conclusion': 'failure'}]}]}
        else:
            self.send_response(404); self.end_headers(); return
        out = json.dumps(body).encode()
        self.send_response(200); self.send_header('Content-Length', str(len(out))); self.end_headers(); self.wfile.write(out)


def serve(handler):
    srv = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d' % srv.server_address[1]


def call(base, method, path, body=None, raw=False):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            out = r.read()
            return r.status, (out if raw else json.loads(out))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


class TestBench(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        tb.ROOT = os.path.join(self.dir, 'root')
        tb.SEEDS = os.path.join(self.dir, 'benches')
        os.makedirs(tb.SEEDS)
        self.write_seed('vcge', SEED)
        self.write_seed('shop', {'title': 'Shop bench', 'theme': 'auto-fixer', 'items': [
            {'id': 'pr-1', 'section': 'raven', 'title': '#1 a PR', 'link': 'https://github.com/o/r/pull/1', 'steps': [
                {'text': 'robot checks', 'who': 'robot', 'section': 'Robot', 'robot': 'PASS on CI', 'state': 'pass'},
                {'text': 'you check', 'who': 'human'}]}]})
        self.gh, tb.GITHUB = serve(FakeGitHub)
        self.srv, self.base = serve(tb.Handler)

    def tearDown(self):
        self.srv.shutdown(); self.gh.shutdown()
        shutil.rmtree(self.dir)

    def write_seed(self, bench, data):
        with open(os.path.join(tb.SEEDS, bench + '.json'), 'w') as f:
            json.dump(data, f)

    def items(self, bench='vcge'):
        return {i['id']: i for i in call(self.base, 'GET', '/testbench/api/items?bench=' + bench)[1]['items']}

    def test_list_has_both_sections_with_seed_status(self):
        it = self.items()
        self.assertEqual(set(it), {'hand', 'later', 'ci', 'ci-one'})
        self.assertEqual(it['hand']['status'], 'ready')
        self.assertEqual(it['later']['status'], 'waiting')
        self.assertEqual([x['text'] for x in it['hand']['steps']], ['one', 'two', 'three'])
        self.assertEqual({x['who'] for x in it['hand']['steps']}, {'human'})
        self.assertEqual(it['later']['interactive']['thread'], 'some thread')

    def test_step_results_persist_and_keep_step_texts(self):
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/step?id=hand&n=1', {'result': 'fail', 'note': ' froze at read '})[0], 200)
        it = self.items()['hand']
        self.assertEqual([x['text'] for x in it['steps']], ['one', 'two', 'three'])
        self.assertEqual(it['stepResults']['1']['result'], 'fail')
        self.assertEqual(it['stepResults']['1']['note'], 'froze at read')
        with open(os.path.join(tb.ROOT, 'vcge', 'state.json')) as f:
            self.assertIn('froze at read', f.read())    # on disk, so a restart keeps it

    def test_bad_steps_and_results_are_refused(self):
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/step?id=hand&n=3', {'result': 'pass'})[0], 400)
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/step?id=hand&n=x', {'result': 'pass'})[0], 400)
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/step?id=hand&n=0', {'result': 'maybe'})[0], 400)
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/step?id=nope&n=0', {'result': 'pass'})[0], 404)

    def test_status_set_on_page_wins_over_seed(self):
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/status?id=later', {'status': 'pass'})[0], 200)
        self.assertEqual(self.items()['later']['status'], 'pass')
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/status?id=later', {'status': 'done'})[0], 400)

    def test_notes_append_with_time(self):
        call(self.base, 'POST', '/testbench/api/note?id=hand', {'text': 'first'})
        call(self.base, 'POST', '/testbench/api/note?id=hand', {'text': 'second'})
        notes = self.items()['hand']['notes']
        self.assertEqual([n['text'] for n in notes], ['first', 'second'])
        self.assertRegex(notes[0]['at'], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$')
        self.assertEqual(call(self.base, 'POST', '/testbench/api/note?id=hand', {'text': '  '})[0], 400)

    def test_pictures_are_checked_by_content_saved_outside_and_served_back(self):
        code, r = call(self.base, 'PUT', '/testbench/api/evidence?id=hand&name=shot.png&step=2', PNG)
        self.assertEqual(code, 200)
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/evidence?id=hand&name=a.jpg', JPG)[0], 200)
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/evidence?id=hand&name=b.webp', WEBP)[0], 200)
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/evidence?id=hand&name=shot-again.png', PNG)[0], 200)   # same bytes: kept once
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/evidence?id=hand&name=x.png', b'<svg onload=alert(1)>')[0], 400)
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/evidence?id=hand&name=../../x.png', b'')[0], 413)
        ev = self.items()['hand']['evidence']
        self.assertEqual(len(ev), 3)
        self.assertEqual((ev[0]['step'], ev[0]['type'], ev[0]['name']), (2, 'image/png', 'shot.png'))
        self.assertTrue(os.path.isfile(os.path.join(tb.ROOT, 'vcge', 'evidence', 'hand', r['hash'])))
        code, body = call(self.base, 'GET', '/testbench/api/evidence?id=hand&hash=' + r['hash'], raw=True)
        self.assertEqual((code, body), (200, PNG))
        self.assertEqual(call(self.base, 'GET', '/testbench/api/evidence?id=hand&hash=' + '0' * 64)[0], 404)

    def test_voice_notes_are_kept_then_written_out_on_this_machine(self):
        webm = b'\x1a\x45\xdf\xa3' + b'spoken' * 30
        code, r = call(self.base, 'PUT', '/testbench/api/evidence?id=hand&step=1', webm)
        self.assertEqual(code, 200)
        ev = self.items()['hand']['evidence'][0]
        self.assertEqual((ev['type'], ev['name'], ev['step']), ('audio/webm', 'voice-note.webm', 1))
        m4a = b'\x00\x00\x00\x18ftypM4A ' + b'x' * 30
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/evidence?id=hand&name=a.m4a', m4a)[0], 200)
        # not set up: the recording stays, the page is told plainly
        saved, tb.TRANSCRIBE = tb.TRANSCRIBE, None
        try:
            code, body = call(self.base, 'POST', '/testbench/api/transcribe?id=hand&hash=' + r['hash'])
            self.assertEqual(code, 501); self.assertIn('recording is saved', body['error'])
            fake = os.path.join(tb.ROOT, 'fake-whisper.py')
            with open(fake, 'w') as f:
                f.write('import sys\nd = open(sys.argv[1], "rb").read()\n'
                        'sys.exit("model missing") if b"FAIL" in d else print("  the PIN screen came up twice  ")\n')
            tb.TRANSCRIBE = [__import__('sys').executable, fake]
            code, body = call(self.base, 'POST', '/testbench/api/transcribe?id=hand&hash=' + r['hash'])
            self.assertEqual((code, body.get('text')), (200, 'the PIN screen came up twice'))
            self.assertEqual(self.items()['hand']['evidence'][0]['text'], 'the PIN screen came up twice')
            code, bad = call(self.base, 'PUT', '/testbench/api/evidence?id=hand', b'\x1a\x45\xdf\xa3FAIL')
            code, body = call(self.base, 'POST', '/testbench/api/transcribe?id=hand&hash=' + bad['hash'])
            self.assertEqual(code, 502); self.assertIn('model missing', body['error']); self.assertIn('recording is saved', body['error'])
            png_hash = call(self.base, 'PUT', '/testbench/api/evidence?id=hand', PNG)[1]['hash']
            self.assertEqual(call(self.base, 'POST', '/testbench/api/transcribe?id=hand&hash=' + png_hash)[0], 404)   # pictures are not read aloud
        finally:
            tb.TRANSCRIBE = saved

    def test_odd_picture_names_are_made_safe(self):
        call(self.base, 'PUT', '/testbench/api/evidence?id=hand&name=' + urllib.request.quote('../../etc/<b>.png'), PNG)
        self.assertEqual(self.items()['hand']['evidence'][0]['name'], '_b_.png')

    def test_tests_added_on_the_page(self):
        code, r = call(self.base, 'POST', '/testbench/api/item', {'title': 'Dark mode check', 'steps': ['open', ' ', 'look'], 'interactive': True, 'thread': 'Shell'})
        self.assertEqual(code, 400)   # a blank step
        code, r = call(self.base, 'POST', '/testbench/api/item', {'title': 'Dark mode check', 'steps': ['open', 'look'], 'interactive': True, 'thread': 'Shell'})
        self.assertEqual((code, r['id']), (200, 'p-dark-mode-check'))
        _, r2 = call(self.base, 'POST', '/testbench/api/item', {'title': 'Dark mode check', 'steps': ['again']})
        self.assertEqual(r2['id'], 'p-dark-mode-check-2')
        it = self.items()['p-dark-mode-check']
        self.assertEqual((it['section'], [x['text'] for x in it['steps']], it['interactive']['thread']), ('raven', ['open', 'look'], 'Shell'))
        self.assertEqual(call(self.base, 'POST', '/testbench/api/item', {'title': '', 'steps': ['a']})[0], 400)
        _, r3 = call(self.base, 'POST', '/testbench/api/item', {'title': 'Pick a look', 'steps': ['pick'], 'decisionLink': 'https://example.org/card'})
        _, r4 = call(self.base, 'POST', '/testbench/api/item', {'title': 'Bad link', 'steps': ['x'], 'decisionLink': 'javascript:alert(1)'})
        it = self.items()
        self.assertEqual(it[r3['id']]['decision'], {'ask': 'Pick a look', 'link': 'https://example.org/card'})
        self.assertNotIn('decision', it[r4['id']])

    def test_ci_results_from_github(self):
        r = call(self.base, 'POST', '/testbench/api/refresh')[1]
        self.assertEqual((r['ok'], r['errors']), (2, []))
        it = self.items()
        ci = it['ci']['ci']
        self.assertEqual((ci['sha'], ci['passed'], ci['total'], ci['conclusion']), ('abcdef1', 1, 2, 'failure'))
        self.assertEqual(ci['jobs'][1]['failedStep'], 'e2e')
        one = it['ci-one']['ci']
        self.assertEqual(([j['name'] for j in one['jobs']], one['passed'], one['conclusion']), (['B'], 0, 'failure'))
        self.assertTrue(any('branch=main' in c and 'status=completed' in c for c in FakeGitHub.calls))

    def test_unreachable_github_is_reported_and_old_results_stay(self):
        call(self.base, 'POST', '/testbench/api/refresh')
        tb.GITHUB = 'http://127.0.0.1:9'   # nothing there
        r = call(self.base, 'POST', '/testbench/api/refresh')[1]
        self.assertEqual(len(r['errors']), 2)
        self.assertEqual(self.items()['ci']['ci']['sha'], 'abcdef1')

    def test_new_seed_keeps_what_was_recorded(self):
        call(self.base, 'POST', '/testbench/api/note?id=hand', {'text': 'kept'})
        seed = json.loads(json.dumps(SEED)); seed['items'][0]['title'] = 'Renamed'; seed['items'][0]['status'] = 'waiting'
        self.write_seed('vcge', seed)
        it = self.items()['hand']
        self.assertEqual((it['title'], it['status'], it['notes'][0]['text']), ('Renamed', 'waiting', 'kept'))

    def test_benches_are_kept_apart(self):
        self.assertEqual(call(self.base, 'GET', '/testbench/api/items?bench=nope')[0], 404)
        self.assertEqual(call(self.base, 'GET', '/testbench/api/items?bench=../vcge')[0], 404)
        call(self.base, 'POST', '/testbench/api/note?id=pr-1&bench=shop', {'text': 'shop note'})
        self.assertEqual(call(self.base, 'POST', '/testbench/api/note?id=pr-1', {'text': 'x'})[0], 404)   # not in vcge
        self.assertEqual(self.items('shop')['pr-1']['notes'][0]['text'], 'shop note')
        self.assertTrue(os.path.isfile(os.path.join(tb.ROOT, 'shop', 'state.json')))
        data = call(self.base, 'GET', '/testbench/api/items?bench=shop')[1]
        self.assertEqual((data['bench']['title'], data['bench']['theme'], data['benches']), ('Shop bench', 'auto-fixer', ['shop', 'vcge']))

    def test_robot_steps_and_their_results(self):
        it = self.items('shop')['pr-1']
        self.assertEqual((it['steps'][0]['who'], it['steps'][0]['robot'], it['link']), ('robot', 'PASS on CI', 'https://github.com/o/r/pull/1'))
        self.assertEqual(it['stepResults']['0']['result'], 'pass')          # the seed's own state shows
        self.assertTrue(it['stepResults']['0']['fromSeed'])
        self.assertNotIn('1', it['stepResults'])
        call(self.base, 'PUT', '/testbench/api/step?id=pr-1&n=1&bench=shop', {'result': 'fail', 'note': '', 'robot': 'FAIL: run 9 on the VM'})
        call(self.base, 'PUT', '/testbench/api/step?id=pr-1&n=1&bench=shop', {'result': 'fail', 'note': 'saw it too'})
        r = self.items('shop')['pr-1']['stepResults']['1']
        self.assertEqual((r['robot'], r['note']), ('FAIL: run 9 on the VM', 'saw it too'))   # a note keeps the robot line
        call(self.base, 'PUT', '/testbench/api/step?id=pr-1&n=0&bench=shop', {'result': '', 'note': ''})
        self.assertEqual(self.items('shop')['pr-1']['stepResults']['0']['result'], '')     # raven575's change wins

    def test_real_seeds_are_valid(self):
        d = os.path.join(HERE, '..', 'benches')
        self.assertIn('vcge.json', os.listdir(d))
        for name in os.listdir(d):
            with open(os.path.join(d, name)) as f:
                seed = json.load(f)
            self.assertRegex(name[:-5], tb.BENCH_RE.pattern)
            self.assertTrue(seed['title'] and seed['theme'])
            items = seed['items']
            ids = [i['id'] for i in items]
            self.assertEqual(len(ids), len(set(ids)), name)
            for i in items:
                self.assertRegex(i['id'], tb.ID_RE.pattern)
                self.assertIn(i['section'], tb.SECTIONS)
                if i['section'] == 'raven':
                    self.assertIn(i['status'], tb.STATUSES)
                    self.assertTrue(0 < len(i['steps']) <= tb.MAX_STEPS, i['id'])
                    for st in i['steps']:
                        if isinstance(st, dict):
                            self.assertIn(st['who'], ('human', 'robot'))
                            self.assertIn(st.get('state', ''), tb.STEP_RESULTS)
                    for a in i.get('ask', []):
                        self.assertTrue(a['label'] and a['link'].startswith('https://claude.ai/code/project/'), i['id'])
                    if i.get('link'):
                        self.assertTrue(i['link'].startswith('https://github.com/real-raven575/'))
                else:
                    self.assertRegex(i['ci']['repo'], tb.REPO_RE.pattern)

    def test_layouts_save_open_list_replace_and_bin(self):
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, '..', '..', 'helper-board', 'core', 'src', 'test', 'resources', 'lab-standard.json')) as f:
            std = json.load(f)
        self.assertEqual(call(self.base, 'GET', '/testbench/api/layouts'), (200, {'layouts': []}))
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/layout?id=working', {'name': 'Big thumbs', 'layout': std})[0], 200)
        code, rec = call(self.base, 'GET', '/testbench/api/layout?id=working')
        self.assertEqual((code, rec['name'], rec['layout']), (200, 'Big thumbs', std))
        std2 = json.loads(json.dumps(std)); std2['rows'][0]['h'] = 60
        call(self.base, 'PUT', '/testbench/api/layout?id=big-thumbs', {'name': 'Big thumbs', 'layout': std})
        call(self.base, 'PUT', '/testbench/api/layout?id=big-thumbs', {'name': 'Big thumbs', 'layout': std2})
        d = os.path.join(tb.ROOT, 'layouts')
        self.assertTrue(os.path.exists(os.path.join(d, 'big-thumbs.prev.json')))   # the last version is kept
        self.assertEqual(sorted(x['id'] for x in call(self.base, 'GET', '/testbench/api/layouts')[1]['layouts']),
                         ['big-thumbs', 'working'])
        self.assertEqual(call(self.base, 'DELETE', '/testbench/api/layout?id=big-thumbs')[0], 200)
        self.assertEqual(len(os.listdir(os.path.join(d, 'bin'))), 1)   # moved to the bin, not erased
        self.assertEqual(call(self.base, 'GET', '/testbench/api/layout?id=big-thumbs')[0], 404)

    def test_bad_layouts_are_refused(self):
        bad = {'format': 'helper-board-layout', 'rows': [{'h': 48, 'keys': [{'l': 'a', 'o': 'a', 'k': 'CHAR', 'w': 1, 'g': 0}]}]}
        code, out = call(self.base, 'PUT', '/testbench/api/layout?id=x', {'name': 'x', 'layout': bad})
        self.assertEqual((code, out['error']), (400, 'the layout needs a BACKSPACE key'))
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/layout?id=../up', {'name': 'x', 'layout': bad})[0], 400)
        self.assertEqual(call(self.base, 'PUT', '/testbench/api/layout?id=x', {'layout': {'format': 'other'}})[0], 400)
        self.assertFalse(os.path.exists(os.path.join(tb.ROOT, 'layouts', 'x.json')))


if __name__ == '__main__':
    unittest.main(verbosity=2)
