# Desk: Rules, Welcome and Copy-paste Inbox

Three pages under `desk/` on the Flight Deck, all read from one private Google Sheet named "Flight Deck Desk".

| Page | Shows | Can change on the page |
|---|---|---|
| `desk/#rules` | Every rule, grouped Herd and Team vCGE, with "Signed off by raven575 on (time)" or "Not signed off yet" | Sign off or un-sign, edit wording (clears that rule's sign-off), add a rule. Deleting happens in Google Sheets. |
| `desk/#welcome` | The generic new-project welcome, with a Copy button | Edit title and text |
| `desk/#inbox` | Copy-paste texts the Herd made for raven575, newest first | Copy, mark used (used ones fold away; nothing is deleted) |

## Sheet tabs (row 1 is the header; times are UTC "YYYY-MM-DD HH:MM")

- Rules: `id | group | rule | signed | signed_by | signed_utc | edited_by | edited_utc` (ids HB-01... for Herd, CS-01... for Team vCGE; `signed` is `yes` or blank)
- Welcome: `title | text | edited_utc` (row 2 only)
- Inbox: `when_utc | from | about | text | used | used_utc` (Claude appends rows with the Google Sheets connector; `from` names emoji + codename + team)

## Sign-in and what it can reach

Google sign-in in the browser (Google Identity Services, token flow) with one scope, `drive.file`: the page can see and edit only files it
created itself, here the Desk Sheet. It cannot see Gmail, Contacts, the rest of Drive or any other Sheet. The Google project stays in
Testing with raven575 as the only test user, so no other Google account can sign in, and no email address lives in this public repo.
Google's key lasts about an hour and is held in the tab's memory only; nothing is saved in the browser. Sheet text is always shown as
plain text, and every write uses RAW input, so a formula or HTML typed into the Sheet stays text. Before writing to a row the page checks
the row still holds the same rule or inbox item; if rows moved in Sheets it writes nothing and reloads.

Worst case: code changed on this page (for example a bad push) while raven575 is signed in could read or change the Desk Sheet for up to
an hour. Google Sheets version history can roll that back.

Google's sign-in script (`accounts.google.com/gsi/client`) is not versioned, so it can't carry a Subresource Integrity hash; the page's
Content-Security-Policy allows only that script and the Sheets, Drive and sign-in addresses.

## Setup

1. Google Cloud: a project with the Google Sheets API and Google Drive API on, Google Auth Platform in Testing with your account as a
   test user, the `drive.file` scope, and a Web client whose Authorized JavaScript origin is your Flight Deck address.
2. Copy `config.example.js` to `config.js` (gitignored) and put the Client ID in. A Client ID is not a secret; never add a client secret.
3. Open `desk/`, Sign in with Google, press "Create my Desk Sheet" once. Later visits find it again by name.

## Tests

`node --test flight-deck/test/desk-core.test.cjs` (data shaping) and `node flight-deck/test/desk.e2e.cjs [screenshot.png]` (the whole
page in Chromium with every Google address answered by an in-memory fake; nothing reaches Google).
