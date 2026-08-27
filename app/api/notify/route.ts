import { getConfig } from "@/lib/config";
import { buildAddat } from "@/lib/buildAddat";
import { forwardToPPoints, buildTargetUrl } from "@/lib/forwardToPPoints";
import { isIncomingTransfer, parseNotification, ParseError } from "@/lib/parseNotification";

export async function POST(request: Request): Promise<Response> {
  let body: { text?: unknown; dryRun?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "bad_request", message: "Body must be JSON" },
      { status: 400 },
    );
  }

  const text = body.text;
  if (typeof text !== "string" || text.trim() === "") {
    return Response.json(
      { ok: false, error: "bad_request", message: 'Missing "text"' },
      { status: 400 },
    );
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

  const config = getConfig();

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

  if (body.dryRun === true) {
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
