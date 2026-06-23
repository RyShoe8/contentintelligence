import { getDb, withDbRetry, type Db } from "@content-resourcer/db";

export async function connectMongo() {
  return getDb(process.env.MONGODB_URI);
}

export async function withMongo<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return withDbRetry(fn, process.env.MONGODB_URI);
}
