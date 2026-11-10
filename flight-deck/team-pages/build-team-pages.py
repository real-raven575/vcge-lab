#!/usr/bin/env python3
"""Builds one page per team for the Flight Deck: www/teams/<slug>/index.html.

One source of truth: edit TEAMS below, run `python3 flight-deck/team-pages/build-team-pages.py`
(add --plain on the plain branch), commit what it writes. Pages are static: no scripts, no
network, served by the portal's own file server (no Caddy change).
"""
import html, json, os, sys

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
    plan=['vCGE 0.8.1 is live on GitHub Pages (released Sat 2026-11-07).',
          'Next: 0.8 bug fixes, the plain-edition merge, and translations wave 1 (es, pt-BR, fr, de, id).',
          'A themeable look, built with Creative\'s colour tokens.',
          'vcge.app goes up after HomeLab is ready.'],
    access=['Repos vCGE-Master and vcge-lab', 'This lab server (VM steps only on a raven575 card)',
            'Its Herd Drive folder and the Herd Mailbox', 'The Desk Sheet (Rules, Welcome, Copy-paste Inbox)'],
    lights='Lights on, trunk up. Cornerstone remembers every build number.',
    spotlight=dict(
      who='Cornerstone the Elephant · PM-vCGE-00 · Herd headquarters',
      img='elephant.svg',
      lines=['Before there was a team, there was a building site. Cornerstone was the surveyor who pressed one great foot into '
             'the mud to find where the ground was firm. Her note on the site office door read: "Good parts. No floor. Call me." '
             'raven575 called.',
             'Her first act was not to build anything. She drew one square on the ground and set a stone in its corner: no '
             'internet, nothing kept, and every hand-off goes through the vault. Every pilot is still measured against it.',
             'She does not fly a module, and says so with some pride. She holds the formation: every message carried word for '
             'word, every plan checked against the corner stone, and every big call brought to raven575, who always gets the '
             'last word. Today that formation is the whole Herd: the HQ cards, the Mailbox, and this Flight Deck.'],
      signals=[('Both ears up', 'hold position'), ('One ear flicked', 'your turn'),
               ('Two taps of the trunk', 'decision made'), ('Reading glasses on', 'the rules, read out loud')],
      quote='Let\'s lay some groundwork.',
      colors=[('Sunrise gold', '#E0B43A'), ('Slate gray', '#5F6B7A'), ('Sandstone', '#D8C3A0')])),
  dict(slug='creative', bay='02', icon='🐼', name='Team vCGE: Creative', tint='#2E9E5B', room=None,
    motto='Every picture tells the Herd\'s story.',
    does='Art, logo and characters for vCGE, every Herd website (herdofhelpers.com and the team sites), and social media with Marketing. The Herd\'s image desk: any team can ask Creative for a mock-up.',
    crew=[('🐼','Inkwell','Panda','PM-vCGE-03','Project manager'),
          ('🐸','Chapter','Frog','TAL01','Story: comics and characters'),
          ('🐊','Crayon','Crocodile','ART02','Art: icons and web art')],
    away='On vacation from the Gemini field office: 🦊 Signal (PM-vCGE-01) and 🐬 Syntax (ART01).',
    plan=['Add TEAM Never Forget to every Herd site page (HQ-0295).',
          'The Auto-Fixer website and wiki (FIXW-0025).',
          'Colour tokens for vCGE\'s themeable look, then emblems and account art.',
          'Character stats and stories for every team (HQ-0302; drafts until raven575 says canon).'],
    access=['Repo team-creative', 'Its Herd Drive folder and the Herd Mailbox',
            'Art tools: the Rust "art craft" suite, and LibreOffice for office files'],
    lights='Lights on, ink wells full. Inkwell just hung the final vCGE logo.'),
  dict(slug='marketing', bay='03', icon='🦚', name='Team vCGE: Marketing', tint='#337BC7', room=None,
    motto='Honest words, loud enough to be found.',
    does='Gets vCGE in front of the people who need it: launch words, store listings, publisher accounts, findability, and social media with Creative.',
    crew=[('🦚','Banner','Peacock','PM-vCGE-04','Project manager'),
          ('🦋','Debut','Butterfly','LCH01','Launch and vcge.app words'),
          ('🐞','Spotlight','Ladybug','STR01','Stores, accounts and findability')],
    away='🦡 Waypoint (was PM-vCGE-02) is back from vacation and now flies for Team eMail as EML04.',
    plan=['README and release-note drafts for the v0.9.0-beta pre-release (MKTG-0015).',
          'Press kit and privacy notice v2.',
          'Store listing drafts once there are screenshots; nothing is posted without raven575\'s yes.'],
    access=['Repo team-marketing', 'Its Herd Drive folder and the Herd Mailbox',
            'No sign-ups, posts or store submissions without raven575\'s yes'],
    lights='Lights on, banners up. Banner is rehearsing launch day.'),
  dict(slug='homelab', bay='04', icon='🐧', name='Team HomeLab', tint='#5B6CC9', room='homelab/',
    motto='Every green light stays green.',
    does='Builds and runs raven575\'s home lab: three Proxmox nodes, TrueNAS, the router and network, and the Herd\'s own services. Next big build: the Communications Tower.',
    crew=[('🐧','Uptime','Penguin','PM-HMLB-00','Project manager'),
          ('🕷️','General Switchboard','Spider','OVR01','"The General": Herd overseer (system station)'),
          ('🦇','Ping','Bat','NET01','Home network discovery and plan'),
          ('🐺','Packet','Wolf','RTR01','Router, firewall and LAN'),
          ('🐋','Sonar','Whale','MED01','Media stack and ROM access'),
          ('🐨','Quota','Koala','BNK03','Banker')],
    plan=['Move the Karaoke Lounges to node04 (raven575 racks it and runs the setup script).',
          'Lounge tools v2, then the TEAM Never Forget login.',
          'Nextcloud phase 6, CouchDB for History, and the Communications Tower.'],
    access=['Repos herd-homelab and Herd-Comms-Tower', 'Proxmox admin only inside approved windows, with a self-expiring token',
            'Its Herd Drive folder and the Herd Mailbox'],
    lights='Lights on, racks humming. Uptime keeps every green light green.'),
  dict(slug='email', bay='05', icon='🐝', name='Team eMail', tint='#E0A21A', room='email/',
    motto='Operation: Clean Slate.',
    does='Cleans up raven575\'s Gmail (labels, pruning old mail, guarding personal mail) and keeps the Herd\'s card format tidy.',
    crew=[('🐝','Waggle','Honeybee','PM-MAIL-00','Project manager'),
          ('🦡','Waypoint','Badger','EML04','Labels and categories'),
          ('🦀','Shears','Hermit Crab','EML02','Pruning old mail'),
          ('🦔','Bramble','Hedgehog','EML03','Personal mail guard'),
          ('🦌','Buck','Deer','BNK02','Banker')],
    away='🦦 Dam (EML01) moved to TEAM Never Forget.',
    plan=['The Herd Post mail merge with HomeLab (HQ-0269).',
          'Gmail backup (GYB) after the Lounge move, one yes per step.',
          'gmailctl labels as code, then label moves; each prune batch gets its own yes.'],
    access=['Repos Team-eMail and Herd-Comms-Tower', 'Gmail through raven575\'s connector, only what raven575 asks',
            'Himalaya mail tool on the sandbox VM (no account yet)', 'Its Herd Drive folder and the Herd Mailbox'],
    lights='Lights on, inbox at zero. Waggle\'s crew is sorting mail somewhere quiet.'),
  dict(slug='history', bay='06', icon='🐿️', name='Team History', tint='#A0663A', room='history/',
    motto='If it happened, it\'s filed.',
    does='Keeps the true story of how vCGE and every team were built: the Herd wiki, the journey timeline, life-story notes, fact checking and the archive.',
    crew=[('🐿️','Keepsake','Squirrel','PM-HIST-00','Project manager'),
          ('🦢','Quill','Swan','WIK01','Editor, the Herd wiki'),
          ('🐪','Caravan','Camel','JRN01','Writer, the journey timeline'),
          ('🦜','Verbatim','Parrot','BIO01','Writer, life-story notes'),
          ('🐕','Footnote','Bloodhound','SRC01','Detective, fact checking and sources'),
          ('🐀','Scrapbook','Pack Rat','ARC01','Archivist'),
          ('🐔','Nestegg','Hen','BNK04','Banker')],
    plan=['Finish the Herd Misunderstanding Log and Glossary v3.',
          'The W45 wiki chapter, then Meet the Herd.',
          'LiveSync once HomeLab gives the CouchDB address.'],
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
          ('🐔','Nestegg','Hen','BNK04','Banker for Team History'),
          ('🦥','Layaway','Sloth','SHP01','Shopper: watches prices and reports; buys nothing')],
    plan=['A pace check on every Mailbox run, and cost estimates before big jobs.',
          'A price sweep with Layaway, and the money advice sheet.',
          'The Leak Finder, once the new statements are in.'],
    access=['Its Herd Drive folder (plus private folders, by design)', 'The Herd Mailbox',
            'Never account numbers, balances or logins anywhere'],
    lights='Lights on, ledgers balanced. Ledger is counting tokens one crumb at a time.'),
  dict(slug='vault', bay='08', icon='🦏', name='Team Vault', tint='#6B7280', room=None,
    motto='Checked twice. Bolted once.',
    does='Guards the Herd\'s GitHub key in the Vault box, reviews risky changes, and is planning the Herd\'s password vault.',
    crew=[('🦏','Deadbolt','Rhino','PM-VALT-00','Project manager and second checker')],
    plan=['Sheriff desk: any doubtful "approved" card comes to Vault for a check (FIXW-0019).',
          'Second check, part 2.', 'Review HomeLab\'s password-vault plan.'],
    access=['Not listed here, on purpose.'],
    lights='Lights on, door bolted. Deadbolt checks the lock twice.'),
  dict(slug='auto-fixer', bay='09', icon='🐒', name='Team Auto-Fixer', tint='#C2410C', room=None,
    motto='Operation: Back on Its Feet.',
    does='auto-fix_Win10-11: a guided Windows 10/11 repair tool a technician trusts on a customer PC. One build, branded by default, plain by setting.',
    crew=[('🐒','Wrench','Monkey','PM-FIXW-00','Project manager'),
          ('🦘','Rivet "Roo"','Kangaroo','ENG01','Engineer: PowerShell, Pester and CI')],
    plan=['The PR #20 lint pass.', 'The Office kit in Technician mode (FIXW-0024).',
          'A website refresh with Creative; PRs #17, #18 and #21 after the Windows test box.'],
    access=['Repo auto-fix_Win10-11 (public on purpose)', 'Tests on raven575\'s own PC, run by raven575',
            'Its Herd Drive folder and the Herd Mailbox'],
    lights='Lights on, toolbox open. Wrench just passed 15 of 15 on the test run.'),
  dict(slug='9to5', bay='10', icon='🤖', name='TEAM 9to5', tint='#7C3AED', room=None,
    motto='Clocked in, kept apart.',
    does='raven575\'s day-job IT work: scripts, fixes and how-tos for work computers, browsers, accounts and office tools, kept out of the other teams. The only Herd team with robot and alien crew.',
    crew=[('🤖','Punchcard "Punch"','Robot','PM-WORK-00','Project manager'),
          ('👾','Patch','Alien Monster','WIN01','Windows and scripts'),
          ('👽','Hacker','Alien','WEB01','Browsers and accounts')],
    plan=['A Windows test box, once raven575 says yes (WORK-0029).',
          'Verify the Outlook tools (WORK-0033).', 'A lint pass over all 23 scripts.'],
    access=['No access to any work computer or account: raven575 runs every work command',
            'Cards travel with raven575', 'No repo yet'],
    lights='Lights on, time clock punched. Punchcard clocks in at nine sharp.'),
  dict(slug='never-forget', bay='11', icon='🦒', name='TEAM Never Forget', tint='#D97706', room=None,
    motto='A little better than yesterday.',
    does='raven575\'s personal assistants: research answered in plain language, daily plans, reminders, drafts and lists, and keeping focus on what matters in life and community. The name is raven575\'s own, turned from remembrance into hope.',
    crew=[('🦒','Milestone','Giraffe','PM-AIDE-00','Project manager and personal assistant'),
          ('🐯','Coat','Tiger','EDU01','Top research pilot'),
          ('🦦','Elliot "Dam"','Otter','LIF01','Focus on what matters, and our communities')],
    plan=['Defaults, the W45 rules and the YMCA Sheet.',
          'A Nextcloud dashboard with HomeLab, then the calendar merge.',
          'Milestone picks the team\'s third pilot.'],
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
  'history': [
    ('Read', 'Herd Glossary (v2)', 'Every Herd word, explained', 'https://docs.google.com/document/d/1ywVm0pJdsssXg153wSZAmUXqH7dyTSd9D8TTFxQK6HU/edit', True),
    ('Read', 'Meet the Herd', 'Who is who', 'https://drive.google.com/file/d/1dQr4vbUWb8x3qIi1RqofyqpFK7_uxkO8/view', True),
    ('Read', 'W45 Field Notes', 'PDF', 'https://drive.google.com/file/d/1DcOlo-m9rTB8GhHvKOUYJiwzAwv3UvSJ/view', True),
    ('Records', 'Herd History wiki, Drive backup', '', 'https://drive.google.com/drive/folders/1kHsC2lZZdwXK6q7UQq14V7ALS7D8sBGO', True),
    ('Records', 'TEAM_History public folder', '', 'https://drive.google.com/drive/folders/1AmCHOAG2E7QdBKTrUnf2lbIebxj9PYgn', True),
  ],
  '9to5': [
    ('Work', 'Ticket Format Lab', 'On-site visit work summaries (tailnet only; opens once HomeLab\'s copy timer runs)', 'https://herd-teams.tailfc4090.ts.net/web-tools/9to5/ticket-format-lab.html', True),
  ],
  'never-forget': [
    ('Daily life', 'Dashboard phase 1 plan', 'Merged calendar and Don\'t-forget list (plan, not built)', 'https://docs.google.com/document/d/14ZUXV_mGMkUR9mMi9977nZhi1feJu8SKilqfbZuRJhA', True),
    ('Daily life', 'Tonight\'s top 3 plan', 'HQ-0292', 'https://docs.google.com/document/d/1EekeIYqzmxGlUvlLQktyueo8JoT-hWhIKNEoSyDr5-Y', True),
    ('Proposals', 'Fred Rogers ethics proposal', 'AIDE-0011', 'https://docs.google.com/document/d/1h_-lqRhvNBb9F_YoH3K0_1VzO5--ENll6jq3dzG6grs', True),
    ('Reports', 'W45 reflection', 'PDF', 'https://drive.google.com/file/d/1AR3TGMCm9loMbWzjrJeBoS3p9e5Wlbu_/view', True),
  ],
}
OWED = ('creative',)   # lists not in yet (HQ-0294)


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
<link rel="stylesheet" href="/deckbar.css">
</head>
<body class="menu">
{deckbar('/menu/', 'Menu')}
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



