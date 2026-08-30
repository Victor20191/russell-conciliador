import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Almacenamiento de objetos para binarios que NO deben vivir en la base de
// datos (fotos de perfil, originales de módulos y soportes de auditoría). Compatible con S3, MinIO y Cloudflare R2: el
// `endpoint` y `forcePathStyle` opcionales permiten apuntar a un MinIO/R2
// propio en lugar de AWS. La BD solo guarda la `key` del objeto.
//
// Variables de entorno:
//   S3_BUCKET             (obligatoria) nombre del bucket
//   S3_REGION             región (por defecto us-east-1; R2 usa "auto")
//   S3_ACCESS_KEY_ID      (obligatoria)
//   S3_SECRET_ACCESS_KEY  (obligatoria)
//   S3_ENDPOINT           (opcional) URL del endpoint para MinIO/R2
//   S3_FORCE_PATH_STYLE   (opcional) "true" para MinIO (bucket en la ruta)

const BUCKET = process.env.S3_BUCKET ?? "";
const REGION = process.env.S3_REGION ?? "us-east-1";
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID ?? "";
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "";
const ENDPOINT = process.env.S3_ENDPOINT || undefined;
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

/** ¿Está configurado el almacenamiento de objetos? Decide UI/fallback sin lanzar. */
export function almacenamientoDisponible(): boolean {
  return Boolean(BUCKET && ACCESS_KEY && SECRET_KEY);
}

let cliente: S3Client | null = null;
function getCliente(): S3Client {
  if (!almacenamientoDisponible()) {
    throw new Error(
      "Almacenamiento de objetos no configurado. Define S3_BUCKET, S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY (y, para MinIO/R2, S3_ENDPOINT).",
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

export async function subirObjeto(args: {
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

export type ObjetoDescargado = { cuerpo: Uint8Array; contentType: string };

/** Descarga un objeto completo en memoria. Devuelve null si no existe. */
export async function obtenerObjeto(key: string): Promise<ObjetoDescargado | null> {
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
    // Objeto inexistente: tratamos como "sin foto" (no es un error de servidor).
    if (esNoSuchKey(e)) return null;
    throw e;
  }
}

export async function eliminarObjeto(key: string): Promise<void> {
  try {
    await getCliente().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (e) {
    if (esNoSuchKey(e)) return; // ya no existe: idempotente
    throw e;
  }
}

function esNoSuchKey(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const nombre = (e as { name?: string; Code?: string }).name;
  const code = (e as { Code?: string }).Code;
  const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return nombre === "NoSuchKey" || code === "NoSuchKey" || status === 404;
}
