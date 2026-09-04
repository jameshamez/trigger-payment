import { describe, it, expect, vi, afterEach } from "vitest";
import { forwardAndLog } from "./forwardAndLog";
import type { Config } from "./config";

const CONFIG: Config = {
  stnId: "S-24001",
  accountCode: "X-7689",
  bankSenderId: "756697110107",
  stnKey: "22162",
  targetUrl: "https://p-points.com/sms_add.php",
  requireSender: "",
};

const ADDAT = '+CMGR: "REC READ","756697110107","","26/08/26,15:07:00+28"...';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("forwardAndLog", () => {
  it("forwards to p-points.com and returns the upstream result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("OK", { status: 200 })));

    const result = await forwardAndLog("notify", "200.00", "207.85", ADDAT, CONFIG);

    expect(result).toMatchObject({ ok: true, status: 200, body: "OK" });
  });

  it("logs the attempt to Supabase when logging is configured", async () => {
    process.env.SUPABASE_URL = "https://xyzcompany.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("OK", { status: 200 })) // p-points.com
      .mockResolvedValueOnce(new Response("", { status: 201 })); // Supabase insert
    vi.stubGlobal("fetch", fetchMock);

    await forwardAndLog("poll", "200.00", "207.85", ADDAT, CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [logUrl, logInit] = fetchMock.mock.calls[1];
    expect(logUrl).toBe("https://xyzcompany.supabase.co/rest/v1/forward_logs");
    expect(JSON.parse(logInit.body)).toMatchObject({
      source: "poll",
      amount: "200.00",
      balance: "207.85",
      ok: true,
      response_status: 200,
    });
  });

  it("does not call Supabase when logging is not configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await forwardAndLog("notify", "200.00", "207.85", ADDAT, CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
