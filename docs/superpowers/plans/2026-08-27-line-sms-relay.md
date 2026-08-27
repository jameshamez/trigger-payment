# LINE Notification → p-points.com Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js app that receives K PLUS bank notification text forwarded from an Android phone, converts it into the `+CMGR:` SMS format that `p-points.com/sms_add.php` expects, and forwards it for station `S-24001`.

**Architecture:** Stateless relay. One POST endpoint (`/api/notify`) does parse → build → forward. Pure functions in `lib/` with no I/O except the forwarder, so parsing and formatting are unit-testable without a network. A demo page at `/` posts to the same endpoint with a dry-run flag.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-line-sms-relay-design.md`

## Global Constraints

- Station config comes from env vars, never hardcoded in logic: `STN_ID=S-24001`, `ACCOUNT_CODE=X-7689`, `BANK_SENDER_ID=756697110107`, `STN_KEY` (placeholder until issued), `TARGET_URL=https://p-points.com/sms_add.php`.
- Amount and balance keep the exact digit string from the notification, commas included (`96,508.08` stays `96,508.08`). Never reformat or round.
- The two timestamps in `addat` use different formats: quoted is `YY/MM/DD,HH:MM:SS+28`, unquoted is `DD/MM/YY HH:MM`.
- Thai Buddhist years convert to 2-digit CE: `พ.ศ. 2569` → `26`.
- The parser matches on labels and whitespace, never on line numbers — notification text may arrive collapsed to one line.
- No database, no auth, no multi-station support. Out of scope per spec.

---

### Task 1: Project scaffold and config

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.local`, `.env.example`, `.gitignore`
- Create: `lib/config.ts`
- Test: `lib/config.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `getConfig(): Config` where
  `type Config = { stnId: string; accountCode: string; bankSenderId: string; stnKey: string; targetUrl: string }`

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@latest . --typescript --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*" --yes
npm install -D vitest
```

- [ ] **Step 2: Add the vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write the failing config test**

Create `lib/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig } from "./config";

