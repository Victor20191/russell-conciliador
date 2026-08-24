import crypto from "crypto";

const ENCRYPTION_KEY = process.env.MASTER_ENCRYPTION_KEY || ""; // Debe ser 32 bytes
const ALGORITHM = "aes-256-gcm";

export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) return text; // Fallback inseguro
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
  if (!ENCRYPTION_KEY || !text.includes(':')) return text;
  const [ivHex, authTagHex, encryptedHex] = text.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
