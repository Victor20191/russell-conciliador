// Catálogo del PREVALIDADOR de homologación: qué cuentas del plan estándar Russell
// se comparan contra el PUC del cliente, y bajo qué módulo de conciliación se
// agrupan.
//
// El prevalidador es la compuerta que Russell ejecuta DESPUÉS de homologar y ANTES
// de conciliar: confirma que el saldo agregado de un grupo de cuentas es el mismo
// visto por el código del cliente y visto por la cuenta estándar que se le asignó.
// Solo cubre las cuentas que alimentan los 6 módulos del ERP que se concilian; el
// resto del balance no se prevalida.
//
// Este módulo es el CATÁLOGO (forma del dato + valores de fábrica) y se mantiene
// PURO —sin BD, sin `server-only`— para que lo compartan el cálculo, las pruebas,
// el seed, la pantalla de administración y el fallback del cargador. Las filas
// VIGENTES las resuelve el cargador server-only `src/lib/parametros/prevalidador.ts`
// desde la tabla `prevalidador_cuentas`.
//
// Mismo patrón que `src/lib/balance/umbrales-alertas.ts`.

import { limpiarCodigo } from "@/lib/balance/calcular";

/**
 * Cómo se agrega el saldo de una fila del prevalidador.
 * - `saldo`      → Σ `saldo_final` (cuentas de balance: activo, pasivo, patrimonio).
 * - `movimiento` → Σ (`debitos` − `creditos`), el movimiento del período (cuentas de
 *   resultado: ingresos, gastos, costos). Evita que un saldo inicial acumulado
 *   contamine la comparación.
 */
export type BaseCalculo = "saldo" | "movimiento";

/** Fila del catálogo (`prevalidador_cuentas`) ya resuelta con los datos del módulo. */
export type FilaCatalogoPrevalidador = {
  /** id de BD. `0` = fila de fábrica servida por el fallback: no editable. */
  id: number;
  /** `Module.code`: ING | CAR | INV | AFI | CXP | NOM. */
  moduloCodigo: string;
  /** `Module.name`, tal como lo verá después la conciliación. */
  moduloNombre: string;
  /** Posición del módulo en el informe (índice en `PREVALIDADOR_MODULOS_ORDEN`). */
  moduloOrden: number;
  /** PREFIJO del plan estándar Russell: "41", "13", "2805"… (2 o 4 dígitos). */
  cuentaRussell: string;
  /** Nombre legible. Solo apoya la lectura; el informe muestra el código. */
  etiqueta: string | null;
  baseCalculo: BaseCalculo;
  /** Posición de la fila dentro de su módulo. */
  orden: number;
  activa: boolean;
};

/**
 * Cuenta del CLIENTE contra la que se compara una fila, cuando el cliente no usa el
 * mismo prefijo que Russell (p. ej. propiedad, planta y equipo en la 17 en vez de la
 * 15). Se guarda POR CLIENTE en `prevalidador_cuentas_cliente`.
 */
export type OverridePrevalidador = {
  catalogoId: number;
  /** PREFIJO del PUC del cliente. */
  cuentaCliente: string;
};

/** Fila de fábrica (sin id): la usan la migración, el seed y el fallback. */
export type FilaFabricaPrevalidador = {
  moduloCodigo: string;
  cuentaRussell: string;
  etiqueta: string;
  baseCalculo: BaseCalculo;
  orden: number;
};

/**
 * Orden de los módulos en el informe, tal como los listó Russell. Los códigos son
 * los de `modulos` (`prisma/seed.ts`): "Cartera" es lo que Russell llama cuentas por
 * cobrar y "Activos fijos" lo que llama propiedad, planta y equipo.
 */
export const PREVALIDADOR_MODULOS_ORDEN: readonly string[] = [
  "ING", // Ingresos
  "CAR", // Cartera (cuentas por cobrar)
  "INV", // Inventarios
  "AFI", // Activos fijos (propiedad, planta y equipo)
  "CXP", // Cuentas por pagar
  "NOM", // Nómina
];

/** Posición del módulo en el informe; los desconocidos van al final. */
export function ordenModulo(codigo: string): number {
  const i = PREVALIDADOR_MODULOS_ORDEN.indexOf(codigo);
  return i === -1 ? 999 : i;
}

