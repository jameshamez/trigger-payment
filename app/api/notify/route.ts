import { getConfig } from "@/lib/config";
import { buildAddat } from "@/lib/buildAddat";
import { forwardToPPoints, buildTargetUrl } from "@/lib/forwardToPPoints";
import {
  isFromExpectedSender,
  isIncomingTransfer,
  parseNotification,
  ParseError,
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
    return Response.json({
      ok: true,
      skipped: true,
      reason: "sender_not_trusted",
      rawText: text,
    });
  }

  // Unrelated LINE messages are not failures — 200 keeps MacroDroid's
  // trigger history clean and stops it retrying.
  if (!isIncomingTransfer(text)) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: "not_an_incoming_transfer",
      rawText: text,
    });
  }

  let parsed;
  try {
    parsed = parseNotification(text);
  } catch (error) {
    if (error instanceof ParseError) {
      return Response.json(
        { ok: false, error: "parse_error", field: error.field, rawText: text },
        { status: 400 },
      );
    }
    throw error;
  }

  const addat = buildAddat(parsed, config);

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

  const upstream = await forwardToPPoints(addat, config);
  if (!upstream.ok) {
    return Response.json(
      { ok: false, error: "forward_failed", upstream, addat, parsed, rawText: text },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, parsed, addat, upstream, rawText: text });
}
