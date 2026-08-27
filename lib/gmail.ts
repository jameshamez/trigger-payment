import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { htmlToText } from "./htmlToText";
import type { GmailConfig } from "./config";

export type BankEmail = {
  uid: number;
  subject: string;
  /** Body flattened to plain text, whatever the original part structure. */
  text: string;
  date: Date;
};

/**
 * The mail operations the poll route needs, named as an interface so the route
 * can be tested against a fake instead of a live IMAP server.
 */
export interface MailClient {
  fetchUnread(): Promise<BankEmail[]>;
  markSeen(uid: number): Promise<void>;
  close(): Promise<void>;
}

/**
 * Opens an IMAP session against Gmail.
 *
 * Unread state is the deduplication record: only UNSEEN mail from the bank is
 * returned, and the caller marks a message seen once it has been forwarded. A
 * crash mid-run therefore leaves the message unread and it is retried, rather
 * than being double-counted or silently dropped.
 */
export async function connectGmail(config: GmailConfig): Promise<MailClient> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: config.user, pass: config.appPassword },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox);

  return {
    async fetchUnread(): Promise<BankEmail[]> {
      const uids = await client.search({ seen: false, from: config.bankFrom }, { uid: true });
      if (!uids || uids.length === 0) return [];

      const emails: BankEmail[] = [];
      for await (const message of client.fetch(
        uids,
        { source: true, envelope: true },
        { uid: true },
      )) {
        // `source` is typed optional: a server may answer a fetch without the
        // body part. Skipping leaves the message unread, so the next run
        // retries it rather than losing it.
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);
        const text = parsed.text?.trim()
          ? parsed.text
          : parsed.html
            ? htmlToText(parsed.html)
            : "";

        emails.push({
          uid: message.uid,
          subject: parsed.subject ?? "",
          text,
          date: parsed.date ?? message.envelope?.date ?? new Date(),
        });
      }
      return emails;
    },

    async markSeen(uid: number): Promise<void> {
      await client.messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true });
    },

    async close(): Promise<void> {
      lock.release();
      await client.logout();
    },
  };
}
