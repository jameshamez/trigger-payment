import type { Config } from "./config";
import type { BankEmail, MailClient } from "./gmail";
import { buildAddat } from "./buildAddat";
import { forwardAndLog } from "./forwardAndLog";
import {
  isFromExpectedSender,
  isIncomingTransfer,
  parseNotification,
  ParseError,
} from "./parseNotification";

export type PollOutcome =
  | { uid: number; status: "forwarded"; amount: string; balance: string; addat: string }
  | { uid: number; status: "ignored"; subject: string }
  | { uid: number; status: "parse_error"; field: string; subject: string; text: string }
  | { uid: number; status: "forward_failed"; upstreamStatus: number; body: string };

export type PollSummary = {
  checked: number;
  forwarded: number;
  needsAttention: number;
  outcomes: PollOutcome[];
};

/**
 * Handles one message, returning what happened.
 *
 * Whether the message is marked seen afterwards is the caller's decision, and
 * it differs by outcome — see {@link processUnread}.
 */
async function processEmail(email: BankEmail, config: Config): Promise<PollOutcome> {
  const body = `${email.subject}\n${email.text}`;

  // IMAP already restricts this to one From address, but a From header is
  // trivially forged, so the bank's name must appear in the message too.
  if (
    !isFromExpectedSender(body, config.requireSender) ||
    !isIncomingTransfer(body)
  ) {
    return { uid: email.uid, status: "ignored", subject: email.subject };
  }

  let parsed;
  try {
    parsed = parseNotification(body);
  } catch (error) {
    if (error instanceof ParseError) {
      return {
        uid: email.uid,
        status: "parse_error",
        field: error.field,
        subject: email.subject,
        text: email.text,
      };
    }
    throw error;
  }

  const addat = buildAddat(parsed, config);
  const upstream = await forwardAndLog("poll", parsed.amount, parsed.balance, addat, config);
  if (!upstream.ok) {
    return {
      uid: email.uid,
      status: "forward_failed",
      upstreamStatus: upstream.status,
      body: upstream.body,
    };
  }

  return {
    uid: email.uid,
    status: "forwarded",
    amount: parsed.amount,
    balance: parsed.balance,
    addat,
  };
}

/**
 * Processes every unread bank email, one at a time.
 *
 * Which outcomes mark a message read is the heart of this: a message is marked
 * read only once it can never usefully be retried.
 *
 * - `forwarded` — done, mark read.
 * - `ignored` — not a money-in alert (a statement, a promotion). It will never
 *   parse, so mark it read rather than re-examining it forever.
 * - `forward_failed` — p-points.com was down or refused. Leave it unread so the
 *   next run retries it; a real transaction must not be lost to a blip.
 * - `parse_error` — it claims to be a money-in alert but the figures could not
 *   be read. Leave it unread and report it: this is money we would otherwise
 *   drop, and it needs the patterns fixed rather than to be swallowed.
 *
 * One failing message never stops the others.
 */
export async function processUnread(
  client: MailClient,
  config: Config,
): Promise<PollSummary> {
  const emails = await client.fetchUnread();
  const outcomes: PollOutcome[] = [];

  for (const email of emails) {
    const outcome = await processEmail(email, config);
    outcomes.push(outcome);

    if (outcome.status === "forwarded" || outcome.status === "ignored") {
      await client.markSeen(email.uid);
    }
  }

  return {
    checked: emails.length,
    forwarded: outcomes.filter((o) => o.status === "forwarded").length,
    needsAttention: outcomes.filter(
      (o) => o.status === "parse_error" || o.status === "forward_failed",
    ).length,
    outcomes,
  };
}
