import type { ProcedenciaMapeo } from "./procedencia-mapeo";
import { esProtegidoDeAutomatico, reglaMapeoAplicable } from "./mapeo-cliente-config";

/** Catálogo real acumulado y reglas vigentes. La memoria conserva la homologación. */
export type CuentaPucCliente = {
  id: number;
  code: string;
  name: string;
  level: number;
  cuenta6Russell: string | null;
  coincidencia: number | null;
  origenMapeo: string | null;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
  enMemoria: boolean;
  procedencia?: ProcedenciaMapeo | null;
  balanceDisponible?: boolean;
  derivada?: boolean;
  tipoFila?: "movimiento" | "agrupadora" | null;
  /** Fecha de carga que respalda el tipo de fila, independiente de la edición del mapeo. */
  fechaBalance?: string | null;
};

export type CuentaCatalogo = Omit<CuentaPucCliente, "level" | "enMemoria">;

function fechaBalance(cuenta: CuentaCatalogo): number {
  const fecha = Date.parse(cuenta.fechaBalance ?? "");
  return Number.isFinite(fecha) ? fecha : 0;
}

/** Las consultas entregan una fila por código, con la carga más reciente primero. */
function porCodigo(catalogo: readonly CuentaCatalogo[]): Map<string, CuentaCatalogo> {
  const cuentas = new Map<string, CuentaCatalogo>();
  for (const cuenta of catalogo) {
    if (!/^\d+$/.test(cuenta.code)) continue;
    const anterior = cuentas.get(cuenta.code);
    if (!anterior || fechaBalance(cuenta) > fechaBalance(anterior)) cuentas.set(cuenta.code, cuenta);
  }
  return cuentas;
}

export function consolidarPucCliente(
  memoria: readonly CuentaCatalogo[],
  historicas: readonly CuentaCatalogo[],
  originales: readonly CuentaCatalogo[] = [],
): CuentaPucCliente[] {
  const guardadas = porCodigo(memoria);
  const detalles = porCodigo(historicas);
  const catalogos = porCodigo(originales.filter((cuenta) => /^\d{4,30}$/.test(cuenta.code)));
  const codigos = new Set([...guardadas.keys(), ...detalles.keys(), ...catalogos.keys()]);
  const resumenes = new Set<string>();
  const tipoPorCodigo = new Map<string, CuentaPucCliente["tipoFila"]>();

  for (const code of codigos) {
    const detalle = detalles.get(code);
    const original = catalogos.get(code);
    // Un código puede aparecer como movimiento y subtotal en el mismo archivo.
    // El detalle confirmado de esa carga prevalece; solo un catálogo posterior
    // puede demostrar que dejó de ser una imputable.
    const mandaOriginal = original?.tipoFila != null && (!detalle || fechaBalance(original) > fechaBalance(detalle));
    const tipo = mandaOriginal ? original.tipoFila : detalle ? "movimiento" : original?.tipoFila;
    tipoPorCodigo.set(code, tipo);
    // No se descartan auxiliares por terminar en cero: se exige la evidencia
    // reciente de que el código de clase con relleno representa una agrupadora.
    if (/^[1-9]0{3,}$/.test(code) && mandaOriginal && tipo === "agrupadora") resumenes.add(code);
  }

  const gruposConDescendientes = new Set<string>();
  for (const code of new Set([...detalles.keys(), ...catalogos.keys()])) {
    if (code.length > 6 && !resumenes.has(code)) gruposConDescendientes.add(code.slice(0, 6));
  }

  const cuentas: CuentaPucCliente[] = [];
  for (const code of codigos) {
    const memoriaActual = guardadas.get(code);
    const detalle = detalles.get(code);
    const original = catalogos.get(code);
    const protegida = esProtegidoDeAutomatico(memoriaActual?.origenMapeo);
    if (resumenes.has(code) && !protegida) continue;
    const grupoConRespaldo = code.length === 6 && gruposConDescendientes.has(code);
    const reglaVigente = memoriaActual && /^\d{6}$/.test(memoriaActual.cuenta6Russell ?? "") && reglaMapeoAplicable(memoriaActual);
    if (!detalle && !original && !protegida && !grupoConRespaldo && !reglaVigente) continue;

    const fuente = memoriaActual ?? detalle ?? original!;
    cuentas.push({
      ...fuente,
      id: memoriaActual ? fuente.id : -Math.abs(fuente.id),
      code,
      name: (!fuente.name || fuente.name === code) && original?.name ? original.name : fuente.name,
      level: code.length,
      enMemoria: !!memoriaActual,
      tipoFila: tipoPorCodigo.get(code) ?? (grupoConRespaldo ? "agrupadora" : null),
    });
  }
  return cuentas.sort((a, b) => a.code.localeCompare(b.code));
}
