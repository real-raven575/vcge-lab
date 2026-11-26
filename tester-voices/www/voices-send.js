// Tester Voices "Send to team": one row in the "Voices out" tab of raven575's Flight Deck Desk Sheet.
// Same sign-in as the Desk (flight-deck/www/desk/desk.js): Google's own button flow, one permission (drive.file),
// so this page can open only the Sheet the Desk created. The 1-hour key lives in this tab's memory only.
// 🐘 Cornerstone's Herd Drive thread turns each new row into a Mailbox card to that team and writes the card id back.
// What is sent: the cleaned words, tester codename, tags, where/when, the lab id. Never names, screenshots or contact data.
(() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  const SHEET_NAME = 'Flight Deck Desk';   // the Desk's Sheet (desk-core.js SHEET_NAME)
  const TAB = 'Voices out';
  const HEADER = ['when_utc', 'to_team', 'tester', 'tags', 'source', 'said', 'text', 'lab_id', 'card_id', 'mailbox_row'];
  let token = null, sheetId = null, client = null, waiting = null;

  async function call(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    if (res.status === 401) { token = null; sheetId = null; throw new Error('Google\'s 1-hour sign-in ran out; tap Send again to sign in'); }
    if (!res.ok) throw new Error(`Google said ${res.status}`);
    return res.json();
  }

  function signIn() {
    const id = (window.DESK_CONFIG || {}).clientId;
    if (!id) return Promise.reject(new Error('the Desk is not set up on this lab (no Google Client ID)'));
    if (!window.google || !google.accounts) return Promise.reject(new Error('Google sign-in did not load; check the connection and reload'));
    return new Promise((resolve, reject) => {
      waiting = { resolve, reject };
      client = client || google.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPE, callback: r => {
        const w = waiting; waiting = null;
        if (r.error || !r.access_token) return w && w.reject(new Error(`sign-in stopped: ${r.error || 'no key from Google'}`));
        token = r.access_token;
        w && w.resolve();
      } });
      client.requestAccessToken();
    });
  }

  async function desk() {
    if (sheetId) return sheetId;
    const q = encodeURIComponent(`name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
    const files = (await call(`${DRIVE}?q=${q}&orderBy=createdTime&fields=files(id)`)).files || [];
    if (!files.length) throw new Error('no Desk Sheet found; open the Desk and create it first');
    sheetId = files[0].id;
    const tabs = (await call(`${SHEETS}/${sheetId}?fields=sheets.properties.title`)).sheets.map(s => s.properties.title);
    if (!tabs.includes(TAB)) {   // first send ever: add the tab with its header row
        await call(`${SHEETS}/${sheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] }) });
        await call(`${SHEETS}/${sheetId}/values/${encodeURIComponent(`${TAB}!A1`)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [HEADER] }) });
    }
    return sheetId;
  }

  /** Adds one row (an array in HEADER order, card_id and mailbox_row left empty). Returns the Sheet row number. */
  async function send(row) {
    if (!token) await signIn();
    await desk();
    const r = await call(`${SHEETS}/${sheetId}/values/${encodeURIComponent(`${TAB}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: 'POST', body: JSON.stringify({ values: [row] }) });
    const m = /!A(\d+)/.exec((r.updates || {}).updatedRange || '');
    return m ? Number(m[1]) : null;
  }

  function signOut() {
    if (token && window.google) google.accounts.oauth2.revoke(token, () => {});
    token = null; sheetId = null;
  }

  window.VoicesSend = { send, signOut, signedIn: () => !!token, HEADER, TAB };
})();
