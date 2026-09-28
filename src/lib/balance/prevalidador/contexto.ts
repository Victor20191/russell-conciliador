// Contexto del PREVALIDADOR de un balance: el informe, su huella y el estado de su revisión.
//
// Sin `server-only` ni el singleton de Prisma: lo usan el cargador de la app (`servidor.ts`) y el
// script de mantenimiento `scripts/prevalidador-base-saldo.ts`, que corre fuera de Next.
//
// LA APROBACIÓN CONSERVA SU CATÁLOGO (28/Sep/2026). La huella de una aprobación incluye el
// catálogo, y antes se comparaba siempre contra el catálogo VIGENTE de toda la plataforma: cambiar
// cualquier fila —la base de cálculo de Ingresos, una etiqueta, una cuenta nueva de otro módulo—
// dejaba desactualizadas las aprobaciones de TODOS los balances. Ahora cada aprobación guarda el
// catálogo con que se aprobó (`prevalidador_catalogos_revision`) y, si recalculado con él la huella
// sigue coincidiendo, el balance se lee con ESE catálogo: la aprobación sigue vigente aunque el
// catálogo haya cambiado después. Lo que sí la invalida es un cambio del propio balance (saldos,
// homologación, cuenta alternativa): entonces se recalcula con el catálogo vigente, que es con el
// que se vuelve a aprobar. Para aplicarle el catálogo nuevo a un balance aprobado: revocar y
// volver a aprobar.
import type { Prisma } from "@/generated/prisma/client";
import {
  mapearCatalogoPrevalidador,
  normalizarPrefijo,
  SELECT_CATALOGO_PREVALIDADOR,
  type FilaCatalogoCruda,
  type FilaCatalogoPrevalidador,
  type OverridePrevalidador,
} from "./catalogo";
import { construirPrevalidador, type FilaPrevalidador, type PrevalidadorVM } from "./calcular";
import { catalogoCanonico, crearHuellaPrevalidador } from "./huella";

export type DbPrevalidador = Pick<
  Prisma.TransactionClient,
  "balancePruebaEncabezado" | "prevalidadorCuenta" | "prevalidadorCuentaBalance" | "prevalidadorRevisionBalance"
>;

/** Una aprobación vigente que se calcula con el catálogo con que se aprobó. */
export type CatalogoCongeladoVM = {
  /** Fecha de la aprobación: el catálogo es el que regía entonces. */
  desde: string;
  /** «aprobacion»: lo guardó la aprobación. «respaldo»: lo reconstruyó el script, verificado. */
  origen: "aprobacion" | "respaldo";
  /** El catálogo cambió después: si se revoca, el informe se recalcula con el vigente. */
  difiereDelVigente: boolean;
};

export type RevisionPrevalidadorVM = {
  estado: "pendiente" | "aprobada" | "revocada" | "desactualizada";
  vigente: boolean;
  justificacion: string | null;
  actor: string | null;
  creadoEn: string | null;
  huella: string | null;
  instantaneaDisponible: boolean;
  /** `null`: el informe se calcula con el catálogo vigente. */
  catalogoCongelado: CatalogoCongeladoVM | null;
};

type Monto = { toString(): string };

type BalanceLeido = {
  id: number;
  clienteId: number;
  nombreCliente: string;
  periodo: string;
  periodoInicio: Date;
  periodoFin: Date;
  version: string;
  esOficial: boolean;
  estaCongelado: boolean;
  detalles: { cuenta8: string; nombreCuenta: string; cuenta6Russell: string | null; debitos: Monto; creditos: Monto; saldoFinal: Monto }[];
};

type RevisionLeida = {
  id: number;
  estado: string;
  justificacion: string;
  actor: string;
  creadoEn: Date;
  huella: string;
  instantanea: Prisma.JsonValue | null;
  catalogoCongelado?: { catalogo: Prisma.JsonValue; origen: string; creadoEn: Date } | null;
};

/** Lo que el prevalidador necesita leer de la BD para un balance. */
export type DatosPrevalidador = {
  balance: BalanceLeido;
  /** Filas ACTIVAS del catálogo vigente, crudas y en el orden de la consulta. */
  catalogoVigente: FilaCatalogoCruda[];
  overrides: { catalogoId: number; cuentaCliente: string }[];
  ultimaRevision: RevisionLeida | null;
};

