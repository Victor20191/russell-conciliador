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
};

type CuentaCatalogo = Omit<CuentaPucCliente, "level" | "enMemoria">;

export function consolidarPucCliente(
  memoria: readonly CuentaCatalogo[],
  historicas: readonly CuentaCatalogo[],
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
  return [...cuentas.values()].sort((a, b) => a.code.localeCompare(b.code));
}
