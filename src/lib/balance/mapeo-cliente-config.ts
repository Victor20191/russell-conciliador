// Valores de `cuentas_cliente.origen_mapeo`. La memoria de mapeo tiene DOS
// granularidades y el origen es lo único que las distingue:
//   - `manual`        → regla del GRUPO de 6 dígitos (vale para todas sus
//                       imputables); es lo que escriben /config/mapeo y la
//                       homologación con alcance «todas las cuentas del grupo».
//   - `manual_cuenta` → EXCEPCIÓN de esa sola cuenta (homologación con alcance
//                       «solo esta cuenta»): no participa en la decisión del
//                       grupo y solo se aplica al código exacto.
//   - `automatico`    → lo que dedujo la cascada (exacto/descripción/IA).
export const ORIGEN_AUTOMATICO = "automatico";
export const ORIGEN_MANUAL_GRUPO = "manual";
export const ORIGEN_MANUAL_CUENTA = "manual_cuenta";

/** Cualquier mapeo puesto por una persona: el volcado automático nunca lo pisa. */
export function esMapeoManual(origen: string | null | undefined): boolean {
  return origen === ORIGEN_MANUAL_GRUPO || origen === ORIGEN_MANUAL_CUENTA;
}

/** Excepción de una sola cuenta (no arrastra al resto del grupo de 6 dígitos). */
export function esExcepcionCuenta(origen: string | null | undefined): boolean {
  return origen === ORIGEN_MANUAL_CUENTA;
}

/** Nivel PUC que corresponde a la longitud del código del cliente. */
export function nivelPorCodigo(code: string): number {
  return code.length >= 8 ? 8 : code.length === 6 ? 6 : code.length === 4 ? 4 : 2;
}

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

/**
 * Memoria de mapeo del cliente lista para consultar, con DOS tipos de clave en el
 * mismo mapa: la cuenta de 6 dígitos (regla del grupo) y el código exacto de las
 * cuentas con excepción propia. Se lee siempre con `resolverMapeoCliente`, que
 * prueba primero la cuenta exacta y luego su grupo.
 *
 * Las excepciones (`manual_cuenta`) quedan FUERA de la elección del grupo: si
 * participaran, arreglar una sola auxiliar movería a todas sus hermanas (una fila
 * `manual` gana la elección) y ese es justo el efecto que la excepción evita.
 */
export function construirConfigMapeoCliente(
  filas: FilaMapeoCliente[],
): Map<string, ConfigMapeoCliente> {
  const grupos = new Map<string, FilaMapeoCliente[]>();
  const excepciones = new Map<string, FilaMapeoCliente>();
  for (const fila of filas) {
    if (!fila.cuenta6Russell || fila.code.length < 6) continue;
    if (esExcepcionCuenta(fila.origenMapeo)) {
      // `code` es único por cliente, pero el desempate deja el resultado estable
      // aunque lleguen filas repetidas desde otra fuente.
      const previa = excepciones.get(fila.code);
      if (!previa || comparar(fila, previa, fila.code) < 0) excepciones.set(fila.code, fila);
      continue;
    }
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
  // Después del grupo: si la excepción es de una cuenta de 6 dígitos, la cuenta ES
  // el grupo y debe ganar.
  for (const [code, fila] of excepciones) {
    config.set(code, {
      std: fila.cuenta6Russell!,
      coincidencia: fila.coincidencia == null ? null : Number(fila.coincidencia),
    });
  }
  return config;
}

/**
 * Lee la memoria para una cuenta del cliente: primero su excepción por código
 * exacto y, si no hay, la regla de su grupo de 6 dígitos.
 */
export function resolverMapeoCliente<T>(
  config: Map<string, T> | undefined,
  code: string,
): T | undefined {
  if (!config) return undefined;
  return config.get(code) ?? config.get(code.slice(0, 6));
}
