import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Pinned so everyone downloads the same build once.
export const MONGO_VERSION = "7.0.14";

let server: MongoMemoryReplSet | undefined;

export async function startDb() {
  server = await MongoMemoryReplSet.create({
    binary: { version: MONGO_VERSION },
    replSet: {
      count: 1,
      storageEngine: "wiredTiger",
    },
    instanceOpts: [
      {
        launchTimeout: 60_000,
      },
    ],
  });

  await mongoose.connect(server.getUri(), {
    dbName: "secureexam_test",
  });

  // Make sure unique and partial indexes exist before tests run.
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init())
  );
}

export async function clearDb() {
  const cols = await mongoose.connection.db!.collections();

  await Promise.all(cols.map((collection) => collection.deleteMany({})));
}

export async function stopDb() {
  await mongoose.disconnect();
  await server?.stop();
}