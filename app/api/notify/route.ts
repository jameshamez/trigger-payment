import { getConfig } from "@/lib/config";
import { buildAddatPayload } from "@/lib/addatPayload";
import { buildTargetUrl } from "@/lib/forwardToPPoints";
import { forwardAndLog, logSkipped } from "@/lib/forwardAndLog";
import {
  isFromExpectedSender,
  isIncomingTransfer,
  parseNotification,
  ParseError,
  type ParsedNotification,
} from "@/lib/parseNotification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestPayload = { text: string; dryRun: boolean };

/**
 * Accepts either JSON (`{"text": "...", "dryRun": true}`) or a plain-text body
 * carrying the notification itself.
 *
 * Plain text exists for MacroDroid: its magic-text substitution is literal, so
 * a notification containing a quote or a newline would break a JSON body it
 * built by hand. Sending the raw text sidesteps escaping entirely.
 */
async function readPayload(request: Request): Promise<RequestPayload | null> {
  const raw = await request.text();
  if (raw.trim() === "") return null;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { text: raw, dryRun: false };
  }

  let body: { text?: unknown; dryRun?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body.text !== "string" || body.text.trim() === "") return null;

  return { text: body.text, dryRun: body.dryRun === true };
}

export async function POST(request: Request): Promise<Response> {
  const payload = await readPayload(request);
  if (payload === null) {
    return Response.json(
      {
        ok: false,
        error: "bad_request",
        message: 'Send the notification as a plain-text body, or JSON with a "text" field',
      },
      { status: 400 },
    );
  }

  const { text, dryRun } = payload;

  const config = getConfig();

  // Checked before the wording, because wording alone proves nothing: the phone
  // forwards every LINE notification, so a message typed by anyone in any chat
  // would otherwise be relayed as a real transaction.
  if (!isFromExpectedSender(text, config.requireSender)) {
    const log = await logSkipped("notify", "sender_not_trusted", text);
    return Response.json({
      ok: true,
      skipped: true,
      reason: "sender_not_trusted",
      log,
      rawText: text,
    });
  }

  // Unrelated LINE messages are not failures — 200 keeps MacroDroid's
  // trigger history clean and stops it retrying.
  if (!isIncomingTransfer(text)) {
    const log = await logSkipped("notify", "not_an_incoming_transfer", text);
    return Response.json({
      ok: true,
      skipped: true,
      reason: "not_an_incoming_transfer",
      log,
      rawText: text,
    });
  }

  // In raw mode the figures are not needed to build the payload, so a wording
  // change at the bank must not stop a real payment: read them if we can, for
  // the response and the log, and carry on if we cannot.
  let parsed: ParsedNotification | null = null;
  try {
    parsed = parseNotification(text);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    if (config.addatFormat !== "raw") {
      return Response.json(
        { ok: false, error: "parse_error", field: error.field, rawText: text },
        { status: 400 },
      );
    }
  }

  const addat = buildAddatPayload(text, parsed, config);

  if (dryRun) {
    return Response.json({
      ok: true,
      dryRun: true,
      parsed,
      addat,
      url: buildTargetUrl(addat, config),
      rawText: text,
    });
  }

  const upstream = await forwardAndLog("notify", parsed?.amount ?? "", parsed?.balance ?? "", addat, config);
  if (!upstream.ok) {
    return Response.json(
      { ok: false, error: "forward_failed", upstream, addat, parsed, rawText: text },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, parsed, addat, upstream, log: upstream.log, rawText: text });
}
