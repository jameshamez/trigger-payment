import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

const connectGmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gmail", () => ({ connectGmail }));

import { GET } from "./route";
import type { BankEmail, MailClient } from "@/lib/gmail";

const MONEY_IN = `รายการเงินเข้า
26 ส.ค. 69 15:07 น.
จำนวนเงิน 200.00 บาท
ยอดเงินคงเหลือ 207.85 บาท`;

beforeAll(() => {
  process.env.STN_ID = "S-24001";
  process.env.ACCOUNT_CODE = "X-7689";
  process.env.BANK_SENDER_ID = "756697110107";
  process.env.STN_KEY = "22162";
  process.env.TARGET_URL = "https://p-points.com/sms_add.php";
  process.env.GMAIL_USER = "station@gmail.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  process.env.BANK_EMAIL_FROM = "no-reply@kasikornbank.com";
  process.env.POLL_SECRET = "s3cret";
});

let closed: boolean;

function stubMailbox(emails: BankEmail[]) {
  closed = false;
  const client: MailClient = {
    fetchUnread: async () => emails,
    markSeen: async () => {},
    close: async () => void (closed = true),
  };
  connectGmail.mockResolvedValue(client);
}

beforeEach(() => {
  connectGmail.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("OK", { status: 200 })));
});
afterEach(() => vi.restoreAllMocks());

const call = (query: string, headers?: HeadersInit) =>
  GET(new Request(`http://localhost/api/poll${query}`, { headers }));

describe("GET /api/poll", () => {
  it("rejects a request with no secret", async () => {
    const response = await call("");
    expect(response.status).toBe(401);
    expect(connectGmail).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    expect((await call("?secret=nope")).status).toBe(401);
    expect(connectGmail).not.toHaveBeenCalled();
  });

  it("accepts the secret as a query parameter", async () => {
    stubMailbox([]);
    const response = await call("?secret=s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, checked: 0, forwarded: 0 });
  });

  it("accepts the secret as a bearer token", async () => {
    stubMailbox([]);
    const response = await call("", { Authorization: "Bearer s3cret" });
    expect(response.status).toBe(200);
  });

  it("reports what it forwarded", async () => {
    stubMailbox([
      { uid: 1, subject: "แจ้งเตือน", text: MONEY_IN, date: new Date() },
    ]);

    const response = await call("?secret=s3cret");
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, checked: 1, forwarded: 1, needsAttention: 0 });
  });

  it("answers 207 when a transaction could not be relayed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 500 })));
    stubMailbox([{ uid: 1, subject: "แจ้งเตือน", text: MONEY_IN, date: new Date() }]);

    const response = await call("?secret=s3cret");

    expect(response.status).toBe(207);
    expect(await response.json()).toMatchObject({ ok: false, needsAttention: 1 });
  });

  it("returns 502 when the mailbox cannot be reached", async () => {
    connectGmail.mockRejectedValue(new Error("Invalid credentials"));

    const response = await call("?secret=s3cret");
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe("mailbox_unavailable");
    expect(json.message).toContain("Invalid credentials");
  });

  it("closes the mailbox even when processing throws", async () => {
    connectGmail.mockResolvedValue({
      fetchUnread: async () => {
        throw new Error("IMAP dropped");
      },
      markSeen: async () => {},
      close: async () => void (closed = true),
    } satisfies MailClient);

    await expect(call("?secret=s3cret")).rejects.toThrow("IMAP dropped");
    expect(closed).toBe(true);
  });
});
