import type { Config } from "./config";
import { getSupabaseLogConfig } from "./config";
import { forwardToPPoints, type ForwardResult } from "./forwardToPPoints";
import { createForwardLogger, type ForwardLogEntry } from "./logForward";

/**
 * The one place both `/api/notify` and `/api/poll` forward to p-points.com,
 * so logging the attempt can't be forgotten by a future third caller the way
 * a copy-pasted logging call at each site could be.
 */
export async function forwardAndLog(
  source: ForwardLogEntry["source"],
  amount: string,
  balance: string,
  addat: string,
  config: Config,
): Promise<ForwardResult> {
  const upstream = await forwardToPPoints(addat, config);

  await createForwardLogger(getSupabaseLogConfig()).log({
    source,
    amount,
    balance,
    addat,
    ok: upstream.ok,
    responseStatus: upstream.status,
    responseBody: upstream.body,
  });

  return upstream;
}
