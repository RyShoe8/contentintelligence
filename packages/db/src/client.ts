import { MongoClient, type Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

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
}

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTIONS.verticals).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { active: 1 } },
  ]);
  await db.collection(COLLECTIONS.input_signals).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { vertical_id: 1 } },
    { key: { enabled: 1 } },
    { key: { source_type: 1 } },
  ]);
  await db.collection(COLLECTIONS.signal_items).createIndexes([
    { key: { vertical_id: 1 } },
    { key: { input_signal_id: 1 } },
    { key: { created_at: -1 } },
    { key: { external_id: 1 }, unique: true, sparse: true },
    { key: { relevance_score: -1 } },
  ]);
  await db.collection(COLLECTIONS.gmail_oauth).createIndexes([
    { key: { email_address: 1 }, unique: true },
  ]);
}
