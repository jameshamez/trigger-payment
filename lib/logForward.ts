import type { SupabaseLogConfig } from "./config";

export type ForwardLogEntry = {
  source: "notify" | "poll";
  amount: string;
  balance: string;
  addat: string;
  ok: boolean;
  responseStatus: number;
  responseBody: string;
};

export interface ForwardLogger {
  log(entry: ForwardLogEntry): Promise<void>;
}

/**
 * Records each attempt to forward to p-points.com, for the /logs page.
 *
 * Best-effort: a Supabase outage or missing config must never fail the
 * relay, so every failure is caught and reported to the console instead of
 * thrown. A null config (Supabase not set up yet) makes logging a no-op.
 */
export function createForwardLogger(config: SupabaseLogConfig | null): ForwardLogger {
  return {
    async log(entry: ForwardLogEntry): Promise<void> {
      if (!config) return;

      try {
        const response = await fetch(`${config.url}/rest/v1/forward_logs`, {
          method: "POST",
          // A hung Supabase request must not hang the caller: the notify
          // route's response to MacroDroid, or the poll loop's next email.
          signal: AbortSignal.timeout(5000),
          headers: {
            "Content-Type": "application/json",
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            source: entry.source,
            amount: entry.amount,
            balance: entry.balance,
            addat: entry.addat,
            ok: entry.ok,
            response_status: entry.responseStatus,
            response_body: entry.responseBody,
          }),
        });
        if (!response.ok) {
          console.error("forward log insert failed", response.status, await response.text());
        }
      } catch (error) {
        console.error("forward log insert failed", error);
      }
    },
  };
}
