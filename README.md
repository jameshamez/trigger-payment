# Bank alert → p-points.com relay

Reads "รายการเงินเข้า" bank alerts, converts them into the `+CMGR:` SMS format
`p-points.com/sms_add.php` expects, and forwards them for station `S-24001`.

There are two ways in. **MacroDroid on Android is the primary one**; reading
bank email over IMAP is also built and needs no phone, kept as the alternative.

```
LINE alert   →  MacroDroid  →  /api/notify  ─┐
                                             ├─→  GET p-points.com/sms_add.php
Bank email   →  IMAP        →  /api/poll  ───┘
```

The MacroDroid path needs only the five station variables, which means it works
as soon as those are set — the Gmail variables can stay empty.

## Running

```bash
npm install
npm run dev
```

Open http://localhost:3000 to paste alert text and see what the relay makes of
it. Keep "Dry run" checked to test without sending anything real.

Only if you are using the Gmail path, poll it continuously in a second
terminal:

```bash
npm run watch-mail
```

## Configuration

Copy `.env.example` to `.env.local` and fill it in. The first five are all the
MacroDroid path needs; the Gmail block can stay empty unless you use it.

| Variable | Meaning |
|---|---|
| `STN_ID` | Station id sent to p-points.com (`S-24001`) |
| `ACCOUNT_CODE` | Account code used in both A/C slots (`X-7689`) |
| `BANK_SENDER_ID` | SMS sender id in the `+CMGR:` header |
| `STN_KEY` | Station key — **placeholder until the real one is issued** |
| `TARGET_URL` | p-points.com endpoint |
| `GMAIL_USER` | The Gmail address receiving bank alerts |
| `GMAIL_APP_PASSWORD` | A Google **App Password**, not the account password |
| `BANK_EMAIL_FROM` | Only unread mail from this address is considered |
| `GMAIL_MAILBOX` | Defaults to `INBOX` |
| `POLL_SECRET` | Shared secret guarding `/api/poll` |

`.env.local` is gitignored. Never commit real credentials.

## The LINE / MacroDroid path (primary)

Needs an Android phone: iOS and macOS give no app access to other apps'
notification content, so a spare Android device is required for this path.

`POST /api/notify` accepts either:

- **Plain text** (`Content-Type: text/plain`) — the body *is* the alert text.
  This is what MacroDroid should send: its magic-text substitution is literal,
  so an alert containing a quote or newline would corrupt a JSON body it
  assembled by hand. Raw text has nothing to escape.
- **JSON** (`Content-Type: application/json`) — `{"text": "...", "dryRun": true}`.
  `dryRun` parses and builds without forwarding; the demo page uses this.

Setup:

1. Install LINE on the phone and log in as a **secondary device**, then make
   sure the bank's alerts arrive there.
2. Install MacroDroid and add a macro:
   - **Trigger:** Notification → Notification Received → application: LINE
   - **Action:** Connectivity → HTTP Request, method `POST`, content type
     `text/plain`, URL `https://<your-deployment>/api/notify`, body set to the
     notification magic text (insert it with MacroDroid's magic text button —
     the variable name varies by version).
3. Turn **off** battery optimisation for MacroDroid and LINE, or the system
   will kill them in the background and alerts will be missed. Some
   manufacturers (Samsung especially) are aggressive enough to make this setup
   unreliable regardless.

## Gmail polling (alternative)

Needs no phone at all, so it avoids the background-process fragility above.
Use it where the bank also sends email alerts.

### Getting a Gmail App Password

An App Password is a 16-character credential scoped to one application, which
can be revoked on its own without touching the account password.

1. Enable 2-Step Verification on the Google account.
2. Go to https://myaccount.google.com/apppasswords and create one.
3. Paste it into `GMAIL_APP_PASSWORD` in `.env.local` yourself.

### How it works

`/api/poll` checks for unread mail from `BANK_EMAIL_FROM`, relays each money-in
alert, and marks it read. It takes the secret as `?secret=` or as an
`Authorization: Bearer` header, and answers `GET` or `POST` so any cron service
can drive it.

**Unread state is the deduplication record** — there is no database. A message
is marked read only when it can never usefully be retried:

| Outcome | Marked read? | Why |
|---|---|---|
| Forwarded | yes | Done. |
| Not a money-in alert | yes | A statement or promotion; it will never parse. |
| p-points.com failed | **no** | Retry next run; a blip must not lose a transaction. |
| Could not be parsed | **no** | Money we would otherwise drop — fix the patterns. |

Response status is `200` when everything relayed, `207` when something needs
attention, `401` on a bad secret, `502` when the mailbox is unreachable.

### Scheduling it in production

Vercel Cron on the free tier only fires once a day, which is far too slow. Use
an external scheduler (cron-job.org and similar are free) to call this once a
minute:

```
https://<your-deployment>/api/poll?secret=<POLL_SECRET>
```

## When parsing fails

Every response echoes the text it worked from, and a parse failure names the
`field` it could not find. Paste that text into the demo page to iterate, then
adjust the patterns in `lib/parseNotification.ts`.

## Tests

```bash
npm test
```
