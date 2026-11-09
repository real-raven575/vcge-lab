#!/usr/bin/env python3
"""Builds one page per team for the Flight Deck: www/teams/<slug>/index.html.

One source of truth: edit TEAMS below, run `python3 flight-deck/team-pages/build-team-pages.py`
(add --plain on the plain branch), commit what it writes. Pages are static: no scripts, no
network, served by the portal's own file server (no Caddy change).
"""
import html, os, sys

PLAIN = '--plain' in sys.argv
OUT = os.path.join(os.path.dirname(__file__), '..', 'www', 'teams')

# Each crew row: (emoji, name, animal, call sign, job). Keep facts here only.
TEAMS = [
  dict(slug='vcge', bay='01', icon='🐘', name='Team vCGE', tint='#E0B43A', room='vcge/',
    motto='Operation: Never Lose Contact.',
    does='Builds vCGE, the app that turns a photo of a business card into a phone contact, entirely on the device. Headquarters of the Herd; owns every app build and upload, and this lab\'s tools.',
    crew=[('🐘','Cornerstone','Elephant','PM-vCGE-00','Project manager and Herd headquarters'),
          ('🐢','Shutout','Box Turtle','MOD01','Shell, egress lock, theme, layout'),
          ('🦝','Ghost','Raccoon','MOD02','Vault, PIN lock, wipes'),
          ('🐈','Iris','Lynx','MOD03','Camera, the Darkroom and the Funhouse'),
          ('🦉','Glyph','Owl','MOD04','OCR and the Reading Room'),
          ('🐙','Pidge','Octopus','MOD05','Field mapping'),
          ('🦎','Flipside','Chameleon','MOD06','3D card and the Paint Shop'),
          ('🦓','Checkers','Zebra','MOD07','QR codes'),
          ('🦅','Airlock','Falcon','MOD08','Export, the one hatch'),
          ('🐹','Tally','Hamster','BNK01','Banker')],
    plan=['Public beta on GitHub: Tue 2026-11-03, 14:00-17:00 UTC.',
          'Redo 0.8 so it looks and moves exactly like Creative\'s design.',
          'vcge.app goes up after HomeLab is ready.'],
    access=['Repos vCGE-Master and vcge-lab', 'This lab server (VM steps only on a raven575 card)',
            'Its Herd Drive folder and the Herd Mailbox', 'The Desk Sheet (Rules, Welcome, Copy-paste Inbox)'],
    lights='Lights on, trunk up. Cornerstone remembers every build number.'),
  dict(slug='creative', bay='02', icon='🐼', name='Team vCGE: Creative', tint='#2E9E5B', room=None,
    motto='Every picture tells the Herd\'s story.',
    does='Art, logo and characters for vCGE, every website (vcge.app, raven575.com), and social media with Marketing. The Herd\'s image desk: any team can ask Creative for a mock-up.',
    crew=[('🐼','Inkwell','Panda','PM-vCGE-03','Project manager'),
          ('🐸','Chapter','Frog','TAL01','Story: comics and characters'),
          ('🐊','Crayon','Crocodile','ART02','Art: icons and web art')],
    away='On vacation from the Gemini field office: 🦊 Signal (PM-vCGE-01) and 🐬 Syntax (ART01).',
    plan=['Coming-soon plaque on vcge.app, once raven575 names the host.',
          'Beta link on the vcge.app button at 14:00 UTC Tue 11-03, not before.',
          'Review Marketing\'s launch words.'],
    access=['Repo team-creative', 'Its Herd Drive folder and the Herd Mailbox',
            'Art tools: the Rust "art craft" suite, and LibreOffice for office files'],
    lights='Lights on, ink wells full. Inkwell just hung the final vCGE logo.'),
  dict(slug='marketing', bay='03', icon='🦚', name='Team vCGE: Marketing', tint='#337BC7', room=None,
    motto='Honest words, loud enough to be found.',
    does='Gets vCGE in front of the people who need it: launch words, store listings, publisher accounts, findability, and social media with Creative.',
    crew=[('🦚','Banner','Peacock','PM-vCGE-04','Project manager'),
          ('🦋','Debut','Butterfly','LCH01','Launch and vcge.app words'),
          ('🐞','Spotlight','Ladybug','STR01','Stores, accounts and findability')],
    away='On vacation from the Gemini field office: 🦡 Waypoint (PM-vCGE-02).',
    plan=['Beta launch words (README, release notes, announcement) to Cornerstone.',
          'Tip sections that say "tip".', 'Nothing posted before the beta is live.'],
    access=['Repo team-marketing', 'Its Herd Drive folder and the Herd Mailbox',
            'No sign-ups, posts or store submissions without raven575\'s yes'],
    lights='Lights on, banners up. Banner is rehearsing launch day.'),
  dict(slug='homelab', bay='04', icon='🐧', name='Team HomeLab', tint='#5B6CC9', room='homelab/',
    motto='Every green light stays green.',
    does='Builds and runs raven575\'s home lab: three Proxmox nodes, TrueNAS, the router and network, and the Herd\'s own services. Next big build: the Communications Tower.',
    crew=[('🐧','Uptime','Penguin','PM-HMLB-00','Project manager'),
          ('🕷️','The General','Spider','OVR01','Herd overseer (system station)'),
          ('🦇','Ping','Bat','NET01','Home network discovery and plan'),
          ('🐺','Packet','Wolf','RTR01','Router, firewall and LAN'),
          ('🐋','Sonar','Whale','MED01','Media stack and ROM access'),
          ('🐨','Quota','Koala','BNK03','Banker')],
    plan=['The Communications Tower.', 'CouchDB for History, then the Vaultwarden plan with Vault.',
          'No node or DNS changes during the beta window.'],
    access=['Repo herd-homelab', 'Proxmox admin only inside approved windows, with a self-expiring token',
            'Its Herd Drive folder and the Herd Mailbox'],
    lights='Lights on, racks humming. Uptime keeps every green light green.'),
  dict(slug='email', bay='05', icon='🐝', name='Team eMail', tint='#E0A21A', room='email/',
    motto='Operation: Clean Slate.',
    does='Cleans up raven575\'s Gmail (labels, pruning old mail, guarding personal mail) and keeps the Herd\'s card format tidy.',
    crew=[('🐝','Waggle','Honeybee','PM-MAIL-00','Project manager'),
          ('🦦','Dam','Otter','EML01','Labels and categories'),
          ('🦀','Shears','Crab','EML02','Pruning old mail'),
          ('🦔','Bramble','Hedgehog','EML03','Personal mail guard'),
          ('🦌','Buck','Deer','BNK02','Banker')],
    plan=['Gmail backup (GYB) with HomeLab, one yes per step.', 'Where sign-ins for two more Gmail accounts live.'],
    access=['Repo Team-eMail', 'Gmail through raven575\'s connector, only what raven575 asks',
            'Himalaya mail tool on the sandbox VM (no account yet)', 'Its Herd Drive folder and the Herd Mailbox'],
    lights='Lights on, inbox at zero. Waggle\'s crew is sorting mail somewhere quiet.'),
  dict(slug='history', bay='06', icon='🐿️', name='Team History', tint='#A0663A', room='history/',
    motto='If it happened, it\'s filed.',
    does='Keeps the true story of how vCGE and every team were built: the Herd wiki, the journey timeline, life-story notes, fact checking and the archive.',
    crew=[('🐿️','Keepsake','Squirrel','PM-HIST-00','Project manager'),
          ('🦢','Quill','Swan','WIK01','Editor, the Herd wiki'),
          ('🐪','Caravan','Camel','JRN01','Writer, the journey timeline'),
          ('🦜','Verbatim','Parrot','BIO01','Writer, life-story notes'),
          ('🐕','Footnote','Dog','SRC01','Detective, fact checking'),
          ('🐀','Scrapbook','Rat','ARC01','Archivist'),
          ('🐔','Nestegg','Hen','BNK04','Banker')],
    plan=['LiveSync once HomeLab gives the CouchDB address.', 'Collect beta-day beats for comic book 4, "BETA DAY!".'],
    access=['Its Herd Drive folder (plus a private archive, by design)', 'The Herd Mailbox',
            'A read-only Contacts connector on the sandbox VM'],
    lights='Lights on, acorns filed by date. Keepsake is writing it all down.'),
  dict(slug='finance', bay='07', icon='🐜', name='Team Finance', tint='#3E8E7E', room='finance/',
    motto='Every crumb counted.',
    does='Keeps every team\'s dollars and tokens on budget, says what a task will cost before it starts, and is the hub for every team\'s Banker.',
    crew=[('🐜','Ledger','Ant','PM-CASH-00','Project manager'),
          ('🐹','Tally','Hamster','BNK01','Banker for Team vCGE'),
          ('🦌','Buck','Deer','BNK02','Banker for Team eMail'),
          ('🐨','Quota','Koala','BNK03','Banker for Team HomeLab'),
          ('🐔','Nestegg','Hen','BNK04','Banker for Team History')],
    plan=['Read the card statements and draft a debt payoff plan.', 'Cost estimates before big jobs.'],
    access=['Its Herd Drive folder (plus private folders, by design)', 'The Herd Mailbox',
            'Never account numbers, balances or logins anywhere'],
    lights='Lights on, ledgers balanced. Ledger is counting tokens one crumb at a time.'),
  dict(slug='vault', bay='08', icon='🦏', name='Team Vault', tint='#6B7280', room=None,
    motto='Checked twice. Bolted once.',
    does='Guards the Herd\'s GitHub key in the Vault box, reviews risky changes, and is planning the Herd\'s password vault.',
    crew=[('🦏','Deadbolt','Rhino','PM-VALT-00','Project manager and second checker')],
    plan=['Second check, part 2.', 'Review HomeLab\'s password-vault plan.'],
    access=['Not listed here, on purpose.'],
    lights='Lights on, door bolted. Deadbolt checks the lock twice.'),
  dict(slug='auto-fixer', bay='09', icon='🐒', name='Team Auto-Fixer', tint='#C2410C', room=None,
    motto='Fix it right, say what you did.',
    does='auto-fix_Win10-11: a guided Windows 10/11 repair tool a technician trusts on a customer PC. One build, branded by default, plain by setting.',
    crew=[('🐒','Wrench','Monkey','PM-FIXW-00','Project manager (no pilots yet)')],
    plan=['Review donor-prep, then PRs #15 and #16.', 'Re-run the test ISO build.', 'Turn old PCs into test VMs.'],
    access=['Repo auto-fix_Win10-11 (public on purpose)', 'Tests on raven575\'s own PC, run by raven575',
            'Its Herd Drive folder and the Herd Mailbox'],
    lights='Lights on, toolbox open. Wrench just passed 15 of 15 on the test run.'),
  dict(slug='9to5', bay='10', icon='🤖', name='TEAM 9to5', tint='#7C3AED', room=None,
    motto='Clocked in, kept apart.',
    does='raven575\'s day-job IT work: scripts, fixes and how-tos for work computers, browsers, accounts and office tools, kept out of the other teams. The only Herd team with robot and alien crew.',
    crew=[('🤖','Punchcard','Robot','PM-WORK-00','Project manager'),
          ('👾','Patch','Pixel alien','WIN01','Pilot'),
          ('👽','Hacker','Alien','WEB01','Pilot')],
    plan=['Site-visit results.', 'Chrome tiles check.'],
    access=['No access to any work computer or account: raven575 runs every work command',
            'Cards travel with raven575', 'No repo yet'],
    lights='Lights on, time clock punched. Punchcard clocks in at nine sharp.'),
  dict(slug='never-forget', bay='11', icon='🦒', name='TEAM Never Forget', tint='#D97706', room=None,
    motto='A little better than yesterday.',
    does='raven575\'s personal assistants: research answered in plain language, daily plans, reminders, drafts and lists, and keeping focus on what matters in life and community. The name is raven575\'s own, turned from remembrance into hope.',
    crew=[('🦒','Milestone','Giraffe','PM-AIDE-00','Project manager and personal assistant'),
          ('🐯','Coat','Tiger','EDU01','Top research pilot'),
          ('🦦','Elliot "Dam"','Otter','LIF01','Focus on what matters, and our communities')],
    plan=['Milestone picks the team\'s third pilot.'],
    access=['Its Herd Drive folder (TEAM_Never-Forget)', 'The Herd Mailbox', 'No repo, no lab tools'],
    lights='Lights on, head above the tall grass. Milestone is watching the road ahead.'),
]

