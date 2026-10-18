#!/usr/bin/env python3
"""Builds the one-file installer vcge-lab-testing-install.sh from www/ and api/ (run after editing either)."""
import os, hashlib
here = os.path.dirname(os.path.abspath(__file__))
files = []
for sub in ('www', 'api'):
    for root, _, names in os.walk(os.path.join(here, sub)):
        for n in sorted(names):
            p = os.path.join(root, n)
            files.append((os.path.relpath(p, here), open(p).read()))
files.sort()
def heredoc(rel, body, target):
    tag = 'VCGE_FILE_' + hashlib.sha1(rel.encode()).hexdigest()[:8]
    assert tag not in body
    return f"mkdir -p \"$(dirname \"{target}\")\"\ncat > \"{target}\" <<'{tag}'\n{body}{'' if body.endswith(chr(10)) else chr(10)}{tag}\n"
out = [open(os.path.join(here, 'installer-head.sh')).read()]
for rel, body in files:
    if rel.startswith('www/'): target = '$W/' + rel[4:]
    else: target = '$B/vcge-testing-api'
    out.append(f'# ---- {rel}\n' + heredoc(rel, body, target))
out.append(open(os.path.join(here, 'installer-tail.sh')).read())
dest = os.path.join(here, 'vcge-lab-testing-install.sh')
open(dest, 'w').write(''.join(out))
os.chmod(dest, 0o755)
print(dest, os.path.getsize(dest), 'bytes,', len(files), 'files embedded')