# The deck bar: one menu on top of EVERY Flight Deck page (deck, Menu, Desk, team pages and every lab page), so
# raven575 can move back and forth without hunting (raven575, 2026-11-10 22:08 UTC). It needs no script: the two
# drop-downs are <details>. One source of truth: this file writes it into the generated pages, www/deckbar.css,
# and (between the deckbar markers) the hand-written pages listed in BAR_PAGES. Run with --also FILE to
# refresh a page kept outside git (the Darkroom, the Funhouse).
LAB = [('🐘', "The Elephant's Memory", '/vcge/'), ('🛫', 'Newest build', '/vcge/latest/'),
       ('🦉', 'The Reading Room', '/vcge/bench/'), ('🐈', 'The Darkroom', '/vcge/edge-bench/'),
       ('🦎', 'The Paint Shop', '/vcge/logo-bench/'), ('🎪', 'The Funhouse', '/vcge/funhouse/'),
       ('📚', 'The Card Shelf', '/vcge/shelf/'), ('🦝', 'Wipe Trials', '/vcge/testing/')]
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
BAR_PAGES = {   # repo file: (its address on the deck, the name shown as "you are here")
  'flight-deck/www/index.html': ('/', None),
  'flight-deck/www/desk/index.html': ('/desk/', 'Desk'),
  'bench/www/index.html': ('/vcge/bench/', 'The Reading Room'),
  'card-shelf/www/index.html': ('/vcge/shelf/', 'The Card Shelf'),
  'logo-bench/www/index.html': ('/vcge/logo-bench/', 'The Paint Shop'),
  'wipe-trials/www/index.html': ('/vcge/testing/', 'Wipe Trials'),
  'versions-page/vcge-lab-index.py': ('/vcge/', "The Elephant's Memory"),
}
ALSO = {'edge-bench': ('/vcge/edge-bench/', 'The Darkroom'), 'funhouse': ('/vcge/funhouse/', 'The Funhouse')}


