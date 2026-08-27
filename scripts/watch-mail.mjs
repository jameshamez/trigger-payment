#!/usr/bin/env node
/**
 * Calls /api/poll on a loop, for development and demos.
 *
 * In production an external cron does this instead — see the README. Kept as a
 * plain script rather than a background thread inside the app so that serverless
 * deployment stays possible.
 */

const BASE = process.env.RELAY_URL ?? "http://localhost:3000";
const SECRET = process.env.POLL_SECRET;
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15000);

if (!SECRET) {
  console.error("POLL_SECRET is not set. Load it from .env.local first, e.g.\n");
  console.error("  export $(grep -v '^#' .env.local | xargs) && node scripts/watch-mail.mjs\n");
  process.exit(1);
}

const stamp = () => new Date().toLocaleTimeString("en-GB");

async function poll() {
  try {
    const response = await fetch(`${BASE}/api/poll`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const result = await response.json();

    if (result.checked === 0) return; // Quiet when there is nothing to do.

    console.log(`[${stamp()}] checked ${result.checked}, forwarded ${result.forwarded}`);
    for (const outcome of result.outcomes ?? []) {
      if (outcome.status === "forwarded") {
        console.log(`  ✓ ${outcome.amount} Baht, balance ${outcome.balance}`);
      } else if (outcome.status !== "ignored") {
        console.log(`  ✗ ${outcome.status}`, JSON.stringify(outcome));
      }
    }
  } catch (error) {
    console.error(`[${stamp()}] poll failed:`, error.message);
  }
}

console.log(`Watching ${BASE}/api/poll every ${INTERVAL_MS / 1000}s. Ctrl-C to stop.`);
await poll();
setInterval(poll, INTERVAL_MS);
