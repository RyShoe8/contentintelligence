import { withDbRetry, withFreshDbRetry } from "@content-resourcer/db";
import type { Db } from "mongodb";

export async function connectMongo(): Promise<Db> {
  return withDbRetry((db) => Promise.resolve(db), process.env.MONGODB_URI);
}

export async function withMongo<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return withDbRetry(fn, process.env.MONGODB_URI);
}

export async function withFreshMongo<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return withFreshDbRetry(fn, process.env.MONGODB_URI);
}
