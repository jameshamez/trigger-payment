import { describe, it, expect, vi, afterEach } from "vitest";
import { createForwardLogger, type ForwardLogEntry } from "./logForward";
import type { SupabaseLogConfig } from "./config";

const CONFIG: SupabaseLogConfig = {
  url: "https://xyzcompany.supabase.co",
  serviceRoleKey: "service-role-key",
};

const ENTRY: ForwardLogEntry = {
  source: "notify",
  amount: "200.00",
  balance: "207.85",
  addat: '+CMGR: "REC READ","756697110107","","26/08/26,15:07:00+28"...',
  ok: true,
  responseStatus: 200,
  responseBody: "OK",
};

afterEach(() => vi.restoreAllMocks());

describe("createForwardLogger", () => {
  it("does nothing when Supabase is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await createForwardLogger(null).log(ENTRY);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the entry to the Supabase REST endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await createForwardLogger(CONFIG).log(ENTRY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://xyzcompany.supabase.co/rest/v1/forward_logs");
    expect(init.headers.apikey).toBe("service-role-key");
    expect(init.headers.Authorization).toBe("Bearer service-role-key");
    expect(JSON.parse(init.body)).toEqual({
      source: "notify",
      amount: "200.00",
      balance: "207.85",
      addat: ENTRY.addat,
      ok: true,
      response_status: 200,
      response_body: "OK",
    });
  });

  it("does not throw when Supabase rejects the insert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })),
    );

    await expect(createForwardLogger(CONFIG).log(ENTRY)).resolves.toBeUndefined();
  });

  it("does not throw when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(createForwardLogger(CONFIG).log(ENTRY)).resolves.toBeUndefined();
  });

  it("bounds the request with a timeout, so a stalled Supabase cannot hang the caller", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await createForwardLogger(CONFIG).log(ENTRY);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
