import { Schema, model } from "mongoose";

const LoginThrottleSchema = new Schema({
  testId: { type: Schema.Types.ObjectId, ref: "Test", required: true },
  idNumber: { type: String, required: true },
  failedAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  expireAt: { type: Date, required: true }, // TTL: Mongo deletes old rows itself
});

LoginThrottleSchema.index({ testId: 1, idNumber: 1 }, { unique: true });
LoginThrottleSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const LoginThrottle = model("LoginThrottle", LoginThrottleSchema);