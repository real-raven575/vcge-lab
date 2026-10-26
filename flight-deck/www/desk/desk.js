// Desk: raven575's Rules, Welcome and Copy-paste Inbox, read from one Google Sheet.
// Sign-in is Google's own button flow with one permission, drive.file: this page can open only the Sheet it created.
// The 1-hour key Google hands back lives in this tab's memory only; nothing is saved in the browser.
// Every bit of Sheet text is shown with textContent, never as page code.
(() => {
  const C = window.DeskCore;
  const cfg = window.DESK_CONFIG || {};
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  const WHO = 'raven575';   // only Google "test users" can sign in, and raven575 is the only one

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let token = null, client = null, sheetId = null, rules = [], welcome = null, inbox = [], showUsed = false;

  function say(msg, bad) { const s = $('status'); s.textContent = msg; s.classList.toggle('bad', !!bad); }

  // ---- Google calls ----
  async function call(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    if (res.status === 401) { signedOut('Google\'s 1-hour sign-in ran out. Press Sign in again.'); throw new Error('signed out'); }
    if (!res.ok) throw new Error(`Google said ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  }
  const range = r => encodeURIComponent(r);
  const put = (r, values) => call(`${SHEETS}/${sheetId}/values/${range(r)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values }) });
  const append = (r, row) => call(`${SHEETS}/${sheetId}/values/${range(r)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [row] }) });
  const getCell = async r => { const j = await call(`${SHEETS}/${sheetId}/values/${range(r)}`); return ((j.values || [])[0] || [])[0] || ''; };

  async function findSheet() {
    const q = encodeURIComponent(`name='${C.SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
    const j = await call(`${DRIVE}?q=${q}&orderBy=createdTime&fields=files(id,name)`);
    return j.files || [];
  }

  async function createSheet() {
    const tabs = Object.keys(C.HEADERS);
    const j = await call(SHEETS, { method: 'POST', body: JSON.stringify({
      properties: { title: C.SHEET_NAME }, sheets: tabs.map(t => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } } })) }) });
    sheetId = j.spreadsheetId;
    await call(`${SHEETS}/${sheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({
      valueInputOption: 'RAW', data: tabs.map(t => ({ range: `${t}!A1`, values: [C.HEADERS[t]] })) }) });
  }

  async function load() {
    const q = ['Rules!A2:H', 'Welcome!A2:C2', 'Inbox!A2:F'].map(r => `ranges=${range(r)}`).join('&');
    const j = await call(`${SHEETS}/${sheetId}/values:batchGet?${q}`);
    const v = j.valueRanges.map(x => x.values || []);
    rules = C.parseRules(v[0]); welcome = C.parseWelcome(v[1]); inbox = C.parseInbox(v[2]);
    render();
    say(`Loaded ${C.showTime(C.utcStamp(new Date()))}.`);
  }

  // Before writing to a row, check it still holds what we showed (someone may have moved rows in Sheets).
  async function sameRow(cellRange, expected) {
    if (await getCell(cellRange) === expected) return true;
    await load();
    say('The Sheet changed since it was loaded, so nothing was written. Reloaded; please try again.', true);
    return false;
  }

  // ---- sign-in ----
  function signedOut(msg) {
    token = null; sheetId = null;
    document.body.classList.remove('in');
    say(msg || 'Signed out.');
  }

  function signIn() {
    if (!window.google || !google.accounts) { say('Google sign-in did not load. Check the connection and reload.', true); return; }
    client = client || google.accounts.oauth2.initTokenClient({ client_id: cfg.clientId, scope: SCOPE, callback: async r => {
      if (r.error || !r.access_token) { say(`Sign-in stopped: ${r.error || 'no key from Google'}.`, true); return; }
      token = r.access_token; document.body.classList.add('in');
      try {
        const found = await findSheet();
        if (!found.length) { say('Signed in. No Desk Sheet yet: press "Create my Desk Sheet" once.'); document.body.classList.add('nosheet'); return; }
        sheetId = found[0].id; document.body.classList.remove('nosheet');
        if (found.length > 1) say(`Found ${found.length} Desk Sheets; using the oldest. Rename or trash the others in Google Drive.`, true);
        await load();
      } catch (e) { if (token) say(e.message, true); }
    } });
    client.requestAccessToken();
  }

  function signOut() {
    if (token && window.google) google.accounts.oauth2.revoke(token, () => {});
    signedOut('Signed out. The key from Google was thrown away.');
  }

  // ---- copy ----
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = el('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    const was = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = was; }, 1500);
  }
  function copyBtn(getText, label = 'Copy') { const b = el('button', 'copy', label); b.type = 'button'; b.addEventListener('click', () => copy(getText(), b)); return b; }

  // ---- render ----
  function render() { renderRules(); renderWelcome(); renderInbox(); }

  function renderRules() {
    const box = $('rulesList'); box.replaceChildren();
    const signed = rules.filter(r => r.signed).length;
    $('rulesCount').textContent = `${signed} of ${rules.length} signed off`;
    const groups = C.groupRules(rules);
    Object.entries(groups).forEach(([g, list]) => {
      const sec = el('section', 'group');
      const h = el('h3', null, `${g} rules`); h.appendChild(copyBtn(() => C.rulesAsText(list), `Copy all ${g}`));
      sec.appendChild(h);
      const ol = el('ol', 'rules');
      list.forEach(r => ol.appendChild(ruleItem(r)));
      sec.appendChild(ol); box.appendChild(sec);
    });
    if (!rules.length) box.appendChild(el('p', 'empty', 'No rules in the Sheet yet.'));
  }

  function ruleItem(r) {
    const li = el('li', r.signed ? 'rule signed' : 'rule');
    li.appendChild(el('span', 'rid', r.id));
    const body = el('div', 'rbody');
    const text = el('p', 'rtext', r.text); body.appendChild(text);
    body.appendChild(el('p', 'rsign', r.signed ? `Signed off by ${r.by || WHO} on ${C.showTime(r.signedUtc)}` : 'Not signed off yet'));
    const tools = el('div', 'rtools');
    const sign = el('label', 'sign'); const box = el('input'); box.type = 'checkbox'; box.checked = r.signed;
    sign.append(box, ' Signed off');
    box.addEventListener('change', async () => {
      box.disabled = true;
      try {
        if (await sameRow(`Rules!A${r.row}`, r.id)) { await put(`Rules!D${r.row}:F${r.row}`, [C.signRuleRow(box.checked, WHO, new Date())]); await load(); }
      } catch (e) { say(e.message, true); } finally { box.disabled = false; }
    });
    const edit = el('button', 'ghost', 'Edit wording'); edit.type = 'button';
    edit.addEventListener('click', () => editRule(r, body, text));
    tools.append(sign, edit, copyBtn(() => `${r.id}. ${r.text.trim()}`));
    body.appendChild(tools); li.appendChild(body);
    return li;
  }

  function editRule(r, body, text) {
    const ta = el('textarea', 'edit'); ta.value = r.text; ta.rows = Math.max(3, Math.ceil(r.text.length / 80));
    const save = el('button', null, 'Save wording'); save.type = 'button';
    const cancel = el('button', 'ghost', 'Cancel'); cancel.type = 'button';
    const note = el('p', 'hint', 'Saving new wording clears this rule\'s sign-off, so you sign off the new text.');
    const row = el('div', 'rtools'); row.append(save, cancel);
    text.replaceWith(ta); body.querySelector('.rtools').replaceWith(row); row.after(note); ta.focus();
    cancel.addEventListener('click', renderRules);
    save.addEventListener('click', async () => {
      const v = ta.value.trim(); if (!v) { say('A rule can\'t be empty. Delete rules in Google Sheets itself.', true); return; }
      save.disabled = true;
      try {
        if (await sameRow(`Rules!A${r.row}`, r.id)) { await put(`Rules!C${r.row}:H${r.row}`, [C.editRuleRow(v, WHO, new Date())]); await load(); }
      } catch (e) { say(e.message, true); save.disabled = false; }
    });
  }

  async function addRule(e) {
    e.preventDefault();
    const text = $('newRule').value.trim(), group = $('newGroup').value;
    if (!text) return;
    try { await append('Rules!A:H', C.newRuleRow(rules, group, text, WHO, new Date())); $('newRule').value = ''; await load(); }
    catch (err) { say(err.message, true); }
  }

  function renderWelcome() {
    $('welcomeTitle').textContent = welcome.title || 'Welcome';
    $('welcomeText').textContent = welcome.text || 'No welcome text in the Sheet yet.';
    $('welcomeEdited').textContent = welcome.editedUtc ? `Last edited ${C.showTime(welcome.editedUtc)}` : '';
  }

  function editWelcome() {
    $('welcomeView').hidden = true; $('welcomeForm').hidden = false;
    $('welcomeTitleIn').value = welcome.title; $('welcomeTextIn').value = welcome.text; $('welcomeTextIn').focus();
  }

  async function saveWelcome(e) {
    e.preventDefault();
    try {
      await put('Welcome!A2:C2', [[$('welcomeTitleIn').value.trim(), $('welcomeTextIn').value, C.utcStamp(new Date())]]);
      $('welcomeForm').hidden = true; $('welcomeView').hidden = false; await load();
    } catch (err) { say(err.message, true); }
  }

  function renderInbox() {
    const box = $('inboxList'); box.replaceChildren();
    const fresh = inbox.filter(m => !m.used);
    $('inboxCount').textContent = `${fresh.length} waiting, ${inbox.length - fresh.length} used`;
    (showUsed ? inbox : fresh).forEach(m => {
      const li = el('li', m.used ? 'msg used' : 'msg');
      const head = el('div', 'mhead');
      head.append(el('b', null, m.about || 'Copy-paste text'), el('span', 'mmeta', `${m.from || 'Claude'} · ${C.showTime(m.when)}`));
      li.appendChild(head);
      li.appendChild(el('pre', 'mtext', m.text));
      const tools = el('div', 'rtools'); tools.appendChild(copyBtn(() => m.text));
      if (!m.used) {
        const done = el('button', 'ghost', 'Mark used'); done.type = 'button';
        done.addEventListener('click', async () => {
          done.disabled = true;
          try { if (await sameRow(`Inbox!A${m.row}`, m.raw)) { await put(`Inbox!E${m.row}:F${m.row}`, [['yes', C.utcStamp(new Date())]]); await load(); } }
          catch (err) { say(err.message, true); done.disabled = false; }
        });
        tools.appendChild(done);
      } else tools.appendChild(el('span', 'mmeta', `Used ${C.showTime(m.usedUtc)}`));
      li.appendChild(tools); box.appendChild(li);
    });
    if (!(showUsed ? inbox : fresh).length) box.appendChild(el('p', 'empty', 'Nothing waiting. New copy-paste texts from the Herd land here.'));
  }

  // ---- pages (#rules, #welcome, #inbox) ----
  function route() {
    const page = ['rules', 'welcome', 'inbox'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'rules';
    document.querySelectorAll('.page').forEach(p => { p.hidden = p.id !== page; });
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.hash === `#${page}` ? 'page' : 'false'));
  }

  window.addEventListener('hashchange', route); route();
  if (!cfg.clientId) { say('Not set up yet: the Desk has no Google Client ID. See flight-deck/www/desk/README.md.', true); $('signIn').disabled = true; }
  $('signIn').addEventListener('click', signIn);
  $('signOut').addEventListener('click', signOut);
  $('reload').addEventListener('click', () => load().catch(e => say(e.message, true)));
  $('create').addEventListener('click', async () => {
    try { await createSheet(); document.body.classList.remove('nosheet'); await load(); say('Desk Sheet created in your Google Drive (My Drive). You can drag it into Herd of Helpers.'); }
    catch (e) { say(e.message, true); }
  });
  $('addRule').addEventListener('submit', addRule);
  $('editWelcome').addEventListener('click', editWelcome);
  $('welcomeForm').addEventListener('submit', saveWelcome);
  $('cancelWelcome').addEventListener('click', () => { $('welcomeForm').hidden = true; $('welcomeView').hidden = false; });
  $('copyWelcome').addEventListener('click', e => copy(welcome ? welcome.text : '', e.currentTarget));
  $('showUsed').addEventListener('change', e => { showUsed = e.target.checked; renderInbox(); });
})();