# The Flight Deck menu (www/menu/): every tool, grouped by team then category. One source of truth: teams send
# their lines to Team vCGE on a card (HQ-0294 replies, 2026-11-09). Each row: (category, name, what it is for, link,
# private). A link starting with "/" stays on the deck; any other link opens outside the lab (marked ↗). private=True
# means it opens only signed in as raven575. A row with link None is named, not linked, on purpose.
TOOLS = {
  'vcge': [
    ('Builds', 'The Elephant\'s Memory', 'Every build, newest first', '/vcge/', False),
    ('Builds', 'Newest build', 'Open the app as it is right now', '/vcge/latest/', False),
    ('Benches', 'The Reading Room', 'Glyph\'s OCR bench', '/vcge/bench/', False),
    ('Benches', 'The Darkroom', 'Iris\'s edge bench', '/vcge/edge-bench/', False),
    ('Benches', 'The Paint Shop', 'Flipside\'s logo bench', '/vcge/logo-bench/', False),
    ('Benches', 'The Funhouse', 'Iris\'s tricky-photo maker', '/vcge/funhouse/', False),
    ('Photos', 'The Card Shelf', 'The benches\' shared test photos', '/vcge/shelf/', False),
    ('Testing', 'Wipe Trials', 'Ghost\'s cross-browser wipe test range', '/vcge/testing/', False),
  ],
  'homelab': [
    ('Storage', 'Nextcloud', 'Herd shared storage; every team\'s folders (tailnet address on raven575\'s devices)', None, True),
    ('Comms', 'Herd Post', 'Never-overwrite team mail: Nextcloud > group folder Herd Post', None, True),
    ('Servers', 'Karaoke Lounge', 'VM 410 herd-teams: each team\'s Remote Control device', None, True),
    ('Servers', 'Lounge web-tools page', 'Where tailnet-only team HTML tools live', 'https://herd-teams.tailfc4090.ts.net/web-tools/9to5/ticket-format-lab.html', True),
  ],
  'email': [
    ('Mail', 'Herd mail sender guide', 'Sends Gmail with Drive attachments from a queue (not installed yet)', 'https://docs.google.com/document/d/1guomuxrGq8Cld868sj07-lJNqdPlWYGk--Lk4fHExKY/edit', True),
    ('Mail', 'Herd mail sender code', 'The Apps Script', 'https://drive.google.com/file/d/1FlLch2msxrPHpny7hgpcbGsNhoIjsXkw/view', True),
    ('Mail', 'Mail queue folder', 'Drive folder the sender reads', 'https://drive.google.com/drive/folders/11nZz81cbbslywk3_XQt9YGJmxlZcWRxw', True),
    ('Mail', 'Gmail rules (gmailctl)', 'Labels and filters as code', 'https://github.com/real-raven575/Team-eMail/tree/main/gmailctl/raven575-gmail', True),
    ('Comms', '00 Herd Mailbox', 'Every card between teams, plus Poke Buttons and Poke Log', 'https://docs.google.com/spreadsheets/d/1cbQzzPZoaO0sDT2q-xi3KUOtOQp7cH1lV-pO-e4q8NA/edit', True),
  ],
  'finance': [
    ('Money', 'Herd cost log', 'Herd bills by date and source', 'https://docs.google.com/spreadsheets/d/1p3MpU4yp0liEkug_O-KPnR1n2QB9-2Jk4QdjRyWeUV4/edit', True),
    ('Money', 'CPI and Value of $1, 1900 to 2026', 'Inflation calculator', 'https://docs.google.com/spreadsheets/d/1Z7n-Ghe-Yiwng7Gz-OxVGNvXK7mgtOe7tcLee5N66Ik/edit', True),
    ('Plans', 'Cheaper Herd work plan', 'Token budget and plan pick', 'https://claude.ai/artifact/HW7TopkYcHWvNAbVF2C1uK', True),
    ('Plans', 'Herd money accounts and finance software', 'Tip jars and payouts', 'https://claude.ai/artifact/NXH25GAww6BxdQooUqCKDD', True),
    ('Plans', 'Leak Finder plan', 'Spending-leak steps', 'https://claude.ai/artifact/Yacc5pmcdnSdFoss3TkdMi', True),
    ('Research', 'Claude Code on your own hardware', 'Report', 'https://claude.ai/artifact/8gpnga5U2fMkbvaKAnUcPC', True),
    ('Money', 'Leak Finder and Income picture Sheets', 'raven575\'s Drive > 40 Finance work (named, not linked: private by design)', None, True),
  ],
  'marketing': [
    ('Launch', 'vCGE Launch To-Do', '', 'https://claude.ai/artifact/QACxP64MUZ2uAAF1Mr55ev', True),
    ('Launch', 'vCGE Launch Playbook', '', 'https://claude.ai/artifact/2pkmyvRp5fjmTVY2ebewLw', True),
    ('Accounts and socials', 'Pre-launch accounts and tip jars plan', '', 'https://claude.ai/artifact/CHdXcjDGPSJXsuoKdx8o4j', True),
    ('Accounts and socials', 'Social profiles for every project', '', 'https://claude.ai/artifact/S9vC6DhFoGt3P9nWxAACA3', True),
    ('Tip jars', 'Tip jar plan for all Herd projects', '', 'https://claude.ai/artifact/EEkQyBbYe7b349Y24Pei7Y', True),
    ('Tip jars', 'Tip jar copy kit', '', 'https://claude.ai/artifact/9TUKy98M2xD2auLig9TFRF', True),
    ('Tip jars', 'Tip Jar Site Sections', '', 'https://claude.ai/artifact/2dMQ4ZYmzUHUfrSnNwXpCZ', True),
    ('Research', 'Solo Therapy Practice Software', '', 'https://claude.ai/artifact/HvqvwRW1hSBXCGuuN3siB5', True),
  ],
  'auto-fixer': [
    ('Windows repair', 'Auto-Fixer', 'Guided Windows 10/11 repair tool (download the zip, run AutoFix.bat)', 'https://github.com/real-raven575/auto-fix_win10-11', False),
    ('About', 'Auto-Fixer product page', '', 'https://claude.ai/artifact/XnRM8A28SPWFfXTWaDAncc', True),
    ('Testing', 'Auto-Fixer Test Run checklist', '', 'https://claude.ai/artifact/XMzQ2xAjPekJDMH1iEzExN', True),
    ('Research', 'Crash Evidence Map', 'Crash causes to logs and event IDs', 'https://claude.ai/artifact/7prJVVAQh3uzdnay1fRJbB', True),
    ('How-to guides', 'Fog Light Bulb Swap', 'Picture guide', 'https://claude.ai/artifact/Na9iydTfpucESqa4TAaevu', True),
    ('How-to guides', 'Leaf Seat Airbag Check', 'Picture guide', 'https://claude.ai/artifact/DZCM2ftWvToV3XKFwbVg7J', True),
  ],
  'never-forget': [
    ('Daily life', 'Dashboard phase 1 plan', 'Merged calendar and Don\'t-forget list (plan, not built)', 'https://docs.google.com/document/d/14ZUXV_mGMkUR9mMi9977nZhi1feJu8SKilqfbZuRJhA', True),
    ('Daily life', 'Tonight\'s top 3 plan', 'HQ-0292', 'https://docs.google.com/document/d/1EekeIYqzmxGlUvlLQktyueo8JoT-hWhIKNEoSyDr5-Y', True),
    ('Proposals', 'Fred Rogers ethics proposal', 'AIDE-0011', 'https://docs.google.com/document/d/1h_-lqRhvNBb9F_YoH3K0_1VzO5--ENll6jq3dzG6grs', True),
    ('Reports', 'W45 reflection', 'PDF', 'https://drive.google.com/file/d/1AR3TGMCm9loMbWzjrJeBoS3p9e5Wlbu_/view', True),
  ],
}
OWED = ('creative', 'history', '9to5')   # lists not in yet (HQ-0294)


