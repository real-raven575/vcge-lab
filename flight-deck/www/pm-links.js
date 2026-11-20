/*
 * Flight Deck: every team's PM chat link, in one place (🐘 Cornerstone, HQ; raven575's ask 03:16 UTC 2026-11-20).
 * Anything that needs raven575 taps through to the owning team's PM chat. The Flight Deck hangars and the Test Bench
 * both read this one file (served at /pm-links.js), so a link is pasted once and shows everywhere.
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

  /** The button text: "💬 🐼 Inkwell's PM chat ↗", or the not-yet line. */
  function label(p) {
    return p.href ? `💬 ${p.emoji} ${p.pm}'s PM chat ↗` : `💬 ${p.emoji} ${p.pm}: PM link not pasted yet`;
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

  // Flight Deck front page: every hangar with data-pm gets the PM chat button first in its tools.
  const hang = () => document.querySelectorAll('.hangar[data-pm]').forEach(h => {
    if (h.querySelector('.pm-link')) return;
    const ul = h.querySelector('ul.tools') || h.appendChild(Object.assign(document.createElement('ul'), { className: 'tools' }));
    const li = document.createElement('li');
    li.className = 'pm-tool';
    li.appendChild(element(document, h.dataset.pm));
    ul.insertBefore(li, ul.firstChild);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hang); else hang();
})();
