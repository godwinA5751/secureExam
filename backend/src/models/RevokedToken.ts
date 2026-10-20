import { Schema, model } from "mongoose";

const RevokedTokenSchema = new Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB deletes each row automatically once the token would have expired anyway.
RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedToken = model("RevokedToken", RevokedTokenSchema);