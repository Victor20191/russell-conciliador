import "server-only";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

export function cifradoDisponible(): boolean {
  return Buffer.byteLength(process.env.MASTER_ENCRYPTION_KEY ?? "", "utf8") === 32;
}

function claveCifrado(): Buffer {
  if (!cifradoDisponible()) {
    throw new Error("Configura MASTER_ENCRYPTION_KEY con exactamente 32 bytes para guardar credenciales de forma segura.");
  }
  return Buffer.from(process.env.MASTER_ENCRYPTION_KEY!, "utf8");
}

export function encrypt(text: string): string {
  const key = claveCifrado();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
  // Compatibilidad de lectura con registros antiguos; las escrituras siempre cifran.
  const payload = text.startsWith("v1:") ? text.slice(3) : text;
  if (!/^[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]*$/i.test(payload)) {
    if (text.startsWith("v1:")) throw new Error("Credencial cifrada inválida.");
    return text;
  }
  const [ivHex, authTagHex, encryptedHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, claveCifrado(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