def deckbar(here, here_name=None):
    ic = lambda e: '' if PLAIN else f'<span aria-hidden="true">{e}</span> '
    cur = lambda u: ' aria-current="page"' if u == here else ''
    teams = ''.join(f'<a href="/teams/{t["slug"]}/"{cur("/teams/" + t["slug"] + "/")}>{ic(t["icon"])}{E(t["name"])}</a>' for t in TEAMS)
    lab = ''.join(f'<a href="{u}"{cur(u)}>{ic(e)}{E(n)}</a>' for e, n, u in LAB)
    here_tag = f'<span class="db-here">{E(here_name)}</span>' if here_name else ''
    return ('<!-- deckbar: made by flight-deck/team-pages/build-team-pages.py, edit it there -->'
            f'<nav class="deckbar" aria-label="Flight Deck menu"><a class="db-home" href="/"{cur("/")}>{ic("✈")}Flight Deck</a>'
            f'<a href="/menu/"{cur("/menu/")}>{ic("☰")}Menu</a><a href="/desk/"{cur("/desk/")}>{ic("📜")}Desk</a>'
            f'<details><summary>{ic("📇")}Teams</summary><div class="db-list">{teams}</div></details>'
            f'<details><summary>{ic("🐘")}vCGE lab</summary><div class="db-list">{lab}</div></details>'
            f'{here_tag}</nav><!-- /deckbar -->')


