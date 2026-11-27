"""vCGE lab Card Factory: made-up people for made-up cards. Lab only; never part of the app.

Every card the factory makes uses these made-up Herd characters ("Glyph the Owl", Flight Deck Way). There are no real
people here: names come from animals and made-up surnames, phone numbers come from the 555-0100..0199 block that the
North American numbering plan keeps for fiction, and every email and web address uses raven575's own domains
(vcge.app, herdofhelpers.com), so a card can never point at a stranger.
"""
import random

FIRST = ['Glyph', 'Iris', 'Pidge', 'Ghost', 'Shutout', 'Flipside', 'Checkers', 'Airlock', 'Tally', 'Cornerstone',
         'Inkwell', 'Banner', 'Ledger', 'Deadbolt', 'Wrench', 'Keepsake', 'Punchcard', 'Milestone', 'Waypoint', 'Elliot',
         'Juniper', 'Marigold', 'Bramble', 'Clover', 'Hazel', 'Rowan', 'Sorrel', 'Thistle', 'Willow', 'Barley',
         'Cobble', 'Dune', 'Ember', 'Fennel', 'Gale', 'Harbor', 'Indigo', 'Jasper', 'Kestrel', 'Larkspur']
ANIMAL = ['Owl', 'Lynx', 'Octopus', 'Raccoon', 'Box Turtle', 'Chameleon', 'Zebra', 'Falcon', 'Hamster', 'Elephant',
          'Panda', 'Peacock', 'Ant', 'Rhino', 'Monkey', 'Squirrel', 'Giraffe', 'Tiger', 'Otter', 'Badger', 'Heron',
          'Beaver', 'Fox', 'Hedgehog', 'Moose', 'Puffin', 'Walrus', 'Gecko', 'Bison', 'Koala']
SURNAME = ['Featherstone', 'Quillfeather', 'Mossbrook', 'Thornbury', 'Ashgrove', 'Pebblecroft', 'Willowmere', 'Hollins',
           'Brightwater', 'Copperfield', 'Larkhill', 'Stonebridge', 'Fairweather', 'Oakhurst', 'Redfern', 'Underhill']
MIDDLE = ['A.', 'B.', 'J.', 'L.', 'M.', 'R.', 'T.']
TITLES = ['Owner', 'Director of Operations', 'Senior Designer', 'Account Manager', 'Lead Engineer', 'Office Manager',
          'Sales Representative', 'Project Coordinator', 'Chief Executive Officer', 'Marketing Specialist',
          'Head Baker', 'Licensed Electrician', 'Real Estate Agent', 'Dental Hygienist', 'Photographer',
          'Financial Advisor', 'Landscape Architect', 'Customer Success Lead', 'Field Technician', 'Founder']
COMPANY_A = ['Flight Deck', 'Hangar One', 'Lockout Gate', 'Reading Room', 'Darkroom', 'Sorting Room', 'Paint Booth',
             'Checkerboard', 'Launch Hatch', 'Counting House', 'Herd', 'Tusk', 'Burrow', 'Feather', 'Lantern', 'Acorn',
             'Riverbend', 'Northgate', 'Bluebird', 'Ironwood']
COMPANY_B = ['Supply', 'Studios', 'Bakery', 'Electric', 'Realty', 'Dental', 'Design', 'Consulting', 'Photography',
             'Landscaping', 'Outfitters', 'Print Shop', 'Coffee', 'Hardware', 'Logistics', 'Workshop']
SUFFIX = ['', '', '', ' LLC', ' Inc.', ' Co.', ' Group']
STREET = ['Flight Deck Way', 'Hangar Road', 'Runway Avenue', 'Control Tower Drive', 'Launch Hatch Lane', 'Herd Street']
UNIT = ['', '', '', 'Suite 120', 'Unit 4', 'Hangar 01', 'Suite 300']
# Real towns with their own ZIP codes, so the app's ZIP check sees a believable address. A town is not a person.
TOWNS = [('Toledo', 'OH', '43604'), ('Columbus', 'OH', '43215'), ('Cleveland', 'OH', '44101'), ('Dayton', 'OH', '45402'),
         ('Akron', 'OH', '44308'), ('Pittsburgh', 'PA', '15222'), ('Detroit', 'MI', '48226'), ('Kalamazoo', 'MI', '49007'),
         ('Indianapolis', 'IN', '46204'), ('Louisville', 'KY', '40202'), ('Buffalo', 'NY', '14202'), ('Chicago', 'IL', '60601'),
         ('Madison', 'WI', '53703'), ('Denver', 'CO', '80202'), ('Austin', 'TX', '78701'), ('Portland', 'OR', '97204')]
