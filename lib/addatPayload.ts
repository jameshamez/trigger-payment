import type { Config } from "./config";
import type { ParsedNotification } from "./parseNotification";
import { buildAddat } from "./buildAddat";

/**
 * What goes in the `addat` parameter: always the `+CMGR:` SMS shape that
 * station P-26001's GSM module sends.
 *
 * Forwarding the alert's own text was tried against the live endpoint and
 * refused — p-points.com answered `{"RES":"NOK"}` to Thai text in three
 * different wordings, and `{"RES":"OK"}` to +CMGR. There is no second format
 * to choose between, so there is no setting either: a switch whose other
 * position is known to reject every payment is a way to take the relay down,
 * not a feature.
 */
export function buildAddatPayload(parsed: ParsedNotification, config: Config): string {
  return buildAddat(parsed, config);
}