const ENV_KEYS = ["STN_ID", "ACCOUNT_CODE", "BANK_SENDER_ID", "STN_KEY", "TARGET_URL"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getConfig", () => {
  it("reads all five values from the environment", () => {
    process.env.STN_ID = "S-24001";
    process.env.ACCOUNT_CODE = "X-7689";
    process.env.BANK_SENDER_ID = "756697110107";
    process.env.STN_KEY = "22162";
    process.env.TARGET_URL = "https://p-points.com/sms_add.php";

    expect(getConfig()).toEqual({
      stnId: "S-24001",
      accountCode: "X-7689",
      bankSenderId: "756697110107",
      stnKey: "22162",
      targetUrl: "https://p-points.com/sms_add.php",
    });
  });

  it("throws naming the variable that is missing", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(() => getConfig()).toThrow(/STN_ID/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run lib/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 5: Implement the config module**

Create `lib/config.ts`:

```typescript
export type Config = {
  stnId: string;
  accountCode: string;
  bankSenderId: string;
  stnKey: string;
  targetUrl: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getConfig(): Config {
  return {
    stnId: required("STN_ID"),
    accountCode: required("ACCOUNT_CODE"),
    bankSenderId: required("BANK_SENDER_ID"),
    stnKey: required("STN_KEY"),
    targetUrl: required("TARGET_URL"),
  };
}
```

- [ ] **Step 6: Create the env files**

Both `.env.local` and `.env.example` get the same contents (the key is a
placeholder, so there is no secret to withhold from the example):

```
STN_ID=S-24001
ACCOUNT_CODE=X-7689
BANK_SENDER_ID=756697110107
STN_KEY=CHANGEME_STN_KEY_NOT_YET_ISSUED
TARGET_URL=https://p-points.com/sms_add.php
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run lib/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with env-backed station config"
```

---

### Task 2: Notification parser

**Files:**
- Create: `lib/parseNotification.ts`
- Test: `lib/parseNotification.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type ParsedNotification = { amount: string; balance: string; day: number; month: number; year: number; hour: number; minute: number }` — `year` is the 2-digit CE year (2026 → 26); `amount`/`balance` keep their original digit strings including commas.
  - `parseNotification(text: string): ParsedNotification` — throws `ParseError` when a field is absent.
  - `class ParseError extends Error { field: string }`
  - `isIncomingTransfer(text: string): boolean` — true when the text contains both `รายการเงินเข้า` and `จำนวนเงิน`.

- [ ] **Step 1: Write the failing parser tests**

Create `lib/parseNotification.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseNotification, isIncomingTransfer, ParseError } from "./parseNotification";

const SAMPLE = `รายการเงินเข้า
26 ส.ค. 69 15:07 น.
เข้าบัญชี xxx-x-x8972-x
จำนวนเงิน 200.00 บาท
ยอดเงินคงเหลือ 207.85 บาท`;

describe("isIncomingTransfer", () => {
  it("accepts a K PLUS incoming-money notification", () => {
    expect(isIncomingTransfer(SAMPLE)).toBe(true);
  });

  it("rejects an unrelated LINE message", () => {
    expect(isIncomingTransfer("สวัสดีครับ วันนี้ประชุมกี่โมง")).toBe(false);
  });
});

describe("parseNotification", () => {
  it("extracts every field from the real sample", () => {
    expect(parseNotification(SAMPLE)).toEqual({
      amount: "200.00",
      balance: "207.85",
      day: 26,
      month: 8,
      year: 26,
      hour: 15,
      minute: 7,
    });
  });

  it("parses the same text collapsed onto one line", () => {
    const collapsed = SAMPLE.replace(/\n/g, " ");
    expect(parseNotification(collapsed).amount).toBe("200.00");
    expect(parseNotification(collapsed).day).toBe(26);
  });

  it("keeps comma grouping in large numbers", () => {
    const text = SAMPLE.replace("207.85", "96,508.08").replace("200.00", "1,234.50");
    const parsed = parseNotification(text);
    expect(parsed.amount).toBe("1,234.50");
    expect(parsed.balance).toBe("96,508.08");
  });

  it("handles a single-digit day", () => {
    const parsed = parseNotification(SAMPLE.replace("26 ส.ค. 69", "5 ส.ค. 69"));
    expect(parsed.day).toBe(5);
  });

  it("converts every Thai month abbreviation", () => {
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    months.forEach((abbr, index) => {
      const parsed = parseNotification(SAMPLE.replace("ส.ค.", abbr));
      expect(parsed.month).toBe(index + 1);
    });
  });

  it("converts the Buddhist year to a 2-digit CE year", () => {
    expect(parseNotification(SAMPLE.replace("69 15:07", "70 15:07")).year).toBe(27);
  });

  it("throws a ParseError naming the missing field", () => {
    const withoutAmount = SAMPLE.replace("จำนวนเงิน 200.00 บาท", "");
    expect(() => parseNotification(withoutAmount)).toThrow(ParseError);
    try {
      parseNotification(withoutAmount);
    } catch (error) {
      expect((error as ParseError).field).toBe("amount");
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/parseNotification.test.ts`
Expected: FAIL — cannot resolve `./parseNotification`.

- [ ] **Step 3: Implement the parser**

Create `lib/parseNotification.ts`:

```typescript
export type ParsedNotification = {
  amount: string;
  balance: string;
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
};

export class ParseError extends Error {
  field: string;
  constructor(field: string) {
    super(`Could not find "${field}" in the notification text`);
    this.name = "ParseError";
    this.field = field;
  }
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                     "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// Matches "26 ส.ค. 69 15:07". Dots in the month names are escaped so the
// alternation cannot match across an unexpected character.
const DATETIME_PATTERN = new RegExp(
  String.raw`(\d{1,2})\s*(` +
    THAI_MONTHS.map((m) => m.replace(/\./g, String.raw`\.`)).join("|") +
    String.raw`)\s*(\d{2})\s+(\d{1,2}):(\d{2})`,
);

const AMOUNT_PATTERN = /จำนวนเงิน\s*([\d,]+\.\d{2})/;
const BALANCE_PATTERN = /ยอดเงินคงเหลือ\s*([\d,]+\.\d{2})/;

export function isIncomingTransfer(text: string): boolean {
  return text.includes("รายการเงินเข้า") && text.includes("จำนวนเงิน");
}

export function parseNotification(text: string): ParsedNotification {
  const amount = text.match(AMOUNT_PATTERN);
  if (!amount) throw new ParseError("amount");

  const balance = text.match(BALANCE_PATTERN);
  if (!balance) throw new ParseError("balance");

  const datetime = text.match(DATETIME_PATTERN);
  if (!datetime) throw new ParseError("datetime");

  const [, day, monthAbbr, buddhistYear, hour, minute] = datetime;

  return {
    amount: amount[1],
    balance: balance[1],
    day: Number(day),
    month: THAI_MONTHS.indexOf(monthAbbr) + 1,
    // "69" is พ.ศ. 2569 → ค.ศ. 2026 → the 2-digit CE year 26.
    year: (Number(buddhistYear) + 2500 - 543) % 100,
    hour: Number(hour),
    minute: Number(minute),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/parseNotification.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/parseNotification.ts lib/parseNotification.test.ts
git commit -m "feat: parse amount, balance and Thai datetime from K PLUS notifications"
```

---

### Task 3: `addat` string builder

**Files:**
- Create: `lib/buildAddat.ts`
- Test: `lib/buildAddat.test.ts`

**Interfaces:**
- Consumes: `ParsedNotification` from Task 2, `Config` from Task 1
- Produces: `buildAddat(parsed: ParsedNotification, config: Config): string`

- [ ] **Step 1: Write the failing builder tests**

Create `lib/buildAddat.test.ts`. The first test pins the exact approved
output string; the second is the one that catches swapping the two date
formats, using a date where day and year differ:

```typescript
import { describe, it, expect } from "vitest";
import { buildAddat } from "./buildAddat";
import type { Config } from "./config";
import type { ParsedNotification } from "./parseNotification";

const CONFIG: Config = {
  stnId: "S-24001",
  accountCode: "X-7689",
  bankSenderId: "756697110107",
  stnKey: "22162",
  targetUrl: "https://p-points.com/sms_add.php",
};

const PARSED: ParsedNotification = {
  amount: "200.00",
  balance: "207.85",
  day: 26,
  month: 8,
  year: 26,
  hour: 15,
  minute: 7,
};

describe("buildAddat", () => {
  it("produces exactly the approved string for the real sample", () => {
    expect(buildAddat(PARSED, CONFIG)).toBe(
      '+CMGR: "REC READ","756697110107","","26/08/26,15:07:00+28"26/08/26 15:07' +
        "A/C X-7689 transferred 200.00 Baht to A/C X-7689 " +
        "Outstanding Balance 207.85 Baht.OK",
    );
  });

  it("writes the quoted stamp as YY/MM/DD and the plain one as DD/MM/YY", () => {
    // 7 July 2026: day 7, year 26 — the two formats must differ here.
    const result = buildAddat(
      { ...PARSED, day: 7, month: 7, year: 26, hour: 14, minute: 16 },
      CONFIG,
    );
    expect(result).toContain('"26/07/07,14:16:00+28"');
    expect(result).toContain("07/07/26 14:16");
  });

  it("zero-pads single-digit hours and minutes", () => {
    const result = buildAddat({ ...PARSED, hour: 9, minute: 5 }, CONFIG);
    expect(result).toContain("09:05:00+28");
    expect(result).toContain(" 09:05");
  });

  it("uses the configured account code for both A/C slots", () => {
    const result = buildAddat(PARSED, { ...CONFIG, accountCode: "X-1111" });
    expect(result).toContain("A/C X-1111 transferred");
    expect(result).toContain("to A/C X-1111 Outstanding");
  });

  it("passes amount and balance through with comma grouping intact", () => {
    const result = buildAddat(
      { ...PARSED, amount: "1,234.50", balance: "96,508.08" },
      CONFIG,
    );
    expect(result).toContain("transferred 1,234.50 Baht");
    expect(result).toContain("Outstanding Balance 96,508.08 Baht");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/buildAddat.test.ts`
Expected: FAIL — cannot resolve `./buildAddat`.

- [ ] **Step 3: Implement the builder**

Create `lib/buildAddat.ts`:

```typescript
import type { Config } from "./config";
import type { ParsedNotification } from "./parseNotification";

const pad = (value: number): string => String(value).padStart(2, "0");

export function buildAddat(parsed: ParsedNotification, config: Config): string {
  const { day, month, year, hour, minute, amount, balance } = parsed;

  const dd = pad(day);
  const mm = pad(month);
  const yy = pad(year);
  const time = `${pad(hour)}:${pad(minute)}`;

  // The GSM service-centre stamp is YY/MM/DD; the display stamp that follows
  // it is DD/MM/YY. They look alike but are not the same field.
  const gsmStamp = `${yy}/${mm}/${dd},${time}:00+28`;
  const displayStamp = `${dd}/${mm}/${yy} ${time}`;

  return (
    `+CMGR: "REC READ","${config.bankSenderId}","","${gsmStamp}"${displayStamp}` +
    `A/C ${config.accountCode} transferred ${amount} Baht ` +
    `to A/C ${config.accountCode} Outstanding Balance ${balance} Baht.OK`
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/buildAddat.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/buildAddat.ts lib/buildAddat.test.ts
git commit -m "feat: build the +CMGR addat string from parsed notifications"
```

---

### Task 4: Forwarder

**Files:**
- Create: `lib/forwardToPPoints.ts`
- Test: `lib/forwardToPPoints.test.ts`

**Interfaces:**
- Consumes: `Config` from Task 1
- Produces:
  - `buildTargetUrl(addat: string, config: Config): string`
  - `forwardToPPoints(addat: string, config: Config): Promise<ForwardResult>` where
    `type ForwardResult = { ok: boolean; status: number; body: string; url: string }`

- [ ] **Step 1: Write the failing forwarder tests**

Create `lib/forwardToPPoints.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildTargetUrl, forwardToPPoints } from "./forwardToPPoints";
import type { Config } from "./config";

const CONFIG: Config = {
  stnId: "S-24001",
  accountCode: "X-7689",
  bankSenderId: "756697110107",
  stnKey: "22162",
  targetUrl: "https://p-points.com/sms_add.php",
};

const ADDAT = '+CMGR: "REC READ","756697110107","","26/08/26,15:07:00+28"...';

afterEach(() => vi.restoreAllMocks());

describe("buildTargetUrl", () => {
  it("puts stn_id, addat and key on the query string", () => {
    const url = new URL(buildTargetUrl(ADDAT, CONFIG));
    expect(url.origin + url.pathname).toBe("https://p-points.com/sms_add.php");
    expect(url.searchParams.get("stn_id")).toBe("S-24001");
    expect(url.searchParams.get("key")).toBe("22162");
    expect(url.searchParams.get("addat")).toBe(ADDAT);
  });

  it("percent-encodes the characters that would break the query string", () => {
    const raw = buildTargetUrl(ADDAT, CONFIG);
    expect(raw).not.toContain('"');
    expect(raw).toContain("%22");
  });
});

describe("forwardToPPoints", () => {
  it("reports success with the upstream status and body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("OK", { status: 200 })),
    );
    const result = await forwardToPPoints(ADDAT, CONFIG);
    expect(result).toMatchObject({ ok: true, status: 200, body: "OK" });
  });

  it("reports failure without throwing when upstream returns 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    );
    const result = await forwardToPPoints(ADDAT, CONFIG);
    expect(result).toMatchObject({ ok: false, status: 500, body: "boom" });
  });

  it("turns a network error into a result instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await forwardToPPoints(ADDAT, CONFIG);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.body).toContain("ECONNREFUSED");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/forwardToPPoints.test.ts`
Expected: FAIL — cannot resolve `./forwardToPPoints`.

- [ ] **Step 3: Implement the forwarder**

Create `lib/forwardToPPoints.ts`:

```typescript
import type { Config } from "./config";

export type ForwardResult = {
  ok: boolean;
  status: number;
  body: string;
  url: string;
};

export function buildTargetUrl(addat: string, config: Config): string {
  const url = new URL(config.targetUrl);
  url.searchParams.set("stn_id", config.stnId);
  url.searchParams.set("addat", addat);
  url.searchParams.set("key", config.stnKey);
  return url.toString();
}

export async function forwardToPPoints(
  addat: string,
  config: Config,
): Promise<ForwardResult> {
  const url = buildTargetUrl(addat, config);
  try {
    const response = await fetch(url, { method: "GET" });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
      url,
    };
  } catch (error) {
    // A network failure is a reportable outcome, not an exception: the route
    // still needs to tell MacroDroid what happened.
    return {
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/forwardToPPoints.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/forwardToPPoints.ts lib/forwardToPPoints.test.ts
git commit -m "feat: forward addat to p-points.com and report the outcome"
```

---

### Task 5: `/api/notify` route

**Files:**
- Create: `app/api/notify/route.ts`
- Test: `app/api/notify/route.test.ts`

**Interfaces:**
- Consumes: `getConfig` (Task 1), `parseNotification` / `isIncomingTransfer` / `ParseError` (Task 2), `buildAddat` (Task 3), `forwardToPPoints` (Task 4)
- Produces: `POST(request: Request): Promise<Response>`

Request body: `{ text: string, dryRun?: boolean }`.
Responses:
- `200 { ok: true, skipped: true, reason, rawText }` — not an incoming-transfer notification
- `200 { ok: true, dryRun: true, parsed, addat, url, rawText }` — dry run
- `200 { ok: true, parsed, addat, upstream, rawText }` — forwarded successfully
- `400 { ok: false, error: "parse_error", field, rawText }` — parse failure
- `400 { ok: false, error: "bad_request" }` — missing/invalid `text`
- `502 { ok: false, error: "forward_failed", upstream, addat, rawText }` — upstream failure

- [ ] **Step 1: Write the failing route tests**

Create `app/api/notify/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { POST } from "./route";

const SAMPLE = `รายการเงินเข้า
26 ส.ค. 69 15:07 น.
เข้าบัญชี xxx-x-x8972-x
จำนวนเงิน 200.00 บาท
ยอดเงินคงเหลือ 207.85 บาท`;

beforeAll(() => {
  process.env.STN_ID = "S-24001";
  process.env.ACCOUNT_CODE = "X-7689";
  process.env.BANK_SENDER_ID = "756697110107";
  process.env.STN_KEY = "22162";
  process.env.TARGET_URL = "https://p-points.com/sms_add.php";
});

afterEach(() => vi.restoreAllMocks());

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/notify", {
    method: "POST",
    body: JSON.stringify(body),
  }));

describe("POST /api/notify", () => {
  it("parses, builds and forwards a real notification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ text: SAMPLE });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.parsed.amount).toBe("200.00");
    expect(json.addat).toContain("transferred 200.00 Baht");
    expect(json.upstream.status).toBe(200);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("stn_id=S-24001");
  });

  it("does not call fetch on a dry run", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const json = await (await post({ text: SAMPLE, dryRun: true })).json();

    expect(json.dryRun).toBe(true);
    expect(json.addat).toContain("transferred 200.00 Baht");
    expect(json.url).toContain("stn_id=S-24001");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips an unrelated LINE message with 200 so MacroDroid does not retry", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ text: "สวัสดีครับ ประชุมกี่โมง" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 and the raw text when a field cannot be parsed", async () => {
    // Passes the incoming-transfer check but has no balance line.
    const text = "รายการเงินเข้า จำนวนเงิน 200.00 บาท";
    const response = await post({ text });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("parse_error");
    expect(json.field).toBe("balance");
    expect(json.rawText).toBe(text);
  });

  it("returns 400 when text is missing", async () => {
    const response = await post({});
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
  });

  it("returns 502 when p-points.com fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));

    const response = await post({ text: SAMPLE });
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe("forward_failed");
    expect(json.upstream.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/notify/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

Create `app/api/notify/route.ts`:

```typescript
import { getConfig } from "@/lib/config";
import { buildAddat } from "@/lib/buildAddat";
import { forwardToPPoints, buildTargetUrl } from "@/lib/forwardToPPoints";
import { isIncomingTransfer, parseNotification, ParseError } from "@/lib/parseNotification";

export async function POST(request: Request): Promise<Response> {
  let body: { text?: unknown; dryRun?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "bad_request", message: "Body must be JSON" },
      { status: 400 },
    );
  }

  const text = body.text;
  if (typeof text !== "string" || text.trim() === "") {
    return Response.json(
      { ok: false, error: "bad_request", message: 'Missing "text"' },
      { status: 400 },
    );
  }

  // Unrelated LINE messages are not failures — 200 keeps MacroDroid's
  // trigger history clean and stops it retrying.
  if (!isIncomingTransfer(text)) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: "not_an_incoming_transfer",
      rawText: text,
    });
  }

  const config = getConfig();

  let parsed;
  try {
    parsed = parseNotification(text);
  } catch (error) {
    if (error instanceof ParseError) {
      return Response.json(
        { ok: false, error: "parse_error", field: error.field, rawText: text },
        { status: 400 },
      );
    }
    throw error;
  }

  const addat = buildAddat(parsed, config);

  if (body.dryRun === true) {
    return Response.json({
      ok: true,
      dryRun: true,
      parsed,
      addat,
      url: buildTargetUrl(addat, config),
      rawText: text,
    });
  }

  const upstream = await forwardToPPoints(addat, config);
  if (!upstream.ok) {
    return Response.json(
      { ok: false, error: "forward_failed", upstream, addat, parsed, rawText: text },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, parsed, addat, upstream, rawText: text });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/notify/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — 28 tests across 5 files.

