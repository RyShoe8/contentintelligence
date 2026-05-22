import { MongoClient, type Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";
import { migrateLegacyCollections } from "./migrate.js";
import { migrateOrganizations } from "./org-repos.js";

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function getDb(uri?: string): Promise<Db> {
  const connectionUri = uri ?? process.env.MONGODB_URI;
  if (!connectionUri) {
    throw new Error("MONGODB_URI is required");
  }
  if (!dbInstance) {
    client = new MongoClient(connectionUri);
    await client.connect();
    const dbName = process.env.MONGODB_DB_NAME ?? "content_resourcer";
    dbInstance = client.db(dbName);
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
  }
  ensureIndexesOnce = null;
}

let ensureIndexesOnce: Promise<void> | null = null;

async function runEnsureIndexes(db: Db): Promise<void> {
  await migrateLegacyCollections(db);
  await migrateOrganizations(db);

  await db.collection(COLLECTIONS.organizations).createIndexes([{ key: { id: 1 }, unique: true }]);
  await db.collection(COLLECTIONS.org_invites).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { organization_id: 1, email: 1 }, unique: true },
  ]);
  await db.collection(COLLECTIONS.content_signals).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { organization_id: 1 } },
    { key: { active: 1 } },
  ]);
  await db.collection(COLLECTIONS.sources).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { content_signal_id: 1 } },
    { key: { enabled: 1 } },
    { key: { source_type: 1 } },
  ]);
  await db.collection(COLLECTIONS.signal_items).createIndexes([
    { key: { organization_id: 1 } },
    { key: { content_signal_id: 1 } },
    { key: { source_id: 1 } },
    { key: { created_at: -1 } },
    { key: { external_id: 1 }, unique: true, sparse: true },
    { key: { relevance_score: -1 } },
    { key: { "deal_metrics.effective_savings_pct": -1 }, sparse: true },
    { key: { "deal_metrics.confidence": -1 }, sparse: true },
  ]);
  await db.collection(COLLECTIONS.gmail_oauth).createIndexes([
    { key: { email_address: 1 }, unique: true },
  ]);
}

/** Run migrations and index creation once per server instance (not per page request). */
export async function ensureIndexes(db: Db): Promise<void> {
  if (!ensureIndexesOnce) {
    ensureIndexesOnce = runEnsureIndexes(db).catch((err) => {
      ensureIndexesOnce = null;
      throw err;
    });
  }
  return ensureIndexesOnce;
}
