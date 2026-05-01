import { getDb } from "@content-resourcer/db";

export async function connectMongo() {
  return getDb(process.env.MONGODB_URI);
}