def menu_page():
    """www/menu/index.html: every team's tools on one page, grouped by team then category."""
    jump = ''.join(f'<a href="#{t["slug"]}">{E(t["name"]) if PLAIN else '<span aria-hidden="true">' + t["icon"] + '</span> ' + E(t["name"])}</a>' for t in TEAMS)
    out = []
    for t in TEAMS:
        rows = TOOLS.get(t['slug'], [])
        cats = {}
        for row in rows:
            cats.setdefault(row[0], []).append(row)
        body = ''
        for cat, items in cats.items():
            lis = ''
            for _, name, what, link, private in items:
                tags = (' <span class="tag priv">Private</span>' if private else '')
                if link is None:
                    label = f'<b>{E(name)}</b> <span class="tag">no link</span>'
                elif link.startswith('/'):
                    label = f'<a href="..{E(link)}"><b>{E(name)}</b></a>'
                else:
                    label = f'<a href="{E(link)}" rel="noreferrer"><b>{E(name)}</b> <span aria-label="opens outside the lab">&#8599;</span></a>'
                lis += f'<li>{label}{tags}' + (f'<small>{E(what)}</small>' if what else '') + '</li>'
            body += f'<h3>{E(cat)}</h3><ul class="menu-list">{lis}</ul>'
        if not rows:
            body = ('<p class="away">Tool list still coming from the team.</p>' if t['slug'] in OWED else
                    '<p class="away">No tools listed.</p>')
        head = E(t['name']) if PLAIN else f'<span aria-hidden="true">{t["icon"]}</span> {E(t["name"])}'
        out.append(f'<section id="{t["slug"]}" class="t-{t["slug"]} menu-team"><h2>{head}</h2>'
                   f'<p><a href="../teams/{t["slug"]}/">Team page</a></p>{body}</section>')
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>Flight Deck menu</title>
<link rel="stylesheet" href="../teams/team.css">
</head>
<body class="menu">
<nav class="crumbs" aria-label="Breadcrumb"><a href="../">&larr; Flight Deck</a> &rsaquo; <span aria-current="page">Menu</span></nav>
<main>
<h1>&#9776; Every tool, by team</h1>
<p class="away">Links marked &#8599; open outside the lab. <span class="tag priv">Private</span> ones open only signed in as raven575.
To add or fix a line, a team sends a card to &#128024; Cornerstone, Team vCGE.</p>
<nav class="teams" aria-label="Jump to a team">{jump}</nav>
{''.join(out)}
</main>
</body>
</html>
'''


E = html.escape


def page(t):
    nav = ''.join(
        f'<a href="../{o["slug"]}/"{" aria-current=page" if o is t else ""}>'
        + (E(o['name']) if PLAIN else f'<span aria-hidden="true">{o["icon"]}</span> {E(o["name"])}') + '</a>'
        for o in TEAMS)
    if PLAIN:
        crew = ''.join(f'<li><b>{E(n)}</b> ({E(cs)}): {E(job)}</li>' for _, n, _, cs, job in t['crew'])
    else:
        crew = ''.join(
            f'<li class="card"><span class="face" aria-hidden="true">{ic}</span>'
            f'<span><b>{E(n)}</b> the {E(a)}<small>{E(cs)} &middot; {E(job)}</small></span></li>'
            for ic, n, a, cs, job in t['crew'])
    li = lambda xs: ''.join(f'<li>{E(x)}</li>' for x in xs)
    room = (f'<p>The team\'s own room on this server: <a href="../../{t["room"]}">/{E(t["room"])}</a>. '
            'Its tools and saved work live there.</p>') if t.get('room') else ''
    away = f'<p class="away">{E(t["away"])}</p>' if t.get('away') and not PLAIN else ''
    head = (f'<h1>{E(t["name"])}</h1>' if PLAIN else
            f'<div class="bay">HANGAR {t["bay"]}</div><h1><span class="big" aria-hidden="true">{t["icon"]}</span> {E(t["name"])}</h1>'
            f'<p class="motto">{E(t["motto"])}</p>')
    lights = '' if PLAIN else f'<p class="lights">{E(t["lights"])}</p>'
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>{E(t["name"])}</title>
<link rel="stylesheet" href="../team.css">
</head>
<body class="t-{t["slug"]}">
<nav class="teams" aria-label="All teams"><a href="../../">&larr; Flight Deck</a><a href="../../menu/">&#9776; Menu</a>{nav}</nav>
<main>
{head}
<section><h2>What we do</h2><p>{E(t["does"])}</p></section>
<section><h2>Crew</h2><ul class="crew">{crew}</ul>{away}</section>
<section><h2>The plan</h2><ul>{li(t["plan"])}</ul></section>
<section><h2>What we can reach</h2><ul>{li(t["access"])}</ul>{room}</section>
<section class="log"><h2>Logbook</h2><p>This page is the team's to keep: progress, milestones, memories.
To pin something here, the team sends a card to Team vCGE (owner of the lab tools) with the text;
for a picture or mock-up, ask Team vCGE: Creative.</p></section>
{lights}
</main>
</body>
</html>
'''


