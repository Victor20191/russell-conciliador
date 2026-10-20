import "server-only";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import type { ConexionIntegracion } from "@/generated/prisma/client";
import { descifrarCredenciales } from "@/lib/conexiones/credenciales";
import { enviarSmtp, ErrorSmtp, mensajeErrorSmtp } from "@/lib/conexiones/smtp";
import { mensajeNotificacion, ErrorPlantillaNotificacion } from "./plantilla-notificacion";
import { destinatariosAviso, type AlcanceAviso } from "./destinatarios";

export type AvisoCorreo = AlcanceAviso & { titulo: string; texto: string; ruta?: string; entidad?: { tipo: string; id: number }; referencia: string };
export type ResultadoCorreo = { ok: boolean; message: string };

export async function conexionNotificaciones(): Promise<ConexionIntegracion | null> {
  const conexiones = await prisma.conexionIntegracion.findMany({
    where: { categoria: "CORREO", proveedor: { in: ["smtp", "gmail"] }, activa: true, entorno: "PRODUCCION",
      configuracion: { path: ["usar_para_notificaciones"], equals: true } },
    take: 2,
  });
  if (conexiones.length > 1) throw new ErrorSmtp("Hay varios SMTP seleccionados. Deja solo una conexión para notificaciones.");
  return conexiones[0] ?? null;
}

/** No devuelve secretos ni errores originales de SMTP o de descifrado. */
export async function enviarCorreoRegistrado(
  conexion: ConexionIntegracion,
  destinatarios: string[],
  aviso: Pick<AvisoCorreo, "titulo" | "texto" | "ruta" | "referencia">,
  actor = "Sistema",
): Promise<ResultadoCorreo> {
  const inicio = Date.now();
  let aceptados = 0;
  let fallidos = 0;
  let detalle = "";
  try {
    if (!conexion.activa || !["smtp", "gmail"].includes(conexion.proveedor)) throw new ErrorSmtp("Activa una conexión SMTP o Gmail antes de enviar.");
    const config = (conexion.configuracion ?? {}) as Record<string, unknown>;
    const credenciales = descifrarCredenciales(conexion.credenciales);
    const mensaje = mensajeNotificacion({ titulo: aviso.titulo, texto: aviso.texto, ruta: aviso.ruta, urlPlataforma: config.url_plataforma });
    for (const destinatario of [...new Set(destinatarios)]) {
      try {
        await enviarSmtp(config, credenciales, { ...mensaje, destinatario });
        aceptados++;
      } catch (error) {
        fallidos++;
        detalle = mensajeErrorSmtp(error);
      }
    }
  } catch (error) {
    fallidos = Math.max(1, destinatarios.length - aceptados);
    detalle = error instanceof ErrorPlantillaNotificacion ? error.message : mensajeErrorSmtp(error);
  }
  const ok = aceptados > 0 && fallidos === 0;
  const message = `${aceptados} correo(s) aceptado(s) por SMTP${fallidos ? `; ${fallidos} con error. ${detalle}` : ". La aceptación no confirma la llegada a la bandeja."}`;
  try {
    await prisma.$transaction([
      prisma.conexionIntegracion.update({ where: { id: conexion.id }, data: {
        ultimoUsoEn: new Date(), ultimaEjecucionEstado: ok ? "ok" : "error", ultimaEjecucionMensaje: message,
      } }),
      prisma.ejecucionConexion.create({ data: {
        conexionId: conexion.id, tipo: "ENVIO_CORREO", estado: ok ? "ok" : "error",
        mensaje: `${aviso.referencia} · ${message}`, duracionMs: Date.now() - inicio, ejecutadoPor: actor,
      } }),
    ]);
  } catch {
    // No repetir un envío aceptado si solo falló su registro.
    console.error("[Russell] No se pudo registrar el resultado del correo", { conexionId: conexion.id });
    return { ok, message: `${message} No se pudo guardar el resultado en el historial; no repitas el envío sin comprobar tu correo.` };
  }
  return { ok, message };
}

/** Se llama después de persistir el evento; todos los destinatarios se resuelven en servidor. */
export async function enviarAvisoCorreo(aviso: AvisoCorreo): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  try {
    const conexion = await conexionNotificaciones();
    if (!conexion) return; // El correo es opt-in, no selecciona una cuenta implícitamente.
    // La conversación del borrador es legible por rol, pero su página exige
    // permiso de carga y escritura sobre el cliente. No mandar enlaces inaccesibles.
    const destinatarios = await destinatariosAviso(aviso.entidad?.tipo === "modulos_borrador"
      ? { ...aviso, permisoRuta: "modulos_datos:crear", modoAlcance: "escritura" }
      : aviso);
    if (!destinatarios.length) return;
    if (aviso.entidad) {
      const { tipo, id } = aviso.entidad;
      if (tipo === "modulos_borrador") {
        // La conversación usa el id numérico; la página del borrador usa el UUID loteId.
        const registro = await prisma.moduloImportacionLote.findUnique({ where: { id }, select: { moduloCodigo: true, loteId: true } });
        if (!registro) return;
        aviso = { ...aviso, ruta: `/modulos/${encodeURIComponent(registro.moduloCodigo)}/borradores/${encodeURIComponent(registro.loteId)}` };
      } else if (tipo === "modulos_datos") {
        const registro = await prisma.moduloDatoEncabezado.findUnique({ where: { id }, select: { moduloCodigo: true } });
        if (!registro) return;
        aviso = { ...aviso, ruta: `/modulos/${encodeURIComponent(registro.moduloCodigo)}/${id}` };
      } else {
        const rutas: Record<string, string> = { balance: `/balance/${id}`, conciliaciones: `/conciliacion/resultados/${id}`, dian: `/dian/${id}`, clientes: "/config/clientes" };
        aviso = { ...aviso, ruta: rutas[tipo] ?? "/dashboard" };
      }
    }
    await enviarCorreoRegistrado(conexion, destinatarios, aviso);
  } catch {
    console.error("[Russell] No se pudo preparar la notificación por correo", { referencia: aviso.referencia });
  }
}

/** after mantiene vivo el envío después de la respuesta; nunca se deja una promesa suelta. */
export function programarAvisoCorreo(aviso: AvisoCorreo): void {
  if (process.env.NODE_ENV !== "production") return;
  try {
    after(() => enviarAvisoCorreo(aviso));
  } catch {
    console.error("[Russell] No se pudo programar el correo", { referencia: aviso.referencia });
  }
}
