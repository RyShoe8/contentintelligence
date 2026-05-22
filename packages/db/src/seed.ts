import { getDb, closeDb, ensureIndexes } from "./client.js";
import { listOrganizations } from "./org-repos.js";
import { upsertContentSignal, upsertSource } from "./repos.js";

async function main(): Promise<void> {
  const db = await getDb();
  await ensureIndexes(db);

  const orgs = await listOrganizations(db);
  const orgId = orgs[0]?.id;
  if (!orgId) {
    throw new Error("No organization found after ensureIndexes");
  }

  const gambling = await upsertContentSignal(db, {
    organization_id: orgId,
    name: "Gambling",
    description: "Casino and betting promotional signals",
    keywords: [
      "bonus",
      "free spins",
      "match",
      "reload",
      "vip",
      "wager",
      "promo",
    ],
    lookback_window_hours: 168,
    deal_unit_tokens: [],
    active: true,
  });

  await upsertSource(db, {
    content_signal_id: gambling.id,
    enabled: true,
    config: {
      email_address: process.env.SEED_GMAIL_ADDRESS ?? "",
      labels: ["Casinos"],
      sender_domains: [],
      scan_body: true,
      ai_summary_enabled: true,
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