- [ ] **Step 6: Commit**

```bash
git add app/api/notify/route.ts app/api/notify/route.test.ts
git commit -m "feat: add /api/notify relay endpoint with dry-run support"
```

---

### Task 6: Demo page

**Files:**
- Create: `app/page.tsx`, `app/globals.css`
- Modify: `app/layout.tsx` (title, and drop the create-next-app font boilerplate)
- Delete: `app/page.module.css` if create-next-app made one

**Interfaces:**
- Consumes: `POST /api/notify` from Task 5
- Produces: nothing other tasks depend on

This task has no unit tests — it is a thin client over an endpoint already
covered by Task 5. It is verified manually in Task 7.

- [ ] **Step 1: Write the page**

Create `app/page.tsx`. The textarea starts pre-filled with the real sample
and dry-run starts checked, so a demo can be given without sending a live
transaction:

```tsx
"use client";

import { useState } from "react";

const SAMPLE = `รายการเงินเข้า
26 ส.ค. 69 15:07 น.
เข้าบัญชี xxx-x-x8972-x
จำนวนเงิน 200.00 บาท
ยอดเงินคงเหลือ 207.85 บาท`;

export default function Home() {
  const [text, setText] = useState(SAMPLE);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dryRun }),
      });
      setResult({ httpStatus: response.status, ...(await response.json()) });
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>LINE → p-points relay</h1>
      <p className="sub">
        วางข้อความแจ้งเตือนจาก LINE (K PLUS) แล้วกดส่ง เพื่อดูค่าที่ระบบอ่านได้
        และ URL ที่จะยิงไป p-points.com
      </p>

      <label htmlFor="text">ข้อความแจ้งเตือน</label>
      <textarea
        id="text"
        value={text}
        rows={8}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="row">
        <label className="check">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
          />
          Dry run (ไม่ยิงไป p-points.com จริง)
        </label>
        <button onClick={send} disabled={busy}>
          {busy ? "กำลังส่ง..." : "ส่ง"}
        </button>
      </div>

      {result !== null && (
        <>
          <label>ผลลัพธ์</label>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Replace `app/globals.css` entirely:

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #16181d;
  --muted: #5c6370;
  --border: #d8dce3;
  --surface: #f6f7f9;
  --accent: #06c755;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181d;
    --fg: #e8eaed;
    --muted: #9aa1ad;
    --border: #2f333c;
    --surface: #1e2128;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.6;
}

main {
  max-width: 46rem;
  margin: 0 auto;
  padding: 2.5rem 1.25rem 4rem;
}

h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
.sub { color: var(--muted); margin: 0 0 2rem; }

label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 0.5rem;
}

textarea, pre {
  width: 100%;
  padding: 0.875rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--fg);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.875rem;
}

textarea { resize: vertical; }

pre {
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin: 1rem 0 2rem;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-weight: 400;
  cursor: pointer;
}

button {
  padding: 0.625rem 1.75rem;
  border: none;
  border-radius: 0.5rem;
  background: var(--accent);
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
}

button:disabled { opacity: 0.6; cursor: default; }
```

