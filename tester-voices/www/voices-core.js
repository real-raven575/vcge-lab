/**
 * vCGE lab: Tester Voices, the parts with no screen (tested by test/voices-core.test.mjs).
 * cleanWords() is what keeps a tester's name and contact data off the lab: it runs in the browser BEFORE anything is
 * sent, so the real names raven575 types in "Names to hide" never leave the phone. The service runs the same
 * e-mail / @handle / phone net again on arrival (voices-api.py scrub()).
 */
export const TAGS = {
    bug: '🐞 Bug', idea: '💡 Idea', praise: '💚 Praise', question: '❓ Question', confusing: '😕 Confusing',
};
export const STATUSES = { new: '🆕 New', read: '👀 Read', sent: '📨 Sent to the team', done: '✅ Done' };
export const SOURCES = {
    chat: '💬 Chat app', text: '📱 Text message', email: '✉️ E-mail', call: '📞 Call', 'in-person': '🗣️ In person', other: '📝 Other',
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HANDLE = /(?<![\w.@])@[A-Za-z0-9_][A-Za-z0-9_.]{1,29}/g;
const PHONE = /(?<![\w])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w])/g;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * "Names to hide" box, one person per line: "Jane Doe" or "Jane Doe = T7". A line with no codename gets the next free
 * one starting at `first` (the service's next free T number). Returns [{name, code}].
 */
export function parseNames(box, first = 'T1') {
    let n = Number(/^T(\d+)$/.exec(first)?.[1] || 1);
    const out = [];
    for (const line of String(box || '').split(/\n|;/)) {
        const [rawName, rawCode] = line.split('=');
        const name = (rawName || '').trim().replace(/\s+/g, ' ');
        if (name.length < 2) continue;
        const code = (rawCode || '').trim() || `T${n++}`;
        out.push({ name, code });
    }
    return out;
}

/**
 * The words as they will be saved: every listed name (whole name first, then each part of it two letters or longer,
 * whole words only, any case) becomes its codename; e-mail addresses, @handles and phone numbers are hidden.
 * Returns {text, swaps} where swaps counts what was changed, for the preview line.
 */
export function cleanWords(text, names = []) {
    let out = String(text || '');
    const swaps = { names: 0, emails: 0, handles: 0, phones: 0 };
    out = out.replace(EMAIL, () => { swaps.emails++; return '[email hidden]'; });
    out = out.replace(HANDLE, () => { swaps.handles++; return '[@handle hidden]'; });
    out = out.replace(PHONE, () => { swaps.phones++; return '[phone hidden]'; });
    const pairs = [];
    for (const { name, code } of names) {
        pairs.push([name, code]);
        for (const part of name.split(' ')) if (part.length >= 2 && part !== name) pairs.push([part, code]);
    }
    pairs.sort((a, b) => b[0].length - a[0].length);   // "Jane Doe" before "Jane", so the whole name is one swap
    for (const [name, code] of pairs) {
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(name)}(?![\\p{L}\\p{N}])`, 'giu');
        out = out.replace(re, () => { swaps.names++; return code; });
    }
    return { text: out, swaps };
}

/** "02:13 UTC · 9:13 PM Eastern, Tue Nov 24" for an ISO time (raven575 reads both, every time). */
export function bothTimes(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const utc = d.toISOString().slice(11, 16);
    const et = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', weekday: 'short', month: 'short', day: 'numeric',
    }).formatToParts(d).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
    return `${utc} UTC · ${et.hour}:${et.minute} ${et.dayPeriod} Eastern, ${et.weekday} ${et.month} ${et.day}`;
}

/** Plain text of one drop, for pasting into a team's thread or a Mailbox card. */
export function asText(drop, appName) {
    const tags = drop.tags.map(t => TAGS[t] || t).join(', ') || 'no tags';
    const lines = [`${appName} tester ${drop.tester} (${SOURCES[drop.source] || drop.source}) · ${tags}`,
        `Dropped ${bothTimes(drop.added)}${drop.said ? ` · said: ${drop.said}` : ''}`, '', drop.text];
    for (const n of drop.notes || []) lines.push('', `Note (${bothTimes(n.at)}): ${n.text}`);
    return lines.join('\n');
}

/** Counts per tag and per status, for the buttons at the top. */
export function counts(drops) {
    const c = { all: drops.length, tag: {}, status: {} };
    for (const d of drops) {
        for (const t of d.tags) c.tag[t] = (c.tag[t] || 0) + 1;
        c.status[d.status] = (c.status[d.status] || 0) + 1;
    }
    return c;
}
