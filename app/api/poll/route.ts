import { getConfig, getGmailConfig } from "@/lib/config";
import { connectGmail } from "@/lib/gmail";
import { processUnread } from "@/lib/pollMail";

// IMAP needs a raw TCP socket, which the Edge runtime cannot open.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads the caller's secret from either the Authorization header or ?secret=. */
function presentedSecret(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return bearer || new URL(request.url).searchParams.get("secret") || "";
}

/**
 * Compares in constant time so a caller cannot recover the secret by timing
 * repeated guesses.
 */
function secretMatches(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < presented.length; i += 1) {
    difference |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

async function handle(request: Request): Promise<Response> {
  const gmail = getGmailConfig();

  if (!secretMatches(presentedSecret(request), gmail.pollSecret)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await connectGmail(gmail);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "mailbox_unavailable",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  try {
    const summary = await processUnread(client, getConfig());
    // needsAttention means a real transaction was not relayed. Say so with a
    // non-2xx status, so an external cron's own alerting notices.
    return Response.json(
      { ok: summary.needsAttention === 0, ...summary },
      { status: summary.needsAttention === 0 ? 200 : 207 },
    );
  } finally {
    await client.close().catch(() => {});
  }
}

// GET so any plain cron service can call it; POST for callers that prefer it.
export const GET = handle;
export const POST = handle;
