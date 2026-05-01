import { getDb, closeDb, ensureIndexes } from "./client.js";
import { upsertVertical, upsertInputSignal } from "./repos.js";

async function main(): Promise<void> {
  const db = await getDb();
  await ensureIndexes(db);

  const gambling = await upsertVertical(db, {
    name: "Gambling",
    description: "Casino and betting promotional signals",
    default_keywords: [
      "bonus",
      "free spins",
      "match",
      "reload",
      "vip",
      "wager",
      "promo",
    ],
    active: true,
  });

  await upsertInputSignal(db, {
    vertical_id: gambling.id,
    name: "Gmail Inbox – Casinos label",
    enabled: true,
    keywords: ["bonus", "promo", "free spins"],
    config: {
      email_address: process.env.SEED_GMAIL_ADDRESS ?? "you@example.com",
      labels: ["Casinos"],
      sender_domains: [],
      scan_body: true,
      lookback_window_hours: 168,
    },
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete:", gambling.id);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
