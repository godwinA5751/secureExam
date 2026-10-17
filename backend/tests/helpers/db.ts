import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Pinned so everyone downloads the same (smaller) build once, and it stays cached.
export const MONGO_VERSION = "7.0.14";

let server: MongoMemoryServer | undefined;

export async function startDb() {
  server = await MongoMemoryServer.create({ binary: { version: MONGO_VERSION } });
  await mongoose.connect(server.getUri(), { dbName: "secureexam_test" });
  // Make sure unique and partial indexes exist before any test runs.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

export async function clearDb() {
  const cols = await mongoose.connection.db!.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
}

export async function stopDb() {
  await mongoose.disconnect();
  await server?.stop();
}