/*
 * Flight Deck (plain edition): every team's PM chat link, in one place (raven575's ask 03:16 UTC 2026-11-20).
 * Anything that needs raven575 taps through to the owning team's PM chat. The Test Bench reads this file (served at
 * /pm-links.js); the front page runs no script, so its links are written into index.html and a test keeps them equal.
 *
 * Only real links raven575 pasted, shaped https://claude.ai/code/project/chan_... . Never build one from a thread or
 * session id: those open archived threads. A team without a link shows "PM link not pasted yet".
 * Same list as the "PM chat link" row of each tab in the Herd Directory Sheet; change both together.
 * Nothing is fetched or stored.
 */
(() => {
  const TEAMS = {
    vcge:           { name: 'Team vCGE',       emoji: '🐘', pm: 'Cornerstone', link: 'https://claude.ai/code/project/chan_013E6p9jmWZWSUWtGuzSYgT2' },
    creative:       { name: 'Creative',        emoji: '🐼', pm: 'Inkwell',     link: 'https://claude.ai/code/project/chan_01FmXJmy8KCy4hAMGkMvgrFp' },
    marketing:      { name: 'Marketing',       emoji: '🦚', pm: 'Banner',      link: '' },
    homelab:        { name: 'Team HomeLab',    emoji: '🐧', pm: 'Uptime',      link: '' },
    email:          { name: 'Team eMail',      emoji: '🐝', pm: 'Waggle',      link: '' },
    history:        { name: 'Team History',    emoji: '🐿️', pm: 'Keepsake',    link: '' },
    finance:        { name: 'Team Finance',    emoji: '🐜', pm: 'Ledger',      link: 'https://claude.ai/code/project/chan_011L4UpUiD3cXuza8oLkSPqy' },
    vault:          { name: 'Team Vault',      emoji: '🦏', pm: 'Deadbolt',    link: '' },
    'auto-fixer':   { name: 'Team Auto-Fixer', emoji: '🐒', pm: 'Wrench',      link: '' },
    '9to5':         { name: 'TEAM 9to5',       emoji: '🤖', pm: 'Punchcard',   link: '' },
    'never-forget': { name: 'TEAM Never Forget', emoji: '🦒', pm: 'Milestone', link: '' },
  };
  const SHAPE = /^https:\/\/claude\.ai\/code\/project\/chan_[A-Za-z0-9]+$/;

  /** A team's PM chat: {key, name, emoji, pm, href}; href is null until a real project link is pasted. */
  function pmFor(key) {
    const t = TEAMS[key];
    if (!t) return null;
    return { key, name: t.name, emoji: t.emoji, pm: t.pm, href: SHAPE.test(t.link) ? t.link : null };
  }

  /** The button text (plain edition: team name only): "Creative PM chat ↗", or the not-yet line. */
  function label(p) {
    return p.href ? `${p.name} PM chat (opens claude.ai)` : `${p.name}: PM link not pasted yet`;
  }

  /** One link element (or a plain span when there is no link yet). */
  function element(doc, key, cls) {
    const p = pmFor(key);
    if (!p) return null;
    const a = doc.createElement(p.href ? 'a' : 'span');
    a.className = `pm-link${p.href ? '' : ' none'}${cls ? ` ${cls}` : ''}`;
    a.textContent = label(p);
    if (p.href) { a.href = p.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = `Open ${p.name}'s PM chat on claude.ai`; }
    return a;
  }

  const api = { TEAMS, SHAPE, pmFor, label, element };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  window.HERD_PM = api;

})();
