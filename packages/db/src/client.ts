import { MongoClient, type Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";
import { migrateLegacyCollections } from "./migrate.js";
import { migrateOrganizations } from "./org-repos.js";

const MONGO_CLIENT_OPTIONS = {
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 10_000,
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 30_000,
} as const;

/** Per-request client for serverless SSR — avoids stale warm-instance pool sockets. */
const MONGO_FRESH_CLIENT_OPTIONS = {
  maxPoolSize: 1,
  minPoolSize: 0,
  maxIdleTimeMS: 5_000,
  waitQueueTimeoutMS: 5_000,
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 15_000,
} as const;

const MAX_DB_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [200, 500] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MONGO_NETWORK_ERROR_NAMES = new Set([
  "MongoNetworkTimeoutError",
  "MongoServerSelectionError",
  "MongoNetworkError",
]);

/** True when a Mongo driver/network failure may be recoverable by reconnecting. */
export function isMongoNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: string }).name ?? "";
  return MONGO_NETWORK_ERROR_NAMES.has(name);
}

/** Run fn(db); on network error reset singleton and retry (serverless stale pool recovery). */
export async function withDbRetry<T>(fn: (db: Db) => Promise<T>, uri?: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_DB_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
      await resetMongoClient();
    }
    try {
      return await fn(await getDb(uri));
    } catch (e) {
      if (!isMongoNetworkError(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

/** Run fn(db) on a new client per attempt; close after each attempt (SSR pages on Vercel). */
export async function withFreshDbRetry<T>(fn: (db: Db) => Promise<T>, uri?: string): Promise<T> {
  const connectionUri = resolveMongoUri(uri);
  const dbName = process.env.MONGODB_DB_NAME ?? "content_resourcer";
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_DB_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
    }

    const client = new MongoClient(connectionUri, MONGO_FRESH_CLIENT_OPTIONS);
    try {
      await client.connect();
      return await fn(client.db(dbName));
    } catch (e) {
      if (!isMongoNetworkError(e)) throw e;
      lastError = e;
    } finally {
      await client.close().catch(() => {
        // ignore close errors on broken connections
      });
    }
  }

  throw lastError;
}

declare global {
  // eslint-disable-next-line no-var -- HMR / serverless singleton
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoClientUri: string | undefined;
}

function resolveMongoUri(uri?: string): string {
  const connectionUri = uri ?? process.env.MONGODB_URI;
  if (!connectionUri) {
    throw new Error("MONGODB_URI is required");
  }
  return connectionUri;
}

function connectMongoClient(connectionUri: string): Promise<MongoClient> {
  const client = new MongoClient(connectionUri, MONGO_CLIENT_OPTIONS);
  return client.connect().then(
    () => client,
    (err) => {
      if (globalThis._mongoClientUri === connectionUri) {
        globalThis._mongoClientPromise = undefined;
        globalThis._mongoClientUri = undefined;
      }
      throw err;
    },
  );
}

/** Shared MongoClient for web auth adapter and getDb — one pool per warm instance. */
export function getMongoClient(uri?: string): Promise<MongoClient> {
  const connectionUri = resolveMongoUri(uri);
  if (
    globalThis._mongoClientPromise &&
    globalThis._mongoClientUri === connectionUri
  ) {
    return globalThis._mongoClientPromise;
  }
  globalThis._mongoClientUri = connectionUri;
  globalThis._mongoClientPromise = connectMongoClient(connectionUri).catch((err) => {
    globalThis._mongoClientPromise = undefined;
    globalThis._mongoClientUri = undefined;
    throw err;
  });
  return globalThis._mongoClientPromise;
}

/** Clear cached client (tests and recovery after connection failures). */
export async function resetMongoClient(): Promise<void> {
  const promise = globalThis._mongoClientPromise;
  globalThis._mongoClientPromise = undefined;
  globalThis._mongoClientUri = undefined;
  if (promise) {
    try {
      const client = await promise;
      await client.close();
    } catch {
      // ignore close errors on broken connections
    }
  }
}

export async function getDb(uri?: string): Promise<Db> {
  const client = await getMongoClient(uri);
  const dbName = process.env.MONGODB_DB_NAME ?? "content_resourcer";
  return client.db(dbName);
}

export async function closeDb(): Promise<void> {
  await resetMongoClient();
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
  await db.collection(COLLECTIONS.content_signal_templates).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { organization_id: 1, name: 1 } },
  ]);
  await db.collection(COLLECTIONS.voices).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { organization_id: 1 } },
    { key: { content_signal_ids: 1 } },
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
  await db.collection(COLLECTIONS.posts).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { signal_item_id: 1, deal_key: 1 }, unique: true },
    { key: { organization_id: 1, content_signal_id: 1, status: 1, created_at: -1 } },
  ]);
  await db.collection(COLLECTIONS.writer_articles).createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { organization_id: 1, voice_id: 1, updated_at: -1 } },
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
