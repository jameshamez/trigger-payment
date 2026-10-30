import { getConfig } from "@/lib/config";
import { buildAddatPayload } from "@/lib/addatPayload";
import { isScreenDump, normaliseScreenDump } from "@/lib/screenDump";
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
    // Logged like any other rejection. An empty body is what a phone sends
    // when the variable it was told to post resolves to nothing, and leaving
    // that unrecorded makes it indistinguishable from the phone never having
    // fired at all — the two need very different fixes.
    const log = await logSkipped("notify", "bad_request (empty or unparseable body)", "");
    return Response.json(
      {
        ok: false,
        error: "bad_request",
        message: 'Send the notification as a plain-text body, or JSON with a "text" field',
        log,
      },
      { status: 400 },
    );
  }

  const { dryRun } = payload;

  // A Read Screen dump is rebuilt into the card before anything else looks at
  // it, so every check below — trusted sender, wording, figures — works on the
  // same shape whichever way the phone captured the payment.
  //
  // A dump that holds no card (the lock screen, read because LINE never came
  // forward) normalises to nothing and is left as it arrived, so it is
  // reported as unrecognised rather than silently treated as empty.
  const text = isScreenDump(payload.text)
    ? normaliseScreenDump(payload.text) || payload.text
    : payload.text;

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

  // Raw mode forwards the alert as it stands, so understanding its wording is
  // not a precondition — a format we have never seen still gets through
  // instead of waiting on a parser. The sender check above remains the guard.
  //
  // Unrecognised alerts are otherwise not failures: 200 keeps MacroDroid's
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
  // line_add.php reads the text itself, so understanding it is not a
  // precondition for forwarding — the figures are read only to show in /logs.
  // A wording change at the bank must not hold back a real payment.
  let parsed: ParsedNotification | null = null;
  try {
    parsed = parseNotification(text);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
  }

  const addat = buildAddatPayload(text);

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
      { ok: false, error: "forward_failed", upstream, log: upstream.log, addat, parsed, rawText: text },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, parsed, addat, upstream, log: upstream.log, rawText: text });
}
