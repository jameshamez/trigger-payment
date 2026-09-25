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

describe("reading p-points.com's own verdict", () => {
  const ok = '<html><body>{"RES":"OK","stn_id":"S-24001","addat":"[+CMGR: ..."}';
  const nok = '<html><body>{"RES":"NOK","stn_id":"S-24001"}';

  it("treats RES:NOK as a failure even though the HTTP status is 200", async () => {
    // p-points.com answers 200 whether it accepted the row or not; only the
    // RES field says which. Without this a rejected payment is recorded as
    // delivered and never retried.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(nok, { status: 200 })));

    expect(await forwardToPPoints(ADDAT, CONFIG)).toMatchObject({ ok: false, status: 200 });
  });

  it("treats RES:OK as success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(ok, { status: 200 })));

    expect(await forwardToPPoints(ADDAT, CONFIG)).toMatchObject({ ok: true });
  });

  it("falls back to the HTTP status when there is no RES field", async () => {
    // An error page or a changed response shape must not be read as a verdict.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>hi</html>", { status: 200 })));

    expect((await forwardToPPoints(ADDAT, CONFIG)).ok).toBe(true);
  });
});