export type ContextoPrevalidador = {
  balance: Omit<BalanceLeido, "detalles">;
  filas: FilaPrevalidador[];
  /** El catálogo con que se calculó: el congelado de la aprobación vigente, o el vigente. */
  catalogo: FilaCatalogoPrevalidador[];
  /** Ese mismo catálogo en filas crudas: es lo que congela una aprobación nueva. */
  catalogoCrudo: FilaCatalogoCruda[];
  overrides: OverridePrevalidador[];
  prevalidador: PrevalidadorVM;
  huella: string;
  revision: RevisionPrevalidadorVM;
};

const SELECT_REVISION = {
  id: true,
  estado: true,
  justificacion: true,
  actor: true,
  creadoEn: true,
  huella: true,
  instantanea: true,
} as const;

/**
 * Lee lo que necesita el prevalidador. `conCatalogoCongelado: false` omite la tabla del catálogo
 * congelado: solo lo usa el script para simular ANTES de aplicar la migración que la crea.
 */
export async function leerDatosPrevalidador(
  db: DbPrevalidador,
  balanceId: number,
  opciones: { conCatalogoCongelado?: boolean } = {},
): Promise<DatosPrevalidador> {
  const conCatalogoCongelado = opciones.conCatalogoCongelado ?? true;
  const [balance, catalogoVigente, overrides, ultimaRevision] = await Promise.all([
    db.balancePruebaEncabezado.findUnique({
      where: { id: balanceId },
      select: {
        id: true,
        clienteId: true,
        nombreCliente: true,
        periodo: true,
        periodoInicio: true,
        periodoFin: true,
        version: true,
        esOficial: true,
        estaCongelado: true,
        detalles: {
          select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, debitos: true, creditos: true, saldoFinal: true },
        },
      },
    }),
    db.prevalidadorCuenta.findMany({
      where: { activa: true },
      select: SELECT_CATALOGO_PREVALIDADOR,
      orderBy: [{ orden: "asc" }, { cuentaRussell: "asc" }],
    }),
    db.prevalidadorCuentaBalance.findMany({
      where: { balanceId },
      select: { catalogoId: true, cuentaCliente: true },
      orderBy: { catalogoId: "asc" },
    }),
    conCatalogoCongelado
      ? db.prevalidadorRevisionBalance.findFirst({
          where: { balanceId },
          select: { ...SELECT_REVISION, catalogoCongelado: { select: { catalogo: true, origen: true, creadoEn: true } } },
          orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
        })
      : db.prevalidadorRevisionBalance.findFirst({
          where: { balanceId },
          select: SELECT_REVISION,
          orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
        }),
  ]);
  if (!balance) throw new Error("El balance no existe.");
  return { balance, catalogoVigente, overrides, ultimaRevision };
}

function decimalANumeroSeguro(valor: Monto, campo: string): number {
  const numero = Number(valor.toString());
  if (!Number.isFinite(numero) || !Number.isSafeInteger(Math.round(numero * 100))) {
    throw new Error(`El monto de ${campo} excede la precisión segura del prevalidador.`);
  }
  return numero;
}

function estadoRevision(revision: RevisionLeida | null, huellaActual: string): Omit<RevisionPrevalidadorVM, "catalogoCongelado"> {
  if (!revision) {
    return { estado: "pendiente", vigente: false, justificacion: null, actor: null, creadoEn: null, huella: null, instantaneaDisponible: false };
  }
  const base = {
    justificacion: revision.justificacion,
    actor: revision.actor,
    creadoEn: revision.creadoEn.toISOString(),
    huella: revision.huella,
    instantaneaDisponible: revision.instantanea != null,
  };
  if (revision.estado !== "aprobada") return { estado: "revocada", vigente: false, ...base };
  if (revision.huella !== huellaActual || revision.instantanea == null) {
    return { estado: "desactualizada", vigente: false, ...base };
  }
  return { estado: "aprobada", vigente: true, ...base };
}

const esTexto = (v: unknown): v is string => typeof v === "string";

/**
 * El catálogo congelado, validado. Un JSON que no tenga la forma esperada no se usa: la
 * aprobación se evalúa entonces con el catálogo vigente, como antes de congelar (falla cerrado).
 * Se ordena igual que la consulta del catálogo vigente, porque ese es el orden con que se aprobó.
 */