- [ ] **Step 3: Simplify the layout**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINE → p-points relay",
  description: "รับแจ้งเตือนเงินเข้าจาก LINE แล้วส่งต่อไป p-points.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify the app builds**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add demo page for pasting notification text"
```

---

### Task 7: End-to-end verification and setup docs

**Files:**
- Create: `README.md`

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify a dry run through the API**

```bash
curl -s -X POST http://localhost:3000/api/notify \
  -H 'Content-Type: application/json' \
  -d '{"dryRun":true,"text":"รายการเงินเข้า\n26 ส.ค. 69 15:07 น.\nเข้าบัญชี xxx-x-x8972-x\nจำนวนเงิน 200.00 บาท\nยอดเงินคงเหลือ 207.85 บาท"}'
```

Expected: `addat` in the response is exactly:

```
+CMGR: "REC READ","756697110107","","26/08/26,15:07:00+28"26/08/26 15:07A/C X-7689 transferred 200.00 Baht to A/C X-7689 Outstanding Balance 207.85 Baht.OK
```

- [ ] **Step 3: Verify the demo page in a browser**

Open `http://localhost:3000`, confirm the sample is pre-filled and dry-run is
checked, press ส่ง, and confirm the result panel shows the parsed fields, the
same `addat` string, and the target URL.

- [ ] **Step 4: Write the README**

Create `README.md`:

````markdown
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
````

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README with MacroDroid setup instructions"
```

---

## Self-Review

**Spec coverage:** data flow → Tasks 2-5; config table → Task 1; two date
formats → Task 3 (with a test using a date where day ≠ year); components list
→ Tasks 1-5; error handling (400 parse / 502 forward / 200 skip) → Task 5;
demo page with dry-run and raw-text echo → Task 6; collapsed-line tolerance →
Task 2; testing plan (approved string, comma balance, single-digit day,
non-matching notification) → Tasks 2, 3, 5, 7. Out-of-scope items stay out:
no database, no auth, no multi-station config.

**Placeholders:** none — every step carries real code or a real command. The
one literal placeholder, `STN_KEY`, is a spec'd unknown (the key has not been
issued), is marked as such in `.env.example` and the README, and does not
block any task.

**Type consistency:** `Config` (Task 1) is consumed unchanged by Tasks 3-5.
`ParsedNotification` (Task 2) flows into `buildAddat` (Task 3) and out through
the route's `parsed` field. `ForwardResult` (Task 4) is the route's `upstream`
field. `buildTargetUrl` is exported from Task 4 and used by both the dry-run
branch and `forwardToPPoints`.
