import type { Config } from "./config";
import type { ParsedNotification } from "./parseNotification";
import { buildAddat } from "./buildAddat";

/**
 * What to put in the `addat` parameter.
 *
 * `raw` forwards the alert's own text exactly as the phone received it.
 * `cmgr` rebuilds it in the `+CMGR:` SMS shape that station P-26001's GSM
 * module has always sent.
 *
 * The switch exists because whether p-points.com can read anything other than
 * `+CMGR:` is still unanswered. It lets that be settled by changing one
 * variable rather than by editing and redeploying code.
 *
 * In `raw` mode `parsed` may be null: the figures are not needed to build the
 * payload, so an alert whose wording has drifted is still passed through
 * rather than dropped. `cmgr` cannot do that — it has to know the numbers.
 */
export function buildAddatPayload(
  rawText: string,
  parsed: ParsedNotification | null,
  config: Config,
): string {
  if (config.addatFormat === "raw") return rawText;
  if (!parsed) {
    throw new Error("The cmgr format needs a parsed alert to build from");
  }
  return buildAddat(parsed, config);
}