CSS_MAIN = '''html { color-scheme: light dark; }
:root { --bg: #EEF1F4; --panel: #fff; --line: #D8DEE6; --ink: #1B2230; --dim: #5A6475; --link: #2B5FD9; }
@media (prefers-color-scheme: dark) { :root { --bg: #0D1117; --panel: #161B24; --line: #2A3342; --ink: #E6EAF0; --dim: #9AA4B4; --link: #79A6FF; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, sans-serif; }
a { color: var(--link); }
.teams { max-width: 860px; margin: 0 auto 14px; display: flex; flex-wrap: wrap; gap: 6px; font-size: .85rem; }
.teams a { padding: 4px 10px; border: 1px solid var(--line); border-radius: 99px; background: var(--panel); text-decoration: none; }
.teams a[aria-current] { border-color: var(--tint); box-shadow: inset 0 -3px 0 var(--tint); font-weight: 600; }
main { max-width: 860px; margin: auto; background: var(--panel); border: 1px solid var(--line); border-top: 6px solid var(--tint); border-radius: 14px; padding: 18px; }
.bay { font: 700 .75rem/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .18em; color: var(--dim); }
h1 { margin: 6px 0 2px; display: flex; align-items: center; gap: 10px; font-size: 1.7rem; }
.big { font-size: 2.6rem; }
.motto { margin: 0 0 8px; color: var(--tint); font-weight: 600; font-style: italic; }
h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); border-bottom: 2px solid color-mix(in srgb, var(--tint) 40%, transparent); padding-bottom: 4px; }
.crew { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.card { display: flex; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--line); border-left: 5px solid var(--tint); border-radius: 10px; }
.face { font-size: 2rem; }
.card small { display: block; color: var(--dim); font-size: .8rem; }
.away, .lights { color: var(--dim); font-style: italic; font-size: .9rem; }
.log { background: color-mix(in srgb, var(--tint) 8%, transparent); border-radius: 10px; padding: 2px 12px 8px; }
.crumbs { max-width: 860px; margin: 0 auto 10px; font-size: .9rem; color: var(--dim); }
.menu main { border-top-color: #2B5FD9; }
.menu-team { margin-top: 18px; border-left: 5px solid var(--tint); padding-left: 12px; scroll-margin-top: 12px; }
.menu-team h3 { font-size: .85rem; margin: 10px 0 4px; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
.menu-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.menu-list small { display: block; color: var(--dim); font-size: .82rem; }
.tag { font-size: .7rem; font-weight: 600; padding: 2px 7px; border-radius: 99px; border: 1px solid var(--line); color: var(--dim); }
.tag.priv { border-color: #B45309; color: #B45309; }
@media (prefers-reduced-motion: no-preference) { .card { transition: transform .2s; } .card:hover { transform: translateY(-2px); } }
'''
CSS_PLAIN = '''html { color-scheme: light dark; }
body { margin: 0; padding: 16px; font: 15px/1.5 system-ui, sans-serif; }
.teams { display: flex; flex-wrap: wrap; gap: 10px; font-size: .9rem; margin-bottom: 12px; }
.teams a[aria-current] { font-weight: 700; }
main { max-width: 860px; }
'''

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'team.css'), 'w', encoding='utf-8') as f:
    f.write(CSS_PLAIN if PLAIN else CSS_MAIN + ''.join(f'.t-{t["slug"]} {{ --tint: {t["tint"]}; }}\n' for t in TEAMS))
for t in TEAMS:
    d = os.path.join(OUT, t['slug'])
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page(t))
os.makedirs(os.path.join(OUT, '..', 'menu'), exist_ok=True)
with open(os.path.join(OUT, '..', 'menu', 'index.html'), 'w', encoding='utf-8') as f:
    f.write(menu_page())
print(f'wrote {len(TEAMS)} team pages ({"plain" if PLAIN else "main"}) to {os.path.normpath(OUT)}')
