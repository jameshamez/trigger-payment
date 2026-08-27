import { describe, it, expect, vi, afterEach } from "vitest";
import { processUnread } from "./pollMail";
import type { BankEmail, MailClient } from "./gmail";
import type { Config } from "./config";

const CONFIG: Config = {
  stnId: "S-24001",
  accountCode: "X-7689",
  bankSenderId: "756697110107",
  stnKey: "22162",
  targetUrl: "https://p-points.com/sms_add.php",
};

const MONEY_IN = `รายการเงินเข้า
26 ส.ค. 69 15:07 น.
เข้าบัญชี xxx-x-x8972-x
จำนวนเงิน 200.00 บาท
ยอดเงินคงเหลือ 207.85 บาท`;

function email(uid: number, text: string, subject = "แจ้งเตือน"): BankEmail {
  return { uid, subject, text, date: new Date("2026-08-26T15:07:00+07:00") };
}

/** An in-memory MailClient that records which uids were marked seen. */
function fakeClient(emails: BankEmail[]) {
  const seen: number[] = [];
  const client: MailClient = {
    fetchUnread: async () => emails,
    markSeen: async (uid) => void seen.push(uid),
    close: async () => {},
  };
  return { client, seen };
}

afterEach(() => vi.restoreAllMocks());

const stubFetch = (status: number, body = "OK") =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));

describe("processUnread", () => {
  it("forwards a money-in email and marks it read", async () => {
    stubFetch(200);
    const { client, seen } = fakeClient([email(1, MONEY_IN)]);

    const summary = await processUnread(client, CONFIG);

    expect(summary).toMatchObject({ checked: 1, forwarded: 1, needsAttention: 0 });
    expect(summary.outcomes[0]).toMatchObject({
      uid: 1,
      status: "forwarded",
      amount: "200.00",
      balance: "207.85",
    });
    expect(seen).toEqual([1]);
  });

  it("reads figures out of the subject line too", async () => {
    stubFetch(200);
    // Some banks put everything in the subject and leave the body a stub.
    const { client } = fakeClient([email(1, "ดูรายละเอียดในแอป", MONEY_IN)]);

    const summary = await processUnread(client, CONFIG);

    expect(summary.forwarded).toBe(1);
  });

  it("marks an unrelated bank email read without forwarding it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { client, seen } = fakeClient([email(7, "โปรโมชันบัตรเครดิต")]);

    const summary = await processUnread(client, CONFIG);

    expect(summary).toMatchObject({ checked: 1, forwarded: 0, needsAttention: 0 });
    expect(summary.outcomes[0].status).toBe("ignored");
    expect(fetchMock).not.toHaveBeenCalled();
    // Marked read so it is not re-examined on every future run.
    expect(seen).toEqual([7]);
  });

  it("leaves a money-in email unread when p-points.com fails, so it retries", async () => {
    stubFetch(500, "upstream down");
    const { client, seen } = fakeClient([email(2, MONEY_IN)]);

    const summary = await processUnread(client, CONFIG);

    expect(summary).toMatchObject({ forwarded: 0, needsAttention: 1 });
    expect(summary.outcomes[0]).toMatchObject({ status: "forward_failed", upstreamStatus: 500 });
    expect(seen).toEqual([]);
  });

  it("leaves an unparseable money-in email unread and reports the field", async () => {
    stubFetch(200);
    const { client, seen } = fakeClient([email(3, "รายการเงินเข้า จำนวนเงิน 200.00 บาท")]);

    const summary = await processUnread(client, CONFIG);

    expect(summary.needsAttention).toBe(1);
    expect(summary.outcomes[0]).toMatchObject({ status: "parse_error", field: "balance" });
    // Not marked read: this is money we would otherwise silently drop.
    expect(seen).toEqual([]);
  });

  it("keeps going after one email fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("down", { status: 500 }))
        .mockResolvedValue(new Response("OK", { status: 200 })),
    );
    const { client, seen } = fakeClient([email(1, MONEY_IN), email(2, MONEY_IN)]);

    const summary = await processUnread(client, CONFIG);

    expect(summary).toMatchObject({ checked: 2, forwarded: 1, needsAttention: 1 });
    expect(seen).toEqual([2]);
  });

  it("reports an empty mailbox without touching the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { client } = fakeClient([]);

    expect(await processUnread(client, CONFIG)).toEqual({
      checked: 0,
      forwarded: 0,
      needsAttention: 0,
      outcomes: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
