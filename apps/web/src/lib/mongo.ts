import { getDb, withDbRetry } from "@content-resourcer/db";
import type { Db } from "mongodb";

export async function connectMongo() {
  return getDb(process.env.MONGODB_URI);
}

export async function withMongo<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return withDbRetry(fn, process.env.MONGODB_URI);
}
