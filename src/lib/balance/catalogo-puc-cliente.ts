import type { ProcedenciaMapeo } from "./procedencia-mapeo";

/** Catálogo acumulado para consulta. La memoria manda incluso cuando está sin asignar. */
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
};

type CuentaCatalogo = Omit<CuentaPucCliente, "level" | "enMemoria">;

export function consolidarPucCliente(
  memoria: readonly CuentaCatalogo[],
  historicas: readonly CuentaCatalogo[],
  originales: readonly CuentaCatalogo[] = [],
): CuentaPucCliente[] {
  const cuentas = new Map<string, CuentaPucCliente>();
  for (const cuenta of memoria) {
    if (!/^\d+$/.test(cuenta.code)) continue; // Totales y rótulos legados no son cuentas.
    cuentas.set(cuenta.code, { ...cuenta, level: cuenta.code.length, enMemoria: true });
  }
  // Las históricas llegan en orden de carga descendente, una por código. Nunca
  // reactivan una regla que el usuario haya retirado de la memoria.
  for (const cuenta of historicas) {
    if (!/^\d+$/.test(cuenta.code)) continue;
    if (!cuentas.has(cuenta.code)) {
      cuentas.set(cuenta.code, { ...cuenta, id: -cuenta.id, level: cuenta.code.length, enMemoria: false });
    }
  }
  for (const cuenta of originales) {
    if (!/^\d{4,30}$/.test(cuenta.code)) continue;
    const existente = cuentas.get(cuenta.code);
    if (!existente) cuentas.set(cuenta.code, { ...cuenta, id: -Math.abs(cuenta.id), level: cuenta.code.length, enMemoria: false });
    else if ((!existente.name || existente.name === existente.code) && cuenta.name !== cuenta.code) existente.name = cuenta.name;
  }
  return [...cuentas.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Recupera la estructura que no se conservaba en cargues antiguos. Estas filas
 * se identifican como agrupadoras reconstruidas, sin inventar nombres ni reglas. */
export function completarJerarquiaCliente(catalogo: readonly CuentaPucCliente[]): CuentaPucCliente[] {
  const cuentas = new Map(catalogo.map((c) => [c.code, c]));
  for (const cuenta of catalogo) {
    for (let nivel = 4; nivel < cuenta.code.length; nivel += 2) {
      const code = cuenta.code.slice(0, nivel);
      if (!cuentas.has(code)) cuentas.set(code, {
        id: 0, code, name: `Agrupadora ${code}`, level: nivel, cuenta6Russell: null,
        coincidencia: null, origenMapeo: null, actualizadoPor: null, actualizadoEn: null,
        enMemoria: false, derivada: true,
      });
    }
  }
  return [...cuentas.values()].sort((a, b) => a.code.localeCompare(b.code));
}
