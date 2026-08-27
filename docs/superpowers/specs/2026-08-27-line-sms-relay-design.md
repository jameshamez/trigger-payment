# LINE Bank Notification → p-points.com Relay

## Problem

Station `S-24001` doesn't have a physical GSM module to receive bank SMS like
the existing station `P-26001` does. Instead, bank transaction alerts arrive
as LINE notifications (from the K PLUS / Kasikorn Bank Official Account) on
an Android phone. We need those alerts converted into the same request shape
that `p-points.com/sms_add.php` already accepts from GSM-module stations, and
forwarded automatically.

## Constraint: a website cannot read phone notifications

Next.js runs server-side and has no access to Android's notification system.
Some phone-side agent has to read the LINE notification and forward its text
over HTTP. We use **MacroDroid** (or Tasker) for this — no custom Android app
needed. LINE's own Messaging API webhook isn't usable here because K PLUS is
a bank-owned Official Account, not one we control.

## Data flow

```
[Android: MacroDroid]  --POST JSON-->  [Next.js: /api/notify]  --GET-->  [p-points.com/sms_add.php]
```

1. MacroDroid trigger: "Notification Received", filtered to the LINE app
   package. Action: HTTP Request → `POST` to our `/api/notify` with JSON body
   `{ "text": "<raw notification text>" }` (using MacroDroid's notification
   text macro).
2. `/api/notify` checks the text looks like an incoming-money notification
   (must contain `เข้าบัญชี` and `รายการเงินเข้า`). If not, respond
   `200 { skipped: true }` — not an error, just ignored, so MacroDroid's
   trigger history doesn't fill with failures for unrelated LINE messages.
3. Parse three dynamic fields out of the Thai text:
   - amount (after `จำนวนเงิน`)
   - balance (after `ยอดเงินคงเหลือ`)
   - date/time (`DD <ThaiMonth> YY HH:MM น.`) — Thai Buddhist year converted
     to a 2-digit CE year, Thai month abbreviation converted to `MM`.
4. Build the `addat` string p-points.com expects, using fixed per-station
   config for the parts that aren't in the notification, and the parsed
   values for the rest:

   ```
   +CMGR: "REC READ","756697110107","","DD/MM/YY,HH:MM:SS+28"DD/MM/YY HH:MMA/C X-7689 transferred <amount> Baht to A/C X-7689 Outstanding Balance <balance> Baht.OK
   ```

   Both account slots use the fixed station account code (`X-7689`) since the
   real sender account isn't available from the notification (LINE only
   shows the masked destination account, and that's not what p-points.com
   needs — the station account code plays that role instead).
5. Forward: `GET https://p-points.com/sms_add.php?stn_id=S-24001&addat=<url-encoded>&key=<STN_KEY>`.
6. Respond to MacroDroid with the upstream status and body, so failures are
   visible in MacroDroid's own action log.

## Config (env vars)

| Var | Value | Notes |
|---|---|---|
| `STN_ID` | `S-24001` | |
| `ACCOUNT_CODE` | `X-7689` | used for both A/C slots in `addat` |
| `BANK_SENDER_ID` | `756697110107` | reused from the P-26001 example, confirmed OK |
| `STN_KEY` | placeholder | real key for S-24001 not yet issued — set via env once known |
| `TARGET_URL` | `https://p-points.com/sms_add.php` | |

## Two different date formats inside `addat`

Easy to get wrong, and the approved sample hides it because in that sample
day and year are both `26`. The original P-26001 example makes it clear:

```
..."26/07/07,14:16:23+28"07/07/26 14:16A/C...
    ^^^^^^^^ YY/MM/DD      ^^^^^^^^ DD/MM/YY
```

- The **quoted** timestamp is the GSM SMS service-centre stamp: `YY/MM/DD,HH:MM:SS+28`
- The **unquoted** one that follows is display format: `DD/MM/YY HH:MM`

Both must be produced from the same parsed datetime, in their own format.

## Components

- `app/api/notify/route.ts` — POST handler: validate → parse → build → forward → respond
- `lib/parseNotification.ts` — Thai notification text → `{ amount, balance, datetime }`; throws a typed `ParseError` naming the missing field
- `lib/buildAddat.ts` — assembles the `+CMGR:` string from parsed values + config
- `lib/forwardToPPoints.ts` — builds the target URL, does the GET, returns upstream status/body
- `lib/config.ts` — reads and validates the env vars above at startup
- `app/page.tsx` — demo/test page (see below)

## Demo page

A single page at `/` with a textarea (pre-filled with the real K PLUS sample
text), a "ส่ง" button, and a result area showing: the parsed fields, the
generated `addat` string, the full target URL, and the upstream response.

Two reasons it exists, beyond demoing to the customer without a phone:

1. **Dry-run toggle.** A checkbox sends `dryRun: true`, which runs parse +
   build and returns the result *without* forwarding to p-points.com. Safe to
   demo and to iterate on the parser without firing real transactions.
2. **Discovering the real notification text.** The screenshot we designed
   against is the LINE *chat bubble* (a Flex Message). The Android
   *notification* for it may carry different, shorter, or collapsed text.
   The page echoes back the raw text it received, so the first real MacroDroid
   POST tells us exactly what we're parsing and the regexes can be corrected
   against reality rather than a guess.

Because of (2), the parser must tolerate the text arriving as one collapsed
line as well as multi-line — match on labels and whitespace, never on line
positions.

## Error handling

- Missing/unparseable field → `400` with `{ error: "<field>", rawText }` so
  the failure (and the raw text that caused it) is visible in MacroDroid's
  response log, to help fix the parser.
- Forward request fails (network error or non-2xx from p-points.com) →
  `502` with the upstream status/body passed through.

## Explicitly out of scope

- No database, no persisted log, no dashboard — pure stateless relay (can be
  added later if needed).
- No auth on `/api/notify` — open endpoint, per explicit decision.
- No support for multiple stations/mappings — config is hardcoded for
  `S-24001`/`X-7689` only; revisit as a config table if more stations are
  added later.

## Testing plan

No UI to click through. Verification is via `curl` against the running dev
server using the real sample text (`รายการเงินเข้า / 26 ส.ค. 69 15:07 น. /
เข้าบัญชี xxx-x-x8972-x / จำนวนเงิน 200.00 บาท / ยอดเงินคงเหลือ 207.85 บาท`),
confirming the generated `addat` matches the string already approved:

```
+CMGR: "REC READ","756697110107","","26/08/26,15:07:00+28"26/08/26 15:07A/C X-7689 transferred 200.00 Baht to A/C X-7689 Outstanding Balance 207.85 Baht.OK
```

Plus edge cases: comma-formatted balance (e.g. `1,234.50`), single-digit day
(e.g. `5 ส.ค.`), and a non-matching notification (confirm `skipped: true`).
