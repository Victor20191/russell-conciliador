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
// el seed y la pantalla de administración. Las filas
// VIGENTES las resuelve el cargador server-only `src/lib/parametros/prevalidador.ts`
// desde la tabla `prevalidador_cuentas`.
//
// Mismo patrón que `src/lib/balance/umbrales-alertas.ts`.

import { limpiarCodigo } from "@/lib/balance/calcular";

/**
 * Cómo se agrega el saldo de una fila del prevalidador.
 * - `saldo`      → Σ `saldo_final`. Desde el 28/Sep/2026 es la base de TODAS las filas:
 *   los módulos se concilian contra el saldo final del balance al corte (21/Sep/2026), y
 *   el prevalidador compara lo mismo que después se concilia.
 * - `movimiento` → Σ (`debitos` − `creditos`), el movimiento del período. Fue la base de
 *   Ingresos y Nómina hasta el 28/Sep/2026; los balances aprobados con ella la conservan
 *   (ver `contexto.ts`: la aprobación congela el catálogo con que se aprobó).
 */
export type BaseCalculo = "saldo" | "movimiento";

/** Fila del catálogo (`prevalidador_cuentas`) ya resuelta con los datos del módulo. */
export type FilaCatalogoPrevalidador = {
  /** id de BD. `0` se reserva para fixtures de fábrica; runtime exige persistencia. */
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
 * 15). Se guarda POR BALANCE en `prevalidador_cuentas_balance`.
 */
export type OverridePrevalidador = {
  catalogoId: number;
  /** PREFIJO del PUC del cliente. */
  cuentaCliente: string;
};

/**
 * Fila del catálogo TAL COMO SALE DE LA BD (`SELECT_CATALOGO_PREVALIDADOR`). Es también la
 * forma en que una aprobación congela su catálogo (`prevalidador_catalogos_revision`): así el
 * catálogo congelado y el vigente pasan por el MISMO mapeo y dan la misma huella.
 */
export type FilaCatalogoCruda = {
  id: number;
  cuentaRussell: string;
  etiqueta: string | null;
  baseCalculo: string;
  orden: number;
  activa: boolean;
  module: { code: string; name: string };
};

/** Lo que el cargador lee de `prevalidador_cuentas` (el orden lo fija la consulta). */
export const SELECT_CATALOGO_PREVALIDADOR = {
  id: true,
  cuentaRussell: true,
  etiqueta: true,
  baseCalculo: true,
  orden: true,
  activa: true,
  module: { select: { code: true, name: true } },
} as const;

/** Fila de fábrica (sin id): la usan la migración y el seed. */
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
 * Las 11 filas que Russell definió por correo (grupos de 2 dígitos y cuentas de 4), más
 * la 7305 de Nómina (RF-NOM-05: el módulo concilia también la mano de obra indirecta,
 * 730505). La migración `20260801120000_prevalidador_homologacion` siembra las 11 y
 * `20260913160000_nomina_cruce_seis_digitos` la 7305; a partir de ahí manda la BD y esto
 * queda como respaldo. Esas migraciones sembraron Ingresos y Nómina por MOVIMIENTO; desde
 * el 28/Sep/2026 van por saldo final (`npm run db:prevalidador:base-saldo` cambió la BD).
 */
export const PREVALIDADOR_CATALOGO_FABRICA: FilaFabricaPrevalidador[] = [
  { moduloCodigo: "ING", cuentaRussell: "41", etiqueta: "Ingresos operacionales", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "CAR", cuentaRussell: "13", etiqueta: "Deudores / clientes", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "CAR", cuentaRussell: "2805", etiqueta: "Anticipos y avances recibidos", baseCalculo: "saldo", orden: 20 },
  { moduloCodigo: "INV", cuentaRussell: "14", etiqueta: "Inventarios", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "AFI", cuentaRussell: "15", etiqueta: "Propiedad, planta y equipo", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "CXP", cuentaRussell: "22", etiqueta: "Proveedores", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "CXP", cuentaRussell: "1330", etiqueta: "Anticipos y avances entregados", baseCalculo: "saldo", orden: 20 },
  { moduloCodigo: "CXP", cuentaRussell: "2335", etiqueta: "Costos y gastos por pagar", baseCalculo: "saldo", orden: 30 },
  { moduloCodigo: "NOM", cuentaRussell: "5105", etiqueta: "Gastos de personal · administración", baseCalculo: "saldo", orden: 10 },
  { moduloCodigo: "NOM", cuentaRussell: "5205", etiqueta: "Gastos de personal · ventas", baseCalculo: "saldo", orden: 20 },
  { moduloCodigo: "NOM", cuentaRussell: "7205", etiqueta: "Mano de obra · producción", baseCalculo: "saldo", orden: 30 },
  { moduloCodigo: "NOM", cuentaRussell: "7305", etiqueta: "Mano de obra indirecta", baseCalculo: "saldo", orden: 40 },
];

/** Nombres de los módulos para construir fixtures de fábrica sin BD. */
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
 * Catálogo de fábrica con la forma que consume el cálculo. Solo sirve para seed,
 * fixtures y pruebas: runtime falla cerrado y nunca lo usa como reemplazo de BD.
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
 * Base de cálculo con que nace una fila nueva del catálogo. Hasta el 28/Sep/2026 dependía de
 * la clase (1-3 saldo, 4-9 movimiento); desde entonces es SALDO FINAL para todas, porque los
 * módulos se concilian contra el saldo final del balance al corte y el prevalidador debe
 * comparar lo mismo. Es solo el defecto: la columna `base_calculo` sigue siendo editable.
 */
export function baseCalculoPorDefecto(codigo: string): BaseCalculo {
  void codigo;
  return "saldo";
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

/**
 * De la fila cruda de la BD a la del cálculo. Es el ÚNICO mapeo del cargador: lo usan el
 * catálogo vigente y el congelado de una aprobación, así los dos dan exactamente la misma forma
 * (y la misma huella) cuando son el mismo catálogo. Falla cerrado ante una fila inválida.
 */
export function mapearCatalogoPrevalidador(filas: readonly FilaCatalogoCruda[]): FilaCatalogoPrevalidador[] {
  return filas.map((fila) => {
    const cuentaRussell = normalizarPrefijo(fila.cuentaRussell);
    if (!esBaseCalculo(fila.baseCalculo)) throw new Error(`La cuenta ${cuentaRussell} tiene una base de cálculo inválida.`);
    if (!PREVALIDADOR_MODULOS_ORDEN.includes(fila.module.code)) {
      throw new Error(`El módulo ${fila.module.code} no pertenece al alcance aprobado del prevalidador.`);
    }
    if (cuentaRussell.length !== 2 && cuentaRussell.length !== 4) {
      throw new Error(`La cuenta ${cuentaRussell} no tiene nivel 2 o 4.`);
    }
    return {
      id: fila.id,
      moduloCodigo: fila.module.code,
      moduloNombre: fila.module.name,
      moduloOrden: ordenModulo(fila.module.code),
      cuentaRussell,
      etiqueta: fila.etiqueta,
      baseCalculo: fila.baseCalculo,
      orden: fila.orden,
      activa: fila.activa,
    };
  });
}
