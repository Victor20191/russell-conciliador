export type FilaMapeoCliente = {
  id?: number;
  code: string;
  cuenta6Russell: string | null;
  coincidencia: unknown;
  origenMapeo: string | null;
  actualizadoEn?: Date | string | null;
};

export type ConfigMapeoCliente = {
  std: string;
  coincidencia: number | null;
};

function instante(valor: Date | string | null | undefined): number {
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === "string") {
    const n = Date.parse(valor);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Orden canónico de una memoria por grupo de seis dígitos:
 * manual > automático; fila exacta de nivel 6 > descendiente; edición más
 * reciente > antigua; mayor coincidencia; y finalmente código/id para que nunca
 * dependa del orden que PostgreSQL decida devolver.
 */
function comparar(a: FilaMapeoCliente, b: FilaMapeoCliente, cuenta6: string): number {
  const manualA = a.origenMapeo === "manual" ? 1 : 0;
  const manualB = b.origenMapeo === "manual" ? 1 : 0;
  if (manualA !== manualB) return manualB - manualA;

  const exactaA = a.code === cuenta6 ? 1 : 0;
  const exactaB = b.code === cuenta6 ? 1 : 0;
  if (exactaA !== exactaB) return exactaB - exactaA;

  const fechaA = instante(a.actualizadoEn);
  const fechaB = instante(b.actualizadoEn);
  if (fechaA !== fechaB) return fechaB - fechaA;

  const coincidenciaA = a.coincidencia == null ? -1 : Number(a.coincidencia);
  const coincidenciaB = b.coincidencia == null ? -1 : Number(b.coincidencia);
  if (coincidenciaA !== coincidenciaB) return coincidenciaB - coincidenciaA;

  const porCodigo = a.code.localeCompare(b.code);
  if (porCodigo !== 0) return porCodigo;
  return (a.id ?? 0) - (b.id ?? 0);
}

export function construirConfigMapeoCliente(
  filas: FilaMapeoCliente[],
): Map<string, ConfigMapeoCliente> {
  const grupos = new Map<string, FilaMapeoCliente[]>();
  for (const fila of filas) {
    if (!fila.cuenta6Russell || fila.code.length < 6) continue;
    const cuenta6 = fila.code.slice(0, 6);
    const grupo = grupos.get(cuenta6);
    if (grupo) grupo.push(fila);
    else grupos.set(cuenta6, [fila]);
  }

  const config = new Map<string, ConfigMapeoCliente>();
  for (const [cuenta6, grupo] of grupos) {
    const elegida = [...grupo].sort((a, b) => comparar(a, b, cuenta6))[0];
    if (!elegida?.cuenta6Russell) continue;
    config.set(cuenta6, {
      std: elegida.cuenta6Russell,
      coincidencia:
        elegida.coincidencia == null ? null : Number(elegida.coincidencia),
    });
  }
  return config;
}
