import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
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

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => vi.restoreAllMocks());

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

const postPlainText = (text: string) =>
  POST(new Request("http://localhost/api/notify", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: text,
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

  it("accepts a plain-text body, which is how MacroDroid sends it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await postPlainText(SAMPLE);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.parsed.amount).toBe("200.00");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("handles quotes and newlines in a plain-text body", async () => {
    // The exact shape that would break a JSON body MacroDroid built by hand.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("OK", { status: 200 })));

    const withQuotes = SAMPLE.replace("รายการเงินเข้า", 'รายการเงินเข้า "K PLUS"');
    const json = await (await postPlainText(withQuotes)).json();

    expect(json.ok).toBe(true);
    expect(json.parsed.amount).toBe("200.00");
    expect(json.rawText).toBe(withQuotes);
  });

  it("returns 400 for an empty body", async () => {
    const response = await postPlainText("   ");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
  });

  describe("when a trusted sender is configured", () => {
    beforeEach(() => {
      process.env.REQUIRE_SENDER = "K PLUS";
    });
    afterEach(() => {
      delete process.env.REQUIRE_SENDER;
    });

    it("relays an alert that names the bank", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const json = await (await postPlainText(`K PLUS\n${SAMPLE}`)).json();

      expect(json.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalled();
    });

    it("refuses a lookalike message typed by someone in a LINE chat", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      // Word-for-word a real alert, but with no bank name — which is all a
      // person in any LINE chat would need to fake a transaction.
      const response = await postPlainText(SAMPLE);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.skipped).toBe(true);
      expect(json.reason).toBe("sender_not_trusted");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("returns 502 when p-points.com fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));

    const response = await post({ text: SAMPLE });
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe("forward_failed");
    expect(json.upstream.status).toBe(500);
  });

  describe("when Supabase logging is configured", () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = "https://xyzcompany.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    });

    it("records the forward attempt in Supabase", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("OK", { status: 200 })) // p-points.com
        .mockResolvedValueOnce(new Response("", { status: 201 })); // Supabase insert
      vi.stubGlobal("fetch", fetchMock);

      await post({ text: SAMPLE });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [logUrl, logInit] = fetchMock.mock.calls[1];
      expect(logUrl).toBe("https://xyzcompany.supabase.co/rest/v1/forward_logs");
      expect(JSON.parse(logInit.body)).toMatchObject({
        source: "notify",
        amount: "200.00",
        balance: "207.85",
        ok: true,
        response_status: 200,
      });
    });

    it("still logs when p-points.com fails", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("nope", { status: 500 })) // p-points.com
        .mockResolvedValueOnce(new Response("", { status: 201 })); // Supabase insert
      vi.stubGlobal("fetch", fetchMock);

      await post({ text: SAMPLE });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, logInit] = fetchMock.mock.calls[1];
      expect(JSON.parse(logInit.body)).toMatchObject({ ok: false, response_status: 500 });
    });

    it("does not log a skipped message, since nothing was sent", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await post({ text: "สวัสดีครับ ประชุมกี่โมง" });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