def put_bar(path, here, name):
    """Write the deck bar into one hand-written page (logic shared with the installer: ../install/put_deckbar.py)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('put_deckbar', os.path.join(ROOT, 'flight-deck', 'install', 'put_deckbar.py'))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    mod.put(path, deckbar(here, name))


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
<link rel="stylesheet" href="/deckbar.css">
</head>
<body class="t-{t["slug"]}">
{deckbar('/teams/' + t['slug'] + '/', t['name'])}
<nav class="teams" aria-label="All teams">{nav}</nav>
<main>
{head}
<section><h2>What we do</h2><p>{E(t["does"])}</p></section>
{spotlight(t)}<section><h2>Crew</h2><ul class="crew">{crew}</ul>{away}</section>
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


def spotlight(t):
    """The PM's own corner on a team page: who they are, how they signal, their colours (main edition only)."""
    sp = t.get('spotlight')
    if not sp or PLAIN:
        return ''
    paras = ''.join(f'<p>{E(x)}</p>' for x in sp['lines'])
    sig = ''.join(f'<li><b>{E(a)}:</b> {E(b)}</li>' for a, b in sp['signals'])
    chips = ''.join(f'<li class="chip chip-{i}">{E(n)} <code>{E(h)}</code></li>' for i, (n, h) in enumerate(sp['colors']))
    return (f'<section class="spot"><h2>From the PM\'s desk</h2><div class="spot-row">'
            f'<img src="../../{E(sp["img"])}" alt="" width="96" height="96"><div><p class="who">{E(sp["who"])}</p>{paras}'
            f'<blockquote>&ldquo;{E(sp["quote"])}&rdquo;</blockquote></div></div>'
            f'<h3>Signals</h3><ul class="signals">{sig}</ul><h3>Colours</h3><ul class="chips">{chips}</ul></section>\n')


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
.spot { margin-top: 14px; padding: 4px 14px 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--tint) 45%, var(--line));
  background: color-mix(in srgb, var(--tint) 7%, var(--panel)); }
