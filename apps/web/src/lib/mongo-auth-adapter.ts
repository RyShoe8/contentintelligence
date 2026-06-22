import { getMongoClient } from "@content-resourcer/db";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is not set");
}

export default getMongoClient(process.env.MONGODB_URI);
