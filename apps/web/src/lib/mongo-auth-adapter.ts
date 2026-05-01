import { MongoClient } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is not set");
}
const uri: string = process.env.MONGODB_URI;

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
