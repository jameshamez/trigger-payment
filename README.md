# LINE → p-points.com relay

Receives K PLUS "รายการเงินเข้า" notifications forwarded from an Android
phone, converts them into the `+CMGR:` SMS format `p-points.com/sms_add.php`
expects, and forwards them for station `S-24001`.

A web server cannot read phone notifications — Android only exposes them to
an app installed on the device. MacroDroid plays that part and POSTs the
notification text here.

```
LINE (K PLUS)  →  MacroDroid  →  POST /api/notify  →  GET p-points.com/sms_add.php
```

## Running

```bash
npm install
npm run dev
```

Open http://localhost:3000 to paste notification text and see what the relay
makes of it. Keep "Dry run" checked to test without sending anything real.

## Configuration

Copy `.env.example` to `.env.local` and set:

| Variable | Meaning |
|---|---|
| `STN_ID` | Station id sent to p-points.com (`S-24001`) |
| `ACCOUNT_CODE` | Account code used in both A/C slots (`X-7689`) |
| `BANK_SENDER_ID` | SMS sender id in the `+CMGR:` header |
| `STN_KEY` | Station key — **placeholder until the real one is issued** |
| `TARGET_URL` | p-points.com endpoint |

## MacroDroid setup

The phone must be Android; iOS and macOS give no app access to other apps'
notification content.

1. Install LINE on the phone and log in as a **secondary device**, then log
   in to the K PLUS LINE OA so its alerts arrive there.
2. Install MacroDroid from the Play Store and add a macro:
   - **Trigger:** Notification → Notification Received → application: LINE
   - **Action:** Connectivity → HTTP Request
     - Method `POST`, Content type `application/json`
     - URL: `https://<your-deployment>/api/notify`
     - Body: `{"text": "[notification_title] [notification_text]"}`
3. Turn **off** battery optimisation for both MacroDroid and LINE, or the
   system will kill them in the background and alerts will be missed.

### If parsing fails

The response body records what was received. `{"error":"parse_error"}`
includes `rawText` — the exact string MacroDroid sent. Paste that into the
demo page to iterate on it, and adjust the patterns in
`lib/parseNotification.ts` to match.

## Tests

```bash
npm test
```
