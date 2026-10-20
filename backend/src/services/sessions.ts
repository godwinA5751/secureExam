import { RevokedToken } from "../models/RevokedToken";

/** Tokens issued before revocation existed carry no id; they simply expire on schedule. */
export async function isRevoked(jti?: string): Promise<boolean> {
  if (!jti) return false;
  return (await RevokedToken.exists({ jti })) !== null;
}

export async function revokeToken(payload: { jti?: string; exp?: number }): Promise<void> {
  if (!payload.jti || !payload.exp) return;
  try {
    await RevokedToken.updateOne(
      { jti: payload.jti },
      { $setOnInsert: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) } },
      { upsert: true }
    );
  } catch (e: any) {
    if (e?.code !== 11000) throw e; // two logouts racing: the token is already revoked, fine
  }
}