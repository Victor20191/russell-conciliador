import "server-only";
import crypto from "node:crypto";
import { createConnection } from "node:net";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { proveedorPorClave, type EstrategiaPrueba } from "@/lib/conexiones/tipos";

// ============================================================
// Pruebas y ejecuciones de una conexión.
//
// `probarConexion` valida que el destino responde y que las credenciales
// alcanzan para lo que la plataforma necesita; `ejecutarConexion` hace la
// operación real de la conexión. Hoy solo ALMACENAMIENTO tiene ejecutor
// automático (el pipeline de archivos vive de esos buckets); las demás
// categorías responden «omitida» hasta que exista su integración server-side.
//
// Todo falla CERRADO: cualquier error de red, credenciales o catálogo se
// traduce a un mensaje en español y estado de error, nunca a una excepción
// que rompa la Server Action.
// ============================================================

export type EstadoResultado = "ok" | "error" | "omitida";

export type ResultadoConexion = {
  ok: boolean;
  estado: EstadoResultado;
  mensaje: string;
  duracionMs: number;
};

export type DatosConexion = {
  proveedor: string;
  configuracion: Record<string, unknown>;
  credenciales: Record<string, string>;
};

export const TIMEOUT_CONEXION_MS = 10_000;

// ----- Normalización de la configuración persistida -----

function texto(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number") return String(valor);
  return "";
}

function booleano(valor: unknown): boolean {
  return valor === true || valor === "true";
}

function numero(valor: unknown, porDefecto: number): number {
  const n = typeof valor === "number" ? valor : Number.parseInt(String(valor ?? ""), 10);
  return Number.isFinite(n) ? n : porDefecto;
}

/** Concatena la URL base con la ruta sin duplicar ni perder la barra. */
export function unirUrl(base: string, ruta?: string | null): string {
  const limpiaBase = base.trim().replace(/\/+$/, "");
  const limpiaRuta = (ruta ?? "").trim();
  if (!limpiaRuta) return limpiaBase;
  return `${limpiaBase}/${limpiaRuta.replace(/^\/+/, "")}`;
}

/** Traduce el estado HTTP de una API a un resultado de la prueba. */
export function interpretarEstadoHttp(
  status: number,
  destino: string,
): { ok: boolean; mensaje: string } {
  if (status >= 200 && status < 400) return { ok: true, mensaje: `La API respondió ${status}.` };
  if (status === 401 || status === 403) {
    return { ok: false, mensaje: `La API respondió ${status}: las credenciales fueron rechazadas.` };
  }
  if (status === 404) {
    return {
      ok: false,
      mensaje: `La API respondió 404: ${destino} no existe o la ruta de prueba no es válida.`,
    };
  }
  if (status === 429) {
    return { ok: false, mensaje: "La API respondió 429: se alcanzó el límite de peticiones." };
  }
  if (status >= 500) {
    return { ok: false, mensaje: `La API respondió ${status}: error del servidor remoto.` };
  }
  return { ok: false, mensaje: `La API respondió ${status}.` };
}

/** Traduce errores de red/DNS/TLS a un mensaje claro en español. */
export function mensajeErrorRed(e: unknown): string {
  const detalle = e instanceof Error ? e.message : String(e);
  const codigo = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: unknown }).code ?? "") : "";
  if (codigo === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/i.test(detalle)) {
    return "No se pudo resolver el nombre del servidor (revisa el host o la URL).";
  }
  if (codigo === "ECONNREFUSED" || /ECONNREFUSED/i.test(detalle)) {
    return "El servidor rechazó la conexión (puerto cerrado o servicio apagado).";
  }
  if (codigo === "ETIMEDOUT" || /ETIMEDOUT|timeout|timed out/i.test(detalle)) {
    return "La conexión tardó demasiado y se canceló.";
  }
  if (/certificate|self.signed|SSL|TLS/i.test(detalle)) {
    return "Falló la validación del certificado TLS del servidor.";
  }
  return "No se pudo conectar con el servidor.";
}

/** Traduce un error del SDK de S3 a un mensaje claro en español. */
export function mensajeErrorS3(e: unknown, bucket: string): string {
  const status =
    typeof e === "object" && e !== null && "$metadata" in e
      ? (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
  const nombre = typeof e === "object" && e !== null && "name" in e ? String((e as { name?: unknown }).name ?? "") : "";
  if (status === 403) {
    return "El bucket respondió, pero las credenciales no tienen permisos (403).";
  }
  if (status === 404 || nombre === "NoSuchBucket" || nombre === "NotFound") {
    return `El bucket «${bucket}» no existe o el endpoint no lo encuentra.`;
  }
  if (status === 301 || /PermanentRedirect|AuthorizationHeaderMalformed/i.test(nombre)) {
    return "La región configurada no corresponde al bucket.";
  }
  return mensajeErrorRed(e);
}

function conDuracion(mensaje: string, duracionMs: number): string {
  const base = mensaje.trim().replace(/\.+$/, "");
  return `${base} en ${duracionMs} ms.`;
}

// ----- Almacenamiento (S3 / R2 / MinIO) -----

function clienteS3(config: Record<string, unknown>, cred: Record<string, string>): S3Client {
  return new S3Client({
    region: texto(config.region) || "us-east-1",
    endpoint: texto(config.endpoint) || undefined,
    forcePathStyle: booleano(config.force_path_style),
    credentials: {
      accessKeyId: texto(cred.access_key_id),
      secretAccessKey: texto(cred.secret_access_key),
    },
  });
}

async function probarS3(
  config: Record<string, unknown>,
  cred: Record<string, string>,
): Promise<{ ok: boolean; mensaje: string }> {
  const bucket = texto(config.bucket);
  const cliente = clienteS3(config, cred);
  const clave = `_pruebas-conexion/${crypto.randomUUID()}.txt`;
  try {
    // Escritura + lectura reales: es exactamente lo que necesita el pipeline
    // de soportes, y no depende de permisos de listado (s3:ListBucket).
    await cliente.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: clave,
        Body: "Prueba de conexión de Russell LFM",
        ContentType: "text/plain",
      }),
    );
    await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
    return { ok: true, mensaje: `Bucket «${bucket}» con escritura y lectura verificadas.` };
  } catch (e) {
    return { ok: false, mensaje: mensajeErrorS3(e, bucket) };
  } finally {
    try {
      await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: clave }));
    } catch {
      // Limpieza best-effort: si el objeto nunca se creó, no hay nada que borrar.
    }
    cliente.destroy();
  }
}

async function ejecutarAlmacenamiento(
  config: Record<string, unknown>,
  cred: Record<string, string>,
): Promise<{ ok: boolean; mensaje: string }> {
  const bucket = texto(config.bucket);
  const cliente = clienteS3(config, cred);
  try {
    await cliente.send(new HeadBucketCommand({ Bucket: bucket }));
    const lista = await cliente.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 10 }));
    const cantidad = lista.KeyCount ?? lista.Contents?.length ?? 0;
    return { ok: true, mensaje: `Bucket «${bucket}» operativo: ${cantidad} objeto(s) visibles.` };
  } catch (e) {
    const status =
      typeof e === "object" && e !== null && "$metadata" in e
        ? (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    // Sin permiso de listado (403) la verificación de escritura/lectura sigue
    // siendo válida: el pipeline de soportes no lista el bucket.
    if (status === 403) return probarS3(config, cred);
    return { ok: false, mensaje: mensajeErrorS3(e, bucket) };
  } finally {
    cliente.destroy();
  }
}

// ----- Correo -----

/** Espera el banner (220) de un servidor SMTP. Exportada para pruebas. */
export function bannerSmtp(
  host: string,
  puerto: number,
  timeoutMs: number = TIMEOUT_CONEXION_MS,
): Promise<{ ok: boolean; mensaje: string }> {
  return new Promise((resolver) => {
    const socket = createConnection({ host, port: puerto });
    let terminado = false;
    const finalizar = (resultado: { ok: boolean; mensaje: string }) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      resolver(resultado);
    };

    socket.setTimeout(timeoutMs);
    socket.once("data", (datos) => {
      const banner = datos.toString("utf8").trim();
      if (/^220/.test(banner)) {
        finalizar({ ok: true, mensaje: `El servidor SMTP respondió (${banner.slice(0, 80)}).` });
      } else {
        finalizar({ ok: false, mensaje: `El servidor SMTP respondió algo inesperado: ${banner.slice(0, 80)}` });
      }
    });
    socket.once("timeout", () =>
      finalizar({ ok: false, mensaje: "El servidor SMTP no respondió dentro del tiempo esperado." }),
    );
    socket.once("error", (e) => finalizar({ ok: false, mensaje: mensajeErrorRed(e) }));
    socket.once("close", () =>
      finalizar({ ok: false, mensaje: "El servidor cerró la conexión sin responder." }),
    );
  });
}

async function probarSmtp(
  config: Record<string, unknown>,
): Promise<{ ok: boolean; mensaje: string }> {
  const host = texto(config.host);
  const puerto = numero(config.puerto, 587);
  return bannerSmtp(host, puerto);
}

async function probarGraph(
  config: Record<string, unknown>,
  cred: Record<string, string>,
): Promise<{ ok: boolean; mensaje: string }> {
  const tenant = texto(config.tenant_id);
  const destino = texto(config.buzon) || texto(config.remitente);
  const cuerpo = new URLSearchParams({
    client_id: texto(cred.client_id),
    client_secret: texto(cred.client_secret),
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: cuerpo,
        signal: AbortSignal.timeout(TIMEOUT_CONEXION_MS),
        cache: "no-store",
      },
    );
    if (res.ok) {
      return {
        ok: true,
        mensaje: destino
          ? `Credenciales válidas para Microsoft 365 (${destino}).`
          : "Credenciales válidas para Microsoft 365.",
      };
    }
    if (res.status === 400 || res.status === 401) {
      return {
        ok: false,
        mensaje: "Microsoft 365 rechazó las credenciales (revisa tenant, client_id y client_secret).",
      };
    }
    return { ok: false, mensaje: `Microsoft 365 respondió ${res.status}.` };
  } catch (e) {
    return { ok: false, mensaje: mensajeErrorRed(e) };
  }
}

/** Solicita un token OAuth 2.0 con client_credentials (prueba genérica). */
async function probarOAuth(
  config: Record<string, unknown>,
  cred: Record<string, string>,
): Promise<{ ok: boolean; mensaje: string }> {
  const urlToken = texto(config.url_token);
  const scope = texto(config.scope);
  const cuerpo = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: texto(cred.client_id),
    client_secret: texto(cred.client_secret),
  });
  if (scope) cuerpo.set("scope", scope);

  try {
    const res = await fetch(urlToken, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_CONEXION_MS),
      cache: "no-store",
    });
    if (res.ok) {
      return { ok: true, mensaje: "El servidor OAuth emitió un token con las credenciales configuradas." };
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return {
        ok: false,
        mensaje: "El servidor OAuth rechazó las credenciales (revisa client_id y client_secret).",
      };
    }
    return { ok: false, mensaje: `El servidor OAuth respondió ${res.status}.` };
  } catch (e) {
    return { ok: false, mensaje: mensajeErrorRed(e) };
  }
}

// ----- API REST y webhooks -----

async function probarHttp(
  estrategia: Extract<EstrategiaPrueba, { tipo: "http" }>,
  config: Record<string, unknown>,
  cred: Record<string, string>,
): Promise<{ ok: boolean; mensaje: string }> {
  const base = texto(config.url_base);
  const ruta = texto(config.ruta_prueba) || estrategia.ruta || "";
  const destino = unirUrl(base, ruta);
  const encabezado = texto(config.encabezado_auth) || estrategia.encabezadoAuth;
  const token = texto(cred.token) || texto(cred.api_key);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers[encabezado] = estrategia.esquemaAuth === "bearer" ? `Bearer ${token}` : token;

  try {
    const res = await fetch(destino, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_CONEXION_MS),
      cache: "no-store",
    });
    return interpretarEstadoHttp(res.status, destino);
  } catch (e) {
    return { ok: false, mensaje: mensajeErrorRed(e) };
  }
}

