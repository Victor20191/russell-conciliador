import "server-only";
import { firmarPayloadServidor, validarFirmaPayloadServidor } from "@/lib/server-payload";
import type { ResultadoAsistenciaInventario } from "../asistencia/tipos";
import { MODULOS_IMPORT } from "../descriptores";
import { normalizarSpecModulo } from "../perfil-modulo";
import type { SpecModulo } from "../extraccion/esquema";

export type LecturaMuestraInventario = Omit<ResultadoAsistenciaInventario, "usos">;
export type ContextoMuestra = { usuarioId: number; erpId: number; sha256: string };
export type EstadoMuestra = ContextoMuestra & {
  vence: number;
  lectura: LecturaMuestraInventario;
  respuestas: Record<string, string>;
  instrucciones: string;
  /** Huella del último ejemplo armado (lectura por ejemplo): el mismo ejemplo no repite IA. */
  huellaModelo?: string;
};
const CONTEXTO = "asistencia-muestra-patron-inv-v1";

/** Continuación firmada, sin guardar muestras temporales ni crear datos de un cliente. */
export function firmarAsistenciaMuestra(estado: Omit<EstadoMuestra, "vence">): string {
  const datos: EstadoMuestra = { ...estado, vence: Date.now() + 2 * 60 * 60 * 1000 };
  return JSON.stringify({ datos, firma: firmarPayloadServidor(datos, CONTEXTO) });
}

export function leerAsistenciaMuestra(crudo: unknown, contexto: ContextoMuestra): EstadoMuestra | null {
  if (crudo == null || crudo === "") return null;
  try {
    if (typeof crudo !== "string" || crudo.length > 500_000) throw new Error();
    const { datos, firma } = JSON.parse(crudo) as { datos: EstadoMuestra; firma: string };
    if (!validarFirmaPayloadServidor(datos, firma, CONTEXTO) || datos.vence < Date.now()
      || datos.usuarioId !== contexto.usuarioId || datos.erpId !== contexto.erpId || datos.sha256 !== contexto.sha256) throw new Error();
    return datos;
  } catch {
    throw new Error("La revisión ya no corresponde a esta muestra, aplicativo o sesión. Vuelve a analizar el archivo.");
  }
}

export function asistenciaCoincideConSpec(estado: EstadoMuestra, spec: SpecModulo): boolean {
  return !!estado.lectura.listoParaBorrador && !!estado.lectura.spec
    && firmarPayloadServidor(normalizarSpecModulo(MODULOS_IMPORT.INV, estado.lectura.spec), CONTEXTO)
      === firmarPayloadServidor(normalizarSpecModulo(MODULOS_IMPORT.INV, spec), CONTEXTO);
}
