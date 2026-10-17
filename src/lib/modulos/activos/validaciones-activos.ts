// VALIDACIONES DE ACTIVOS FIJOS POR ACTIVO (17/Oct/2026) — puras, sin BD.
//
// Costo neto = costo de adquisición + adiciones + mejoras + valorización − depreciación − deterioro.
// La depreciación y el deterioro restan en magnitud (unos ERP los imprimen en negativo y otros no);
// adiciones, mejoras y valorización se toman con su signo (una desvalorización resta).
//  - Activos con costo o neto negativo: un activo no puede valer menos que cero. Exigen un
//    comentario para cerrar la conciliación (uno por tipo, no por activo).
//  - Depreciación sin costo en el cargue: la cédula compararía el neto contra un costo en cero.
//    Exige comentario; el caso contrario (costo sin depreciación) solo informa.
//  - Costo neto del archivo contra el calculado: solo informa.
import { contenidoDelCargue, filaEsSoloDepreciacion } from "./contenido-archivo";

/** Lo que se lista por validación; el conteo es completo. */
const MAX_FILAS = 200;
/** Holgura de redondeo entre el neto del archivo y el calculado. */
const TOLERANCIA_NETO = 1;

export type FilaActivo = {
  filaNum: number;
  valor: number;
  imputable?: boolean | null;
  datos: Record<string, unknown> | null | undefined;
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
};
const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;
const texto = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s || null;
};

/** Roles que suman al costo del activo (se capitalizan en su cuenta). */
export const ROLES_SUMA_COSTO = ["adiciones", "mejoras", "valorizacion"] as const;

/** Costo neto calculado de una fila con la fórmula del activo. */
export function netoCalculadoActivo(datos: Record<string, unknown> | null | undefined): number {
  const d = datos ?? {};
  const costo = numero(d.costo) ?? 0;
  const suma = ROLES_SUMA_COSTO.reduce((s, rol) => s + (numero(d[rol]) ?? 0), 0);
  const depreciacion = Math.abs(numero(d.depreciacion) ?? 0);
  const deterioro = Math.abs(numero(d.deterioro) ?? 0);
  return redondear(costo + suma - depreciacion - deterioro);
}

export type ActivoNegativo = {
  filaNum: number;
  placa: string | null;
  descripcion: string | null;
  /** El costo de adquisición cuando es negativo; null si no lo es. */
  costo: number | null;
  /** El costo neto cuando es negativo (el del archivo si lo trae, si no el calculado); null si no lo es. */
  neto: number | null;
};

export type NetoDistinto = { filaNum: number; placa: string | null; archivo: number; calculado: number; diferencia: number };

type Lista<T> = { cantidad: number; filas: T[] };

export type ValidacionesActivos = {
  negativos: Lista<ActivoNegativo> & { suma: number };
  netoVsCalculado: Lista<NetoDistinto>;
  /** El cargue trae depreciación y ningún costo de adquisición. */
  faltaCosto: boolean;
  /** El cargue trae costo y ninguna depreciación (solo informa). */
  faltaDepreciacion: boolean;
};

/**
 * Las validaciones por activo sobre las filas que cuentan del cargue. Las filas de un archivo de
 * SOLO depreciación no traen el costo del activo (su «costo» es la depreciación copiada para el
 * control del total): no se juzgan.
 */
