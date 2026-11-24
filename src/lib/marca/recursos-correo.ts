import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Logotipos oficiales (Manual §1.2) como PNG para los correos. Viajan como adjunto en
 * línea (CID): el transporte SMTP no lee archivos ni direcciones por su cuenta, así que
 * el contenido se entrega ya leído, y el correo no depende de ninguna dirección pública.
 * Si el archivo no se puede leer, devuelve null y el correo sale sin logotipo; el fallo
 * no se guarda, para reintentar en el próximo envío.
 */
function cargarLogo(archivo: string): () => Promise<Buffer | null> {
  let logo: Promise<Buffer | null> | null = null;
  return () => {
    logo ??= readFile(path.join(process.cwd(), "public", "marca", archivo)).catch(() => {
      logo = null; // se reintenta en el próximo envío
      return null;
    });
    return logo;
  };
}

/** Logotipo BLANCO, para el encabezado azul de los avisos de notificación. */
export const logoCorreo = cargarLogo("russell-bedford-blanco-600.png");

/** Logotipo AZUL, el que lleva el reporte para gerencia sobre su fondo blanco. */
export const logoAzulCorreo = cargarLogo("russell-bedford-azul-600.png");
