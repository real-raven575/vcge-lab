#!/usr/bin/env python3
"""Puts the Flight Deck's deck bar (one menu on every page) into a page, in place. One copy of this logic, used by
flight-deck/team-pages/build-team-pages.py for the pages in git and by deck-pages-update.sh for the live lab pages,
so a page that has extra parts on the lab server (the Reading Room's set runs) keeps them.

  put(path, bar)  html: drops the old breadcrumb, puts `bar` between the deckbar markers (or right after <body>),
                  links /deckbar.css. Python (the versions page script): fills its DECKBAR line, first turning an
                  older script's "back" link into one.
CLI: put_deckbar.py BARS.json FILE=URL [FILE=URL ...]   (BARS.json maps a page's URL to its bar)
"""
import json, re, sys

LINK = '<link rel="stylesheet" href="/deckbar.css">'


def put(path, bar):
    t = open(path, encoding='utf-8').read()
    before = t
    if path.endswith('.py') or t.startswith('#!/usr/bin/env python'):
        if not re.search(r'^DECKBAR = ', t, flags=re.M):
            t = re.sub(r"^back = \(?.*?if portal else ''\)?\n", "DECKBAR = ''\nback = ''\n", t, count=1, flags=re.M | re.S)
            t = t.replace("""'</style></head><body><main>')""", """'</style>' + ('<link rel="stylesheet" href="/deckbar.css">' if portal else '') + '</head><body>'
        + (DECKBAR if portal else '') + '<main>')""", 1)
        if not re.search(r'^DECKBAR = ', t, flags=re.M) or not ('(DECKBAR if portal' in t or 'back = DECKBAR' in t):
            raise SystemExit(f'{path}: could not find where the deck bar goes; nothing changed')
        t = re.sub(r'^DECKBAR = .*$', lambda m: 'DECKBAR = ' + repr(bar), t, count=1, flags=re.M)
    else:
        t = re.sub(r'[ \t]*<nav class="back" aria-label="Breadcrumb">.*?</nav>\n', '', t)
        t = re.sub(r'[ \t]*<a class="back" href="\.\./">&larr; Flight Deck</a>.*?Menu</a>\n', '', t)
        if '<!-- deckbar' in t:
            t = re.sub(r'<!-- deckbar.*?<!-- /deckbar -->', lambda m: bar, t, count=1, flags=re.S)
        else:
            t2 = re.sub(r'(<body[^>]*>)', lambda m: m.group(1) + '\n' + bar, t, count=1)
            if t2 == t:
                raise SystemExit(f'{path}: no <body> tag; nothing changed')
            t = t2
        if LINK not in t:
            t = t.replace('</head>', LINK + '\n</head>', 1)
    if t != before:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(t)
    return t != before


if __name__ == '__main__':
    bars = json.load(open(sys.argv[1], encoding='utf-8'))
    for arg in sys.argv[2:]:
        path, url = arg.rsplit('=', 1)
        print(f'  OK   {path}: ' + ('deck bar in' if put(path, bars[url]) else 'already up to date'))