/**
 * Las 11 filas que Russell definió por correo (grupos de 2 dígitos y cuentas de 4).
 * La migración `20260801120000_prevalidador_homologacion` las siembra con estos
 * mismos valores; a partir de ahí manda la BD y esto queda como respaldo.
 */
export const PREVALIDADOR_CATALOGO_FABRICA: FilaFabricaPrevalidador[] = [
  { moduloCodigo: "ING", cuentaRussell: "41", etiqueta: "Ingresos operacionales", baseCalculo: "movimiento", orden: 10 },
  { moduloCodigo: "CAR", cuentaRussell: "13", etiqueta: "Deudores / clientes", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "CAR", cuentaRussell: "2805", etiqueta: "Anticipos y avances recibidos", baseCalculo: "saldo", orden: 20 },
  { moduloCodigo: "INV", cuentaRussell: "14", etiqueta: "Inventarios", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "AFI", cuentaRussell: "15", etiqueta: "Propiedad, planta y equipo", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "CXP", cuentaRussell: "22", etiqueta: "Proveedores", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "CXP", cuentaRussell: "1330", etiqueta: "Anticipos y avances entregados", baseCalculo: "saldo", orden: 20 },
  { moduloCodigo: "CXP", cuentaRussell: "2335", etiqueta: "Costos y gastos por pagar", baseCalculo: "saldo", orden: 30 },
  { moduloCodigo: "NOM", cuentaRussell: "5105", etiqueta: "Gastos de personal · administración", baseCalculo: "movimiento", orden: 10 },
  { moduloCodigo: "NOM", cuentaRussell: "5205", etiqueta: "Gastos de personal · ventas", baseCalculo: "movimiento", orden: 20 },
  { moduloCodigo: "NOM", cuentaRussell: "7205", etiqueta: "Mano de obra · producción", baseCalculo: "movimiento", orden: 30 },
];

/** Nombres de los módulos para el fallback (cuando no se pudo leer `modulos`). */
const NOMBRE_MODULO_FABRICA: Record<string, string> = {
  ING: "Ingresos",
  CAR: "Cartera",
  INV: "Inventarios",
  AFI: "Activos fijos",
  CXP: "Cuentas por pagar",
  NOM: "Nómina",
};

export function nombreModuloFabrica(codigo: string): string {
  return NOMBRE_MODULO_FABRICA[codigo] ?? codigo;
}

/**
 * Catálogo de fábrica con la forma que consume el cálculo. `id: 0` marca las filas
 * como NO editables (no existen en BD, así que no se les puede colgar un override).
 */
export function catalogoPrevalidadorDeFabrica(): FilaCatalogoPrevalidador[] {
  return PREVALIDADOR_CATALOGO_FABRICA.map((f) => ({
    id: 0,
    moduloCodigo: f.moduloCodigo,
    moduloNombre: nombreModuloFabrica(f.moduloCodigo),
    moduloOrden: ordenModulo(f.moduloCodigo),
    cuentaRussell: f.cuentaRussell,
    etiqueta: f.etiqueta,
    baseCalculo: f.baseCalculo,
    orden: f.orden,
    activa: true,
  }));
}

/**
 * Base de cálculo que le corresponde a un código por su clase (primer dígito):
 * clases 1-3 son cuentas de balance (saldo), 4-9 son de resultado (movimiento del
 * período). Es solo el DEFECTO: la columna `base_calculo` puede sobreescribirlo sin
 * tocar código si Russell decide otra cosa.
 */
export function baseCalculoPorDefecto(codigo: string): BaseCalculo {
  const c = (codigo ?? "").charAt(0);
  return c === "1" || c === "2" || c === "3" ? "saldo" : c >= "4" && c <= "9" ? "movimiento" : "saldo";
}

export function esBaseCalculo(v: unknown): v is BaseCalculo {
  return v === "saldo" || v === "movimiento";
}

/**
 * Normaliza un prefijo de cuenta a su forma de clave (dígitos sin espacios ni
 * puntos). Reutiliza `limpiarCodigo` para que el prefijo del catálogo y el código
 * del detalle se comparen con exactamente la misma regla.
 */
export function normalizarPrefijo(codigo: string | null | undefined): string {
  return limpiarCodigo(codigo ?? "");
}
