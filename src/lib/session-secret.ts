const MIN_SESSION_SECRET_BYTES = 32;

let cachedSecret: string | null = null;
let cachedEncoded: Uint8Array | null = null;

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  const bytes = new TextEncoder().encode(secret ?? "");

  if (!secret || bytes.byteLength < MIN_SESSION_SECRET_BYTES) {
    throw new Error(
      `SESSION_SECRET debe estar definido y tener al menos ${MIN_SESSION_SECRET_BYTES} bytes.`,
    );
  }

  cachedSecret = secret;
  cachedEncoded = bytes;
  return secret;
}

export function getEncodedSessionSecret(): Uint8Array {
  if (cachedEncoded && cachedSecret === process.env.SESSION_SECRET) return cachedEncoded;
  getSessionSecret();
  return cachedEncoded!;
}