export function validarActivos(filas: readonly FilaActivo[]): ValidacionesActivos {
  const negativos: ValidacionesActivos["negativos"] = { cantidad: 0, filas: [], suma: 0 };
  const netoVsCalculado: ValidacionesActivos["netoVsCalculado"] = { cantidad: 0, filas: [] };
  for (const f of filas) {
    if (f.imputable === false || filaEsSoloDepreciacion(f.datos)) continue;
    const d = f.datos ?? {};
    const placa = texto(d.placa);
    const costo = numero(d.costo);
    const calculado = netoCalculadoActivo(d);
    const netoArchivo = numero(d.valorNeto);
    const neto = netoArchivo ?? calculado;
    const costoNegativo = costo != null && costo < 0 ? redondear(costo) : null;
    const netoNegativo = neto < 0 ? redondear(neto) : null;
    if (costoNegativo != null || netoNegativo != null) {
      negativos.cantidad += 1;
      negativos.suma = redondear(negativos.suma + (costoNegativo ?? 0) + (netoNegativo ?? 0));
      if (negativos.filas.length < MAX_FILAS) {
        negativos.filas.push({ filaNum: f.filaNum, placa, descripcion: texto(d.descripcion), costo: costoNegativo, neto: netoNegativo });
      }
    }
    if (netoArchivo != null && Math.abs(netoArchivo - calculado) > TOLERANCIA_NETO) {
      netoVsCalculado.cantidad += 1;
      if (netoVsCalculado.filas.length < MAX_FILAS) {
        netoVsCalculado.filas.push({ filaNum: f.filaNum, placa, archivo: redondear(netoArchivo), calculado, diferencia: redondear(netoArchivo - calculado) });
      }
    }
  }
  const lados = contenidoDelCargue(filas.map((f) => ({ valor: f.valor, datos: f.datos, imputable: f.imputable })));
  return {
    negativos,
    netoVsCalculado,
    faltaCosto: lados.conDepreciacion && !lados.conCosto,
    faltaDepreciacion: lados.conCosto && !lados.conDepreciacion,
  };
}

/** Una entrada del lado del módulo para la cédula (la forma de `construirCruceContable`). */
export type EntradaCedulaActivo = { clasificador: string; total: number; cuentas4: string[] };

/**
 * Lo que los roles opcionales llevan a la cédula, además del costo y la depreciación:
 *  - adiciones, mejoras y valorización suman al costo, en las MISMAS cuentas del activo (sin
 *    cuenta asignada, al saldo sin cuenta, como el costo);
 *  - el deterioro va a la cuenta correctora (`claveCorrectora`, el renglón 1599) en NEGATIVO, como
 *    el saldo crédito del balance; sin ese renglón en la cédula, al saldo sin cuenta.
 * Una entrada por clasificador y rol, rotulada («1520 · adiciones») para verse en el desglose.
 */
export function entradasOpcionalesActivos(p: {
  detalles: readonly { clasificador: string | null; imputable?: boolean | null; datos?: Record<string, unknown> | null }[];
  cuentasPorClasificador: ReadonlyMap<string, readonly string[]>;
  sumaAlCosto: readonly { rol: string; etiqueta: string }[];
  correctora: { rol: string; etiqueta: string; clave: string | null } | null;
}): EntradaCedulaActivo[] {
  const suma = new Map<string, number>();
  const llave = (clasificador: string, rol: string) => `${clasificador}\u0001${rol}`;
  const roles = [...p.sumaAlCosto.map((r) => r.rol), ...(p.correctora ? [p.correctora.rol] : [])];
  for (const d of p.detalles) {
    if (d.imputable === false || filaEsSoloDepreciacion(d.datos)) continue;
    const clasificador = d.clasificador?.trim() || "(sin clasificar)";
    for (const rol of roles) {
      const v = numero(d.datos?.[rol]);
      if (v == null || v === 0) continue;
      // La correctora resta en magnitud fila por fila, como en la fórmula del neto.
      const aporte = p.correctora && rol === p.correctora.rol ? Math.abs(v) : v;
      suma.set(llave(clasificador, rol), (suma.get(llave(clasificador, rol)) ?? 0) + aporte);
    }
  }
  const salida: EntradaCedulaActivo[] = [];
  for (const [k, bruto] of suma) {
    const [clasificador, rol] = k.split("\u0001");
    const opcional = p.sumaAlCosto.find((r) => r.rol === rol);
    if (opcional) {
      const total = redondear(bruto);
      if (total !== 0) {
        salida.push({ clasificador: `${clasificador} · ${opcional.etiqueta}`, total, cuentas4: [...(p.cuentasPorClasificador.get(clasificador) ?? [])] });
      }
      continue;
    }
    if (p.correctora && rol === p.correctora.rol) {
      const total = -redondear(Math.abs(bruto));
      if (total !== 0) {
        salida.push({ clasificador: `${clasificador} · ${p.correctora.etiqueta}`, total, cuentas4: p.correctora.clave ? [p.correctora.clave] : [] });
      }
    }
  }
  return salida.sort((a, b) => a.clasificador.localeCompare(b.clasificador));
}
