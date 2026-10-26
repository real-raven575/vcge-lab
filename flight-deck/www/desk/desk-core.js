// Desk: the parts that only shape data (no network, no page). desk.js uses them in the browser; the tests use them in Node.
// Sheet layout, row 1 is the header on every tab:
//   Rules   A id | B group | C rule | D signed (yes/blank) | E signed_by | F signed_utc | G edited_by | H edited_utc
//   Welcome A title | B text | C edited_utc                (row 2 is the one welcome message)
//   Inbox   A when_utc | B from | C about | D text | E used (yes/blank) | F used_utc
// Times are UTC as "YYYY-MM-DD HH:MM", so they sort as plain text.
(function (root) {
  const SHEET_NAME = 'Flight Deck Desk';
  const HEADERS = {
    Rules: ['id', 'group', 'rule', 'signed', 'signed_by', 'signed_utc', 'edited_by', 'edited_utc'],
    Welcome: ['title', 'text', 'edited_utc'],
    Inbox: ['when_utc', 'from', 'about', 'text', 'used', 'used_utc'],
  };
  const GROUPS = { 'Herd': 'HB', 'Team vCGE': 'CS' };   // Herd base rules, Cornerstone (Team vCGE) rules

  const p = n => String(n).padStart(2, '0');
  const cell = (r, i) => (r && r[i] != null ? String(r[i]) : '');
  const yes = v => /^(yes|true|y|1|x)$/i.test(String(v || '').trim());

  function utcStamp(d) {
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }

  // "2026-10-26 02:47" -> "2026-10-26 02:47 UTC (10:47 PM Eastern)". Anything else is shown as it was written.
  function showTime(stamp) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(stamp || '').trim());
    if (!m) return String(stamp || '');
    const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]));
    const east = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(d);
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC (${east} Eastern)`;
  }

  // Sheet rows start at row 2 (row 1 is the header); every item keeps its row so an edit lands on the right line.
  function parseRules(values) {
    return (values || []).map((r, i) => ({
      row: i + 2, id: cell(r, 0).trim(), group: cell(r, 1).trim() || 'Herd', text: cell(r, 2),
      signed: yes(cell(r, 3)), by: cell(r, 4), signedUtc: cell(r, 5), editedBy: cell(r, 6), editedUtc: cell(r, 7),
    })).filter(x => x.id || x.text.trim());
  }

  function parseWelcome(values) {
    const r = (values || [])[0];
    return { row: 2, title: cell(r, 0), text: cell(r, 1), editedUtc: cell(r, 2) };
  }

  // Newest first; rows with the same time keep the order they were added in, the later one on top.
  function parseInbox(values) {
    return (values || []).map((r, i) => ({
      row: i + 2, when: cell(r, 0).trim(), from: cell(r, 1), about: cell(r, 2), text: cell(r, 3),
      used: yes(cell(r, 4)), usedUtc: cell(r, 5),
    })).filter(x => x.text.trim()).sort((a, b) => (a.when === b.when ? b.row - a.row : a.when < b.when ? 1 : -1));
  }

  // Next id in a group: HB-01, HB-02 ... (gaps from rules removed in Sheets are never reused).
  function nextRuleId(rules, group) {
    const prefix = GROUPS[group] || 'HB';
    const top = rules.reduce((n, r) => {
      const m = new RegExp(`^${prefix}-(\\d+)$`).exec(r.id);
      return m ? Math.max(n, +m[1]) : n;
    }, 0);
    return `${prefix}-${p(top + 1)}`;
  }

  function groupRules(rules) {
    const out = {};
    Object.keys(GROUPS).forEach(g => { if (rules.some(r => r.group === g)) out[g] = []; });   // Herd first, then Team vCGE
    rules.forEach(r => { (out[r.group] = out[r.group] || []).push(r); });
    return out;
  }

  // A rule's wording changed: the old sign-off no longer covers it, so the sign-off cells are cleared.
  function editRuleRow(text, who, now) { return [text, '', '', '', who, utcStamp(now)]; }        // C..H
  function signRuleRow(signed, who, now) { return signed ? ['yes', who, utcStamp(now)] : ['', '', '']; }  // D..F
  function newRuleRow(rules, group, text, who, now) { return [nextRuleId(rules, group), group, text, '', '', '', who, utcStamp(now)]; }

  // Copy-all text for a set of rules, as it would be pasted into a new project's instructions.
  function rulesAsText(rules) {
    return Object.entries(groupRules(rules)).map(([g, list]) =>
      `${g} rules\n` + list.map(r => `${r.id}. ${r.text.trim()}`).join('\n')).join('\n\n');
  }

  const api = { SHEET_NAME, HEADERS, GROUPS, utcStamp, showTime, parseRules, parseWelcome, parseInbox, nextRuleId,
    groupRules, editRuleRow, signRuleRow, newRuleRow, rulesAsText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DeskCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
