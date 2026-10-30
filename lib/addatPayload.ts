/**
 * What goes in the `addat` parameter: the alert's own text, unchanged.
 *
 * `line_add.php` is the endpoint for alerts captured from LINE, and it reads
 * Thai text directly — tested against it live, it answers `{"RES":"OK"}` to
 * the card's wording and `{"RES":"NOK"}` to a `+CMGR:` string. That is the
 * reverse of `sms_add.php`, which exists for GSM modules and only reads the
 * SMS shape they emit. Sending the text as it arrived is therefore not a
 * shortcut — it is what this endpoint is for.
 */
export function buildAddatPayload(text: string): string {
  return text;
}
