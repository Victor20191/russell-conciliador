import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Logotipo blanco oficial (Manual §1.2) para el encabezado azul de los correos.
 * Viaja como adjunto en línea: el transporte SMTP no lee archivos ni direcciones
 * por su cuenta, así que el contenido se entrega ya leído.
 */
let logo: Promise<Buffer | null> | null = null;

export function logoCorreo(): Promise<Buffer | null> {
  logo ??= readFile(path.join(process.cwd(), "public", "marca", "russell-bedford-blanco-600.png")).catch(() => {
    logo = null; // se reintenta en el próximo envío
    return null;
  });
  return logo;
}