async function probarWebhook(
  config: Record<string, unknown>,
  cred: Record<string, string>,
): Promise<{ ok: boolean; mensaje: string }> {
  const url = texto(config.url);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secreto = texto(cred.secreto);
  if (secreto) headers["X-Webhook-Secret"] = secreto;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        evento: "prueba.conexion",
        plataforma: "Russell LFM",
        fecha: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(TIMEOUT_CONEXION_MS),
      cache: "no-store",
    });
    if (res.ok) return { ok: true, mensaje: `El webhook respondió ${res.status}.` };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, mensaje: `El webhook respondió ${res.status}: el secreto fue rechazado.` };
    }
    if (res.status === 410) {
      return { ok: false, mensaje: "El webhook respondió 410: la suscripción ya no está activa." };
    }
    return { ok: false, mensaje: `El webhook respondió ${res.status}.` };
  } catch (e) {
    return { ok: false, mensaje: mensajeErrorRed(e) };
  }
}

// ----- Fachada -----

async function ejecutarSegunProveedor(
  datos: DatosConexion,
): Promise<{ ok: boolean; mensaje: string }> {
  const proveedor = proveedorPorClave(datos.proveedor);
  if (!proveedor) {
    return { ok: false, mensaje: "El proveedor de la conexión ya no está en el catálogo." };
  }
  const config = datos.configuracion ?? {};
  const cred = datos.credenciales ?? {};
  switch (proveedor.prueba.tipo) {
    case "s3":
      return probarS3(config, cred);
    case "smtp":
      return probarSmtp(config);
    case "graph":
      return probarGraph(config, cred);
    case "oauth":
      return probarOAuth(config, cred);
    case "http":
      return probarHttp(proveedor.prueba, config, cred);
    case "webhook":
      return probarWebhook(config, cred);
  }
}

/** Verifica la conexión y devuelve un resultado listo para persistir. */
export async function probarConexion(datos: DatosConexion): Promise<ResultadoConexion> {
  const inicio = Date.now();
  const resultado = await ejecutarSegunProveedor(datos);
  const duracionMs = Date.now() - inicio;
  return {
    ok: resultado.ok,
    estado: resultado.ok ? "ok" : "error",
    mensaje: conDuracion(resultado.mensaje, duracionMs),
    duracionMs,
  };
}

/**
 * Ejecuta la operación real de la conexión. Solo ALMACENAMIENTO tiene
 * ejecutor propio; el resto devuelve «omitida» sin tocar el destino.
 */
export async function ejecutarConexion(datos: DatosConexion): Promise<ResultadoConexion> {
  const proveedor = proveedorPorClave(datos.proveedor);
  if (!proveedor) {
    return {
      ok: false,
      estado: "error",
      mensaje: "El proveedor de la conexión ya no está en el catálogo.",
      duracionMs: 0,
    };
  }
  if (!proveedor.ejecutable) {
    return {
      ok: false,
      estado: "omitida",
      mensaje:
        "Esta conexión todavía no tiene una ejecución automática en la plataforma; usa «Probar» para validar sus credenciales.",
      duracionMs: 0,
    };
  }

  const inicio = Date.now();
  const resultado = await ejecutarAlmacenamiento(datos.configuracion ?? {}, datos.credenciales ?? {});
  const duracionMs = Date.now() - inicio;
  return {
    ok: resultado.ok,
    estado: resultado.ok ? "ok" : "error",
    mensaje: conDuracion(resultado.mensaje, duracionMs),
    duracionMs,
  };
}