.spot-row { display: flex; gap: 14px; align-items: flex-start; }
.spot-row img { flex: none; border-radius: 14px; background: color-mix(in srgb, var(--tint) 18%, transparent); padding: 6px; }
.spot .who { font-weight: 700; margin: 4px 0 6px; }
.spot blockquote { margin: 8px 0 0; padding: 6px 12px; border-left: 4px solid var(--tint); font-style: italic; font-weight: 600; }
.spot h3 { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); margin: 12px 0 4px; }
.signals { margin: 0; padding-left: 18px; }
.chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.chip { padding: 4px 10px 4px 26px; border: 1px solid var(--line); border-radius: 99px; font-size: .85rem; position: relative; }
.chip::before { content: ""; position: absolute; left: 8px; top: 50%; width: 12px; height: 12px; margin-top: -6px; border-radius: 3px; }
.t-vcge .chip-0::before { background: #E0B43A; } .t-vcge .chip-1::before { background: #5F6B7A; } .t-vcge .chip-2::before { background: #D8C3A0; }
.t-vcge main { background-image: linear-gradient(color-mix(in srgb, #E0B43A 7%, transparent) 1px, transparent 1px),
  linear-gradient(90deg, color-mix(in srgb, #E0B43A 7%, transparent) 1px, transparent 1px); background-size: 28px 28px; }
.t-vcge .motto::before { content: "\\25A0  "; }
@media (max-width: 560px) { .spot-row { flex-direction: column; } }
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
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deckbar-plain.css' if PLAIN else 'deckbar.css'), encoding='utf-8') as src, \
        open(os.path.join(OUT, '..', 'deckbar.css'), 'w', encoding='utf-8') as f:
    f.write(src.read())
for rel, (here, name) in BAR_PAGES.items():
    put_bar(os.path.join(ROOT, rel), here, name)
bars = {here: deckbar(here, name) for here, name in list(BAR_PAGES.values()) + list(ALSO.values())}
with open(os.path.join(ROOT, 'flight-deck', 'install', 'deckbar-pages.json'), 'w', encoding='utf-8') as f:
    json.dump(bars, f, ensure_ascii=False, indent=1, sort_keys=True); f.write('\n')
for extra in [a for i, a in enumerate(sys.argv) if i and sys.argv[i - 1] == '--also']:
    put_bar(extra, *ALSO[next(k for k in ALSO if k in extra)])
print(f'wrote {len(TEAMS)} team pages ({"plain" if PLAIN else "main"}) to {os.path.normpath(OUT)}')