export function leerCatalogoCongelado(json: unknown): FilaCatalogoCruda[] | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const filas: FilaCatalogoCruda[] = [];
  for (const f of json) {
    if (f == null || typeof f !== "object") return null;
    const o = f as Record<string, unknown>;
    const modulo = o.module as Record<string, unknown> | null | undefined;
    if (!Number.isInteger(o.id) || !esTexto(o.cuentaRussell) || !(o.etiqueta === null || esTexto(o.etiqueta))) return null;
    if (!esTexto(o.baseCalculo) || typeof o.orden !== "number" || typeof o.activa !== "boolean") return null;
    if (modulo == null || typeof modulo !== "object" || !esTexto(modulo.code) || !esTexto(modulo.name)) return null;
    filas.push({
      id: o.id as number,
      cuentaRussell: o.cuentaRussell,
      etiqueta: o.etiqueta as string | null,
      baseCalculo: o.baseCalculo,
      orden: o.orden,
      activa: o.activa,
      module: { code: modulo.code, name: modulo.name },
    });
  }
  return filas.sort((a, b) => a.orden - b.orden || (a.cuentaRussell < b.cuentaRussell ? -1 : a.cuentaRussell > b.cuentaRussell ? 1 : 0));
}

/** ¿Dos catálogos son el mismo, tal como los ve la huella? */
export function mismoCatalogo(a: readonly FilaCatalogoPrevalidador[], b: readonly FilaCatalogoPrevalidador[]): boolean {
  return JSON.stringify(catalogoCanonico(a)) === JSON.stringify(catalogoCanonico(b));
}

/**
 * Calcula el informe y resuelve la revisión. Con `ignorarCatalogoCongelado` reproduce la lógica
 * anterior al 28/Sep/2026 (siempre el catálogo vigente): la usa el script para demostrar qué
 * aprobaciones se habrían perdido sin el catálogo congelado.
 */
export function resolverContextoPrevalidador(
  datos: DatosPrevalidador,
  opciones: { ignorarCatalogoCongelado?: boolean } = {},
): ContextoPrevalidador {
  const { detalles, ...balance } = datos.balance;
  const catalogoVigente = mapearCatalogoPrevalidador(datos.catalogoVigente);
  const overrides: OverridePrevalidador[] = datos.overrides.map((fila) => ({
    catalogoId: fila.catalogoId,
    cuentaCliente: normalizarPrefijo(fila.cuentaCliente),
  }));
  const filas: FilaPrevalidador[] = detalles.map((fila) => ({
    cuenta8: fila.cuenta8,
    nombreCuenta: fila.nombreCuenta,
    cuenta6Russell: fila.cuenta6Russell,
    debitos: decimalANumeroSeguro(fila.debitos, `${fila.cuenta8} · débitos`),
    creditos: decimalANumeroSeguro(fila.creditos, `${fila.cuenta8} · créditos`),
    saldoFinal: decimalANumeroSeguro(fila.saldoFinal, `${fila.cuenta8} · saldo final`),
  }));
  const calcular = (catalogo: FilaCatalogoPrevalidador[]) => {
    const prevalidador = construirPrevalidador(filas, catalogo, overrides);
    const huella = crearHuellaPrevalidador({ balance, filas: detalles, catalogo, overrides, prevalidador });
    return { prevalidador, huella };
  };

  // 1) La aprobación vigente con el catálogo con que se aprobó.
  const ultima = datos.ultimaRevision;
  const congelado = ultima?.catalogoCongelado;
  if (!opciones.ignorarCatalogoCongelado && ultima?.estado === "aprobada" && ultima.instantanea != null && congelado) {
    const crudo = leerCatalogoCongelado(congelado.catalogo);
    let catalogo: FilaCatalogoPrevalidador[] | null = null;
    if (crudo) {
      try {
        catalogo = mapearCatalogoPrevalidador(crudo);
      } catch {
        catalogo = null;
      }
    }
    if (crudo && catalogo) {
      const calculo = calcular(catalogo);
      if (calculo.huella === ultima.huella) {
        return {
          balance,
          filas,
          catalogo,
          catalogoCrudo: crudo,
          overrides,
          prevalidador: calculo.prevalidador,
          huella: calculo.huella,
          revision: {
            ...estadoRevision(ultima, calculo.huella),
            catalogoCongelado: {
              desde: ultima.creadoEn.toISOString(),
              origen: congelado.origen === "respaldo" ? "respaldo" : "aprobacion",
              difiereDelVigente: !mismoCatalogo(catalogo, catalogoVigente),
            },
          },
        };
      }
    }
  }

  // 2) Todo lo demás —sin aprobación, revocada, el balance cambió, o una aprobación anterior sin
  //    catálogo congelado—, con el catálogo vigente: es el que rige una aprobación nueva.
  const calculo = calcular(catalogoVigente);
  return {
    balance,
    filas,
    catalogo: catalogoVigente,
    catalogoCrudo: datos.catalogoVigente,
    overrides,
    prevalidador: calculo.prevalidador,
    huella: calculo.huella,
    revision: { ...estadoRevision(ultima, calculo.huella), catalogoCongelado: null },
  };
}