AREA = ['216', '312', '330', '419', '412', '513', '614', '616', '313', '317', '502', '716', '608', '303', '512', '503']
DOMAINS = ['vcge.app', 'herdofhelpers.com']
LABELS = [('', ''), ('T', 'F'), ('P', 'F'), ('Tel', 'Fax'), ('Office', 'Fax'), ('Phone', 'Fax')]


def phone(rnd, area):
    """A fictional number: 555-0100 to 555-0199 is set aside for films and books."""
    style = rnd.choice(['({a}) 555-{n}', '{a}-555-{n}', '{a}.555.{n}', '{a} 555 {n}'])
    return style.format(a=area, n='01%02d' % rnd.randrange(100))


def person(rnd):
    """One made-up contact: what is printed and the field answers the app should find."""
    first = rnd.choice(FIRST)
    if rnd.random() < 0.25:          # Herd style; real cards mostly carry everyday names, so these stay a quarter
        name = '%s the %s' % (first, rnd.choice(ANIMAL))
        last_word = name.split()[-1]
    else:
        mid = ' %s' % rnd.choice(MIDDLE) if rnd.random() < 0.2 else ''
        name = '%s%s %s' % (first, mid, rnd.choice(SURNAME))
        last_word = name.split()[-1]
    company = '%s %s%s' % (rnd.choice(COMPANY_A), rnd.choice(COMPANY_B), rnd.choice(SUFFIX))
    domain = rnd.choice(DOMAINS)
    user = rnd.choice(['%s' % first.lower(), '%s.%s' % (first.lower(), last_word.lower()), '%s%s' % (first[0].lower(), last_word.lower())])
    town, state, zipc = rnd.choice(TOWNS)
    area = rnd.choice(AREA)
    labels = rnd.choice(LABELS)
    has = lambda p: rnd.random() < p
    f = {'name': name, 'title': rnd.choice(TITLES) if has(0.85) else '', 'company': company,
         'phone': phone(rnd, area), 'fax': phone(rnd, area) if has(0.25) else '',
         'mobile': phone(rnd, area) if has(0.3) else '',
         'email': '%s@%s' % (user, domain), 'web': ('www.' if has(0.6) else '') + domain if has(0.75) else '',
         'street': '%d %s' % (rnd.randrange(1, 9900), rnd.choice(STREET)) if has(0.8) else '',
         'unit': '', 'city': '', 'state': '', 'zip': ''}
    if f['street']:
        f['unit'] = rnd.choice(UNIT)
        f['city'], f['state'], f['zip'] = town, state, zipc
    f['labels'] = {'phone': labels[0], 'fax': labels[1] or 'Fax', 'mobile': rnd.choice(['M', 'Cell', 'Mobile'])}
    return f


def printed_lines(f):
    """The card's lines as printed, grouped: (top block, contact block)."""
    lab = f['labels']
    def tel(kind, key):
        v = f[key]
        if not v: return None
        l = lab[kind]
        return '%s %s' % (l, v) if l else v
    top = [x for x in (f['name'], f['title'], f['company']) if x]
    contact = [x for x in (tel('phone', 'phone'), tel('mobile', 'mobile'), tel('fax', 'fax'), f['email'], f['web']) if x]
    if f['street']:
        contact.append(f['street'] + (', ' + f['unit'] if f['unit'] else ''))
        contact.append('%s, %s %s' % (f['city'], f['state'], f['zip']))
    return top, contact


def truth(f):
    """The answers, without print-only details (labels)."""
    return {k: f[k] for k in ('name', 'title', 'company', 'phone', 'mobile', 'fax', 'email', 'web', 'street', 'unit', 'city', 'state', 'zip')}


HAND_NOTES = ['Call me Tuesday', 'Met at the expo', 'Ask about the quote', 'Great coffee chat', 'Follow up next week',
              'Lunch on Friday?', 'Thanks for stopping by', 'Order 12 boxes', 'Back in the office Monday', 'Text before noon']


def hand_note(rnd):
    return rnd.choice(HAND_NOTES)
