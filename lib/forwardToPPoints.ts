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
