import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Vigilante del correo de Russell. Por decisión del usuario, la plataforma solo envía
 * correo para el reporte para gerencia (manual y programado) y para la prueba de envío
 * de la conexión SMTP en `/config/conexiones`. NO hay avisos por eventos: ni de balances,
 * ni de menciones en comentarios, ni de tickets de soporte (esos viven en la campana).
 *
 * Si esta prueba falla, un archivo nuevo está enviando correo. No amplíes la lista:
 * quita ese envío. Solo se amplía si el usuario pidió expresamente otro correo.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");

/** Los únicos archivos que pueden usar las funciones de envío (rutas desde la raíz del repo). */
const PERMITIDOS = new Map<string, string>([
  ["src/lib/conexiones/smtp.ts", "el módulo SMTP: define `enviarSmtp` y es el único que importa nodemailer"],
  ["src/lib/correo/notificaciones.ts", "el módulo de correo: envía y registra el resultado en la conexión"],
  ["src/lib/notificaciones/reporte-ejecutivo-servidor.ts", "el reporte para gerencia (manual y programado)"],
  ["src/app/actions/conexiones.ts", "la prueba de envío de la conexión SMTP en /config/conexiones"],
]);

/** Funciones y paquetes con los que sale un correo, más el módulo que los reúne. */
const ENVIO = /\b(?:enviarSmtp|enviarCorreoRegistrado|enviarHtmlRegistrado|programarAvisoCorreo|enviarAvisoCorreo|nodemailer)\b|@\/lib\/correo\/notificaciones/;

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre !== "generated" && nombre !== "node_modules") archivos(ruta, salida);
    } else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** Las líneas de código (sin comentarios de línea ni de bloque) donde aparece un envío. */
function lineasDeEnvio(texto: string): number[] {
  const salida: number[] = [];
  texto.split("\n").forEach((linea, i) => {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(linea)) return;
    if (ENVIO.test(linea)) salida.push(i + 1);
  });
  return salida;
}

describe("el correo es solo para el reporte para gerencia", () => {
  it("el detector reconoce los envíos y respeta los comentarios", () => {
    expect(lineasDeEnvio('await enviarSmtp(config, credenciales, mensaje);')).toEqual([1]);
    expect(lineasDeEnvio('import { enviarHtmlRegistrado } from "@/lib/correo/notificaciones";')).toEqual([1]);
    expect(lineasDeEnvio('const { enviarCorreoRegistrado } = await import("@/lib/correo/notificaciones");')).toEqual([1]);
    expect(lineasDeEnvio('import nodemailer from "nodemailer";')).toEqual([1]);
    expect(lineasDeEnvio("programarAvisoCorreo({ titulo });")).toEqual([1]);
    expect(lineasDeEnvio("// enviarCorreoRegistrado\n * enviarSmtp\nconst x = 1;")).toEqual([]);
  });

  it("la lista permitida apunta a archivos que existen", () => {
    for (const ruta of PERMITIDOS.keys()) expect(existsSync(path.join(RAIZ, ruta)), ruta).toBe(true);
  });

  it("ningún otro archivo de src/ envía correo", () => {
    const fuera: string[] = [];
    for (const archivo of archivos(SRC)) {
      const ruta = path.relative(RAIZ, archivo).split(path.sep).join("/");
      if (PERMITIDOS.has(ruta)) continue;
      for (const linea of lineasDeEnvio(readFileSync(archivo, "utf8"))) fuera.push(`${ruta}:${linea}`);
    }
    expect(
      fuera,
      "Russell solo envía correo para el reporte para gerencia (decisión del usuario): no hay avisos por correo de "
        + "balances, menciones ni soporte. Quita el envío de estos archivos (las novedades van a la campana): "
        + fuera.join(", "),
    ).toEqual([]);
  });

  it("los envíos permitidos siguen siendo los previstos", () => {
    // El reporte para gerencia envía con `enviarHtmlRegistrado`; la prueba de la conexión, con `enviarCorreoRegistrado`.
    const texto = (ruta: string) => readFileSync(path.join(RAIZ, ruta), "utf8");
    expect(texto("src/lib/notificaciones/reporte-ejecutivo-servidor.ts")).toContain("enviarHtmlRegistrado");
    expect(texto("src/app/actions/conexiones.ts")).toContain("enviarCorreoRegistrado");
  });
});
