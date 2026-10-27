import "server-only";
import nodemailer from "nodemailer";
import { z } from "zod";

export class ErrorSmtp extends Error {}
/** Imagen que el HTML cita con `cid:` (el logotipo del encabezado). */
export type ImagenEnLinea = { cid: string; nombre: string; contenido: Buffer; tipo: "image/png" };
export type MensajeSmtp = { destinatario: string; asunto: string; texto: string; html: string; imagenes?: ImagenEnLinea[] };

function transporteSmtp(config: Record<string, unknown>, credenciales: Record<string, string>) {
  const host = String(config.host ?? "").trim();
  const port = Number(config.puerto ?? 587);
  const seguridad = String(config.seguridad ?? (port === 465 ? "TLS" : "STARTTLS"));
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ErrorSmtp("Revisa el servidor SMTP y el puerto (1 a 65535).");
  }
  if (!["TLS", "STARTTLS"].includes(seguridad)) {
    throw new ErrorSmtp("Selecciona TLS o STARTTLS para proteger las credenciales.");
  }
  if (!credenciales.usuario || !credenciales.contrasena) {
    throw new ErrorSmtp("Configura el usuario y la contraseña SMTP antes de probar.");
  }
  return nodemailer.createTransport({
    host, port,
    secure: seguridad === "TLS",
    requireTLS: seguridad === "STARTTLS",
    auth: { user: credenciales.usuario, pass: credenciales.contrasena },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    logger: false, debug: false,
    disableFileAccess: true, disableUrlAccess: true,
  });
}

/** Solo mensajes propios: las respuestas SMTP pueden contener credenciales/datos. */
export function mensajeErrorSmtp(error: unknown): string {
  if (error instanceof ErrorSmtp) return error.message;
  const codigo = (error as { code?: string } | null)?.code;
  if (codigo === "EAUTH") return "El servidor rechazó el usuario o la contraseña SMTP.";
  if (codigo === "EENVELOPE") return "El servidor rechazó el remitente o el destinatario del correo.";
  return "No se pudo completar el envío o la conexión SMTP. Revisa servidor, puerto, seguridad y certificado.";
}

/** Verifica TLS y autenticación. No envía mensajes ni prueba la entrega. */
export async function verificarSmtp(config: Record<string, unknown>, credenciales: Record<string, string>) {
  let transporte: ReturnType<typeof transporteSmtp> | undefined;
  try {
    transporte = transporteSmtp(config, credenciales);
    await transporte.verify();
    return { ok: true, mensaje: "Conexión segura y autenticación SMTP correctas. No se envió ningún correo." };
  } catch (error) {
    return { ok: false, mensaje: mensajeErrorSmtp(error) };
  } finally {
    transporte?.close();
  }
}

/** Un correo por destinatario, sin revelar otras direcciones. Aceptado no significa entregado. */
export async function enviarSmtp(config: Record<string, unknown>, credenciales: Record<string, string>, mensaje: MensajeSmtp): Promise<void> {
  const remitente = String(config.remitente ?? "").trim();
  if (!z.email().safeParse(remitente).success || !z.email().safeParse(mensaje.destinatario).success) {
    throw new ErrorSmtp("Configura un remitente y un destinatario con correo válido.");
  }
  if (/[\r\n]/.test(mensaje.asunto) || mensaje.asunto.length > 200) throw new ErrorSmtp("El asunto del correo no es válido.");
  const transporte = transporteSmtp(config, credenciales);
  try {
    const resultado = await transporte.sendMail({
      from: { name: "Russell Conciliador", address: remitente },
      to: { address: mensaje.destinatario, name: "" },
      subject: mensaje.asunto, text: mensaje.texto, html: mensaje.html,
      // Contenido ya leído (el transporte no lee archivos ni direcciones por su cuenta).
      attachments: mensaje.imagenes?.map((imagen) => ({
        filename: imagen.nombre, content: imagen.contenido, contentType: imagen.tipo,
        cid: imagen.cid, contentDisposition: "inline" as const,
      })),
      headers: { "Auto-Submitted": "auto-generated" },
    });
    if (!resultado.accepted.some((correo) => correo.toLowerCase() === mensaje.destinatario.toLowerCase())) {
      throw new ErrorSmtp("El servidor SMTP no aceptó el destinatario del correo.");
    }
  } catch (error) {
    throw new ErrorSmtp(mensajeErrorSmtp(error));
  } finally {
    transporte.close();
  }
}
