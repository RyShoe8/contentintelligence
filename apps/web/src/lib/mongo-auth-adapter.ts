import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set");
}

declare global {
  // eslint-disable-next-line no-var -- HMR singleton
  var _mongoAuthClientPromise: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  const client = new MongoClient(uri);
  return client.connect();
}

const clientPromise = globalThis._mongoAuthClientPromise ?? connect();
if (process.env.NODE_ENV !== "production") {
  globalThis._mongoAuthClientPromise = clientPromise;
}

export default clientPromise;
