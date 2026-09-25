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
  // Left off when unset: sending an empty or placeholder key is worse than
  // sending none, since p-points.com would have to reject it.
  if (config.stnKey !== "") url.searchParams.set("key", config.stnKey);
  return url.toString();
}

/**
 * Whether p-points.com actually accepted the row.
 *
 * It answers HTTP 200 either way and states its verdict only in a `RES` field
 * inside the body: "OK" when the row went in, "NOK" when it was refused — as
 * it refuses anything that is not the `+CMGR:` SMS shape. Reading only the
 * HTTP status records a refused payment as delivered, so it is never retried
 * and nobody finds out.
 *
 * A response with no `RES` field at all is something we do not recognise — an
 * error page, or a changed API — so the HTTP status decides rather than
 * guessing a verdict out of it.
 */
function acceptedByUpstream(body: string, httpOk: boolean): boolean {
  const verdict = body.match(/"RES"\s*:\s*"([^"]*)"/);
  return verdict ? verdict[1].toUpperCase() === "OK" : httpOk;
}

export async function forwardToPPoints(
  addat: string,
  config: Config,
): Promise<ForwardResult> {
  const url = buildTargetUrl(addat, config);
  try {
    const response = await fetch(url, { method: "GET" });
    const body = await response.text();
    return {
      ok: acceptedByUpstream(body, response.ok),
      status: response.status,
      body,
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
