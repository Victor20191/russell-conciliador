import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Almacenamiento privado y aislado para evidencias de tickets. Comparte el
// endpoint/región del proveedor S3 configurado, pero usa bucket y credenciales
// propias para que las capturas no tengan acceso al bucket de avatares.
//
// Variables de entorno:
//   S3_TICKETS_BUCKET
//   S3_TICKETS_ACCESS_KEY_ID
//   S3_TICKETS_SECRET_ACCESS_KEY
//   S3_REGION             (compartida; R2 usa "auto")
//   S3_ENDPOINT           (compartida; requerida para R2/MinIO)
//   S3_FORCE_PATH_STYLE   (compartida; opcional para MinIO)

const BUCKET = process.env.S3_TICKETS_BUCKET ?? "";
const REGION = process.env.S3_REGION ?? "us-east-1";
const ACCESS_KEY = process.env.S3_TICKETS_ACCESS_KEY_ID ?? "";
const SECRET_KEY = process.env.S3_TICKETS_SECRET_ACCESS_KEY ?? "";
const ENDPOINT = process.env.S3_ENDPOINT || undefined;
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

export function almacenamientoEvidenciasTicketsDisponible(): boolean {
  return Boolean(BUCKET && ACCESS_KEY && SECRET_KEY);
}

let cliente: S3Client | null = null;

function getCliente(): S3Client {
  if (!almacenamientoEvidenciasTicketsDisponible()) {
    throw new Error(
      "El almacenamiento de evidencias no está configurado. Define S3_TICKETS_BUCKET, S3_TICKETS_ACCESS_KEY_ID y S3_TICKETS_SECRET_ACCESS_KEY.",
    );
  }
  if (!cliente) {
    cliente = new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      forcePathStyle: FORCE_PATH_STYLE,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    });
  }
  return cliente;
}

export async function subirEvidenciaTicket(args: {
  key: string;
  cuerpo: Uint8Array | Buffer;
  contentType: string;
}): Promise<void> {
  await getCliente().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: args.key,
      Body: args.cuerpo,
      ContentType: args.contentType,
    }),
  );
}

export type EvidenciaTicketDescargada = {
  cuerpo: Uint8Array;
  contentType: string;
};

export async function obtenerEvidenciaTicket(
  key: string,
): Promise<EvidenciaTicketDescargada | null> {
  try {
    const res = await getCliente().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    if (!res.Body) return null;
    const cuerpo = await res.Body.transformToByteArray();
    return {
      cuerpo,
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch (e) {
    if (esNoSuchKey(e)) return null;
    throw e;
  }
}

export async function eliminarEvidenciaTicket(key: string): Promise<void> {
  try {
    await getCliente().send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
    );
  } catch (e) {
    if (esNoSuchKey(e)) return;
    throw e;
  }
}

function esNoSuchKey(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const nombre = (e as { name?: string; Code?: string }).name;
  const code = (e as { Code?: string }).Code;
  const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;
  return nombre === "NoSuchKey" || code === "NoSuchKey" || status === 404;
}
