import "server-only";
import nodemailer from "nodemailer";

/** Verifica TLS y autenticación. No envía mensajes ni prueba la entrega. */
export async function verificarSmtp(
  config: Record<string, unknown>,
  credenciales: Record<string, string>,
): Promise<{ ok: boolean; mensaje: string }> {
  const host = String(config.host ?? "").trim();
  const port = Number(config.puerto ?? 587);
  const seguridad = String(config.seguridad ?? (port === 465 ? "TLS" : "STARTTLS"));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, mensaje: "Revisa el servidor SMTP y el puerto (1 a 65535)." };
  }
  if (!["TLS", "STARTTLS"].includes(seguridad)) {
    return { ok: false, mensaje: "Selecciona TLS o STARTTLS para proteger las credenciales." };
  }
  if (!credenciales.usuario || !credenciales.contrasena) {
    return { ok: false, mensaje: "Configura el usuario y la contraseña SMTP antes de probar." };
  }
  const transporte = nodemailer.createTransport({
    host,
    port,
    secure: seguridad === "TLS",
    requireTLS: seguridad === "STARTTLS",
    auth: { user: credenciales.usuario, pass: credenciales.contrasena },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    logger: false,
    debug: false,
  });
  try {
    await transporte.verify();
    return { ok: true, mensaje: "Conexión segura y autenticación SMTP correctas. No se envió ningún correo." };
  } catch (error) {
    const codigo = (error as { code?: string })?.code;
    return {
      ok: false,
      mensaje: codigo === "EAUTH"
        ? "El servidor rechazó el usuario o la contraseña SMTP."
        : "No se pudo verificar SMTP. Revisa servidor, puerto, seguridad y certificado.",
    };
  } finally {
    transporte.close();
  }
}
