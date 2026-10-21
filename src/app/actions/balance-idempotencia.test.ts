import { beforeEach, describe, expect, it, vi } from "vitest";

const LOTE_ID = "11111111-1111-4111-8111-111111111111";
const LOTE_ID_NUEVO = "22222222-2222-4222-8222-222222222222";
const controlCorte = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/balance/comparacion-corte-servidor", () => ({ recalcularComparacionesDelCorteSeguro: controlCorte, auditarInconsistenciasCorte: vi.fn(async () => undefined) }));

const mocks = vi.hoisted(() => {
  type AjustesCargaMock = {
    hojaPreferida: string | null;
    convencionCredito: string | null;
    estandar: string | null;
    agregarPorTercero: boolean | null;
    imputarSoloHojas: boolean | null;
    observaciones: string | null;
  };
  type SpecCargaMock = {
    signoCredito: string;
    [campo: string]: unknown;
  };
  type Balance = {
    id: number;
    loteId: string | null;
    clienteId: number;
    periodo: string;
    version: string;
    advertenciaArchivoFuente: boolean;
    diferenciaArchivoFuente: number | null;
    aperturaBalance: string | null;
    estaCongelado?: boolean;
    creadoEn?: Date;
  };
  type Lote = {
    loteId: string;
    clienteId: number | null;
    cargadoPorId: number | null;
    archivoNombre: string;
    archivoTam: string;
    nitDetectado: string | null;
    periodoInicial: Date | null;
    periodoFinal: Date | null;
    convencionCredito: string;
    filasLeidas: number;
    filasExcluidas: number;
    cuentasMovimiento: number;
    huella: string | null;
    specJson: unknown;
    origenExtraccion: string | null;
    revisionContenido: number;
    aperturaBalance: string | null;
  };
  type Staging = {
    loteId: string;
    clienteId: number;
    filaNum: number;
    codigo: string;
    codigoCrudo: string;
    nombre: string;
    nivel: number;
    tipoFila: string;
    tipoFilaForzado: string | null;
    omitida: boolean | null;
    desacoplada: boolean;
    padreManual: number | null;
    justificacionReubicacion: string | null;
    reubicacionRevisadaPor: string | null;
    reubicacionRevisadaPorId: number | null;
    reubicacionRevisadaEn: Date | null;
    saldoInicial: number;
    debitos: number;
    creditos: number;
    saldoFinal: number;
  };
  type Diagnostico = {
    loteId: string;
    resultado: string;
  };

  const state: {
    balances: Balance[];
    lotes: Lote[];
    staging: Staging[];
    diagnosticos: Diagnostico[];
    escriturasPuc: string[];
  } = {
    balances: [],
    lotes: [],
    staging: [],
    diagnosticos: [],
    escriturasPuc: [],
  };

  const flags = {
    fallarPurgaLote: false,
    fallarSegundoBloqueStaging: false,
    fallarPuc: false,
    fallarMetricasCorreccion: false,
    cambiarRevisionAntesCommit: false,
    bloquesStaging: 0,
  };

  const restaurar = (snapshot: typeof state) => {
    state.balances.splice(0, state.balances.length, ...snapshot.balances);
    state.lotes.splice(0, state.lotes.length, ...snapshot.lotes);
    state.staging.splice(0, state.staging.length, ...snapshot.staging);
    state.diagnosticos.splice(0, state.diagnosticos.length, ...snapshot.diagnosticos);
    state.escriturasPuc.splice(
      0,
      state.escriturasPuc.length,
      ...snapshot.escriturasPuc,
    );
  };

  const balanceFindUnique = vi.fn(async ({ where }: { where: { loteId?: string; id?: number } }) =>
    state.balances.find((b) =>
      where.loteId != null ? b.loteId === where.loteId : b.id === where.id,
    ) ?? null);
  // Por período (versionado) o por corte (`periodoFin`): en estas pruebas todos los balances del
  // cliente comparten la fecha de corte, así que el filtro por corte devuelve los del cliente.
  const balanceFindMany = vi.fn(async ({ where }: { where: { clienteId?: number; periodo?: string; periodoFin?: Date; id?: { in: number[] }; estaCongelado?: boolean } }) =>
    state.balances.filter((b) =>
      (where.clienteId === undefined || b.clienteId === where.clienteId)
      && (where.periodo === undefined || b.periodo === where.periodo)
      && (where.id === undefined || where.id.in.includes(b.id))
      && (where.estaCongelado === undefined || Boolean(b.estaCongelado) === where.estaCongelado)));
  const balanceCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const balance: Balance = {
      id: state.balances.length + 1,
      loteId: String(data.loteId),
      clienteId: Number(data.clienteId),
      periodo: String(data.periodo),
      version: String(data.version),
      advertenciaArchivoFuente: Boolean(data.advertenciaArchivoFuente),
      diferenciaArchivoFuente: data.diferenciaArchivoFuente == null
        ? null
        : Number(data.diferenciaArchivoFuente),
      aperturaBalance: data.aperturaBalance == null ? null : String(data.aperturaBalance),
    };
    state.balances.push(balance);
    return { id: balance.id };
  });

  const loteFindUnique = vi.fn(async ({ where }: { where: { loteId: string } }) =>
    state.lotes.find((l) => l.loteId === where.loteId) ?? null);
  const loteCreate = vi.fn(async ({ data }: { data: Lote }) => {
    state.lotes.push({ ...data });
    return data;
  });
  const loteDeleteMany = vi.fn(async ({ where }: { where: { loteId: string } }) => {
    if (flags.fallarPurgaLote) throw new Error("Fallo inyectado al purgar el lote");
    const antes = state.lotes.length;
    state.lotes.splice(0, state.lotes.length, ...state.lotes.filter((l) => l.loteId !== where.loteId));
    return { count: antes - state.lotes.length };
  });

  const stagingFindMany = vi.fn(async ({ where }: { where: { loteId: string } }) =>
    state.staging.filter((f) => f.loteId === where.loteId));
  const stagingCount = vi.fn(async ({ where }: { where: { loteId: string; clienteId?: number } }) =>
    state.staging.filter((f) =>
      f.loteId === where.loteId &&
      (where.clienteId == null || f.clienteId === where.clienteId),
    ).length);
  const stagingCreateMany = vi.fn(async ({ data }: { data: Staging[] }) => {
    flags.bloquesStaging += 1;
    if (flags.fallarSegundoBloqueStaging && flags.bloquesStaging === 2) {
      throw new Error("Corte inyectado entre bloques de staging");
    }
    state.staging.push(...data.map((fila) => ({ ...fila })));
    return { count: data.length };
  });
  const stagingDeleteMany = vi.fn(async ({ where }: { where: { loteId: string } }) => {
    const antes = state.staging.length;
    state.staging.splice(0, state.staging.length, ...state.staging.filter((f) => f.loteId !== where.loteId));
    return { count: antes - state.staging.length };
  });
  const diagnosticoUpdateMany = vi.fn(async ({
    where,
    data,
  }: {
    where: { loteId: string };
    data: { resultado: string };
  }) => {
    let count = 0;
    for (const diagnostico of state.diagnosticos) {
      if (diagnostico.loteId !== where.loteId) continue;
      diagnostico.resultado = data.resultado;
      count += 1;
    }
    return { count };
  });

  const tx = {
    clientAccount: { updateMany: vi.fn(async () => ({ count: 1 })) },
    $executeRaw: vi.fn(async () => {
      if (flags.fallarPuc) throw new Error("Fallo inyectado al persistir el PUC");
      state.escriturasPuc.push("puc-atomico");
      return 1;
    }),
    balancePruebaEncabezado: {
      findUnique: balanceFindUnique,
      findMany: balanceFindMany,
      create: balanceCreate,
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    balancePruebaDetalle: {
      findMany: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
      findFirst: vi.fn(async (): Promise<{ id: number } | null> => ({ id: 1 })),
    },
    // «Dar OK» a saldos contrarios: la versión nueva hereda los de la previa con el mismo saldo final.
    validacionAlerta: {
      findMany: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
      create: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    comment: {
      create: vi.fn(async () => ({ id: 777 })),
    },
    balanceImportacionLote: {
      findUnique: loteFindUnique,
      create: loteCreate,
      deleteMany: loteDeleteMany,
    },
    balanceImportacionStaging: {
      findMany: stagingFindMany,
      count: stagingCount,
      createMany: stagingCreateMany,
      deleteMany: stagingDeleteMany,
    },
    balanceImportacionStagingTercero: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    balanceTerceroEncabezado: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({ id: 900 })),
    },
    balanceTerceroDetalle: {
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    balanceLecturaDiagnostico: {
      updateMany: diagnosticoUpdateMany,
    },
    correccionCargaBalance: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => {
        if (flags.fallarMetricasCorreccion) {
          throw new Error("Fallo inyectado al registrar uso de correcciones");
        }
        return { count: 1 };
      }),
    },
  };

  const ejecutarTransaccion = vi.fn(async (callback: (cliente: typeof tx) => Promise<unknown>) => {
    const snapshot = structuredClone(state);
    try {
      return await callback(tx);
    } catch (error) {
      restaurar(snapshot);
      throw error;
    }
  });

  return {
    state,
    flags,
    tx,
    ejecutarTransaccion,
    authorizePermiso: vi.fn(),
    contextoAccesoBorradorActual: vi.fn(async () => ({
      usuarioId: 3,
      alcance: { todos: true as const },
    })),
    puedeVerBorrador: vi.fn(() => true),
    getCurrentUser: vi.fn(),
    ingerir: vi.fn(),
    clientFindMany: vi.fn(),
    registrarConsumoIA: vi.fn(async () => undefined),
    iaBalanceDisponible: vi.fn(() => false),
    extraerBalance: vi.fn(),
    redirect: vi.fn((destino: string) => {
      throw new Error(`REDIRECT:${destino}`);
    }),
    parseBalanceWorkbook: vi.fn(),
    logAudit: vi.fn(),
    createProcessNotification: vi.fn(),
    cerrarDiagnostico: vi.fn(),
    registrarDiagnosticoInicial: vi.fn(),
    invalidarStagingBorrador: vi.fn(),
    ajustesUpsert: vi.fn(async () => ({})),
    ajustesFindUnique: vi.fn<() => Promise<AjustesCargaMock | null>>(async () => null),
    ajustesUpdateMany: vi.fn(async () => ({ count: 1 })),
    perfilFindFirst: vi.fn(async () => null),
    perfilFindUnique: vi.fn(async () => null),
    perfilUpsert: vi.fn(async () => ({})),
    perfilUpdate: vi.fn(async () => ({})),
    aplicarPreferenciasCarga: vi.fn(
      (spec: SpecCargaMock, ajustes?: AjustesCargaMock | null) => {
        void ajustes;
        return spec;
      },
    ),
    transformarTabular: vi.fn(),
    clientAccountFindMany: vi.fn(async () => {
      if (flags.cambiarRevisionAntesCommit && state.lotes[0]) {
        state.lotes[0].revisionContenido += 1;
      }
      return [];
    }),
    clientAccountUpsert: vi.fn(async () => ({})),
    correccionFindMany: vi.fn(async (): Promise<Array<{
      cuenta: string;
      nombre: string | null;
      tipoFilaForzado: string | null;
      desacoplada: boolean | null;
      omitida: boolean | null;
      padreCodigo: string | null;
    }>> => []),
    planAplicarCorrecciones: vi.fn((): {
      cambios: Array<{
        filaNum: number;
        desacoplada?: boolean;
      }>;
      cuentasAplicadas: string[];
    } => ({
      cambios: [],
      cuentasAplicadas: [],
    })),
    construirVistaBorrador: vi.fn(),
    esDescuadreDelArchivoFuente: vi.fn(() => false),
    validarComentarioPromocion: vi.fn((valor: unknown, requerido: boolean) => {
      const comentario = typeof valor === "string" && valor.trim() ? valor.trim() : null;
      return requerido && !comentario
        ? { ok: false as const, message: "Comentario obligatorio." }
        : { ok: true as const, comentario };
    }),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/conciliacion/verificar-bloqueo", () => ({
  bloqueoHomologacionBalance: vi.fn(async () => null),
  bloqueoMemoriaHomologacion: vi.fn(async () => null),
  cierresFirmes: vi.fn(async () => []),
  cierresFirmesDeBalance: vi.fn(async () => []),
  cuentasBloqueadas: vi.fn(async () => []),
  exigirCargueCompatibleConCierres: vi.fn(async () => undefined),
  registrarIntentoBloqueado: vi.fn(async () => undefined),
  autorizarCierreConciliacion: vi.fn(async () => ({ ok: true, userId: 1, role: "Senior" })),
  ErrorConciliacionEnFirme: class ErrorConciliacionEnFirme extends Error {},
}));
vi.mock("@/lib/balance/autorizacion-borrador", () => ({
  contextoAccesoBorradorActual: mocks.contextoAccesoBorradorActual,
  puedeVerBorrador: mocks.puedeVerBorrador,
}));
vi.mock("@/lib/rbac/contexto", () => ({ clienteDeBalance: vi.fn() }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/notifications", () => ({ createProcessNotification: mocks.createProcessNotification }));
vi.mock("@/lib/errores", () => ({
  esErrorDisponibilidadIA: () => false,
  mensajeErrorBD: (_contexto: string, error: unknown) => String(error),
  mensajeErrorIA: (_contexto: string, error: unknown) => String(error),
}));
vi.mock("@/lib/concurrency", () => ({
  tomarCandadoTransaccion: vi.fn(async () => undefined),
  transaccionSerializable: mocks.ejecutarTransaccion,
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: mocks.ejecutarTransaccion,
    client: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        name: "Cliente prueba",
        nit: "900123456-7",
        erpId: 1,
      })),
      findMany: mocks.clientFindMany,
    },
    ajustesCargaBalance: {
      findUnique: mocks.ajustesFindUnique,
      upsert: mocks.ajustesUpsert,
      updateMany: mocks.ajustesUpdateMany,
    },
    perfilCargaBalance: {
      findFirst: mocks.perfilFindFirst,
      findUnique: mocks.perfilFindUnique,
      upsert: mocks.perfilUpsert,
      update: mocks.perfilUpdate,
    },
    clientAccount: {
      findMany: mocks.clientAccountFindMany,
      upsert: mocks.clientAccountUpsert,
    },
    balancePruebaEncabezado: mocks.tx.balancePruebaEncabezado,
    balancePruebaDetalle: mocks.tx.balancePruebaDetalle,
    balanceImportacionLote: {
      ...mocks.tx.balanceImportacionLote,
      update: vi.fn(async ({ where, data }: { where: { loteId: string }; data: Record<string, unknown> }) => {
        const lote = mocks.state.lotes.find((l) => l.loteId === where.loteId);
        if (!lote) throw new Error("Lote inexistente");
        Object.assign(lote, data);
        return lote;
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    balanceImportacionStaging: mocks.tx.balanceImportacionStaging,
    balanceImportacionStagingTercero: mocks.tx.balanceImportacionStagingTercero,
    balanceTerceroEncabezado: mocks.tx.balanceTerceroEncabezado,
    balanceTerceroDetalle: mocks.tx.balanceTerceroDetalle,
    correccionCargaBalance: {
      findMany: mocks.correccionFindMany,
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    consumoIA: { createMany: vi.fn(async () => ({ count: 0 })) },
  },
}));

const calc = {
  breakdown: [],
  validations: [],
  totalRows: 1,
  mapped: 1,
  unmapped: 0,
  critical: 0,
  balanced: true,
  movimientosCuadran: true,
  sums: { activo: 100 },
};

vi.mock("@/lib/balance/calcular", () => ({
  calcularBalance: vi.fn(() => structuredClone(calc)),
  construirValidacionContable: vi.fn(() => ({
    activo: null,
    pasivo: null,
    patrimonio: null,
    ecuacion: null,
  })),
  reconstruirBalance: vi.fn(() => structuredClone(calc)),
  aFilasDetalle: vi.fn(() => [{
    cuenta2: "11",
    cuenta4: "1105",
    cuenta6: "110505",
    cuenta8: "11050501",
    nombreCuenta: "Caja",
    cuenta6Russell: "110505",
    coincidencia: 100,
    saldoInicial: 0,
    debitos: 100,
    creditos: 0,
    saldoFinal: 100,
  }]),
  aplanarBreakdown: vi.fn(() => []),
  compararBalances: vi.fn(() => ({ summary: { added: 0, changed: 0, removed: 0 } })),
  tokenizarPlan: vi.fn(() => ({})),
  limpiarCodigo: (codigo: string) => codigo.replace(/\D/g, ""),
  conForzarHoja: <T>(filas: T) => filas,
}));
vi.mock("@/lib/balance/cuentas-estandar", () => ({ getCuentasEstandar: vi.fn(async () => []) }));
vi.mock("@/lib/parametros/umbrales", () => ({
  getUmbralesAlertas: vi.fn(async () => ({ descuadre: 2000, naturaleza: 50000 })),
}));
vi.mock("@/lib/ia/proveedor-balance", () => ({
  iaBalanceDisponible: mocks.iaBalanceDisponible,
  proveedorIABalance: vi.fn(() => "anthropic"),
}));
vi.mock("@/lib/ia/proveedor-balance-sesion", () => ({
  proveedorIABalanceSesion: vi.fn(async () => "anthropic"),
}));
vi.mock("@/lib/ia/uso", () => ({ registrarConsumoIA: mocks.registrarConsumoIA }));
vi.mock("@/lib/balance/mapeo-ia", () => ({ mapearPorIA: vi.fn(async () => new Map()) }));
// Módulo puro: solo se fuerza una memoria de mapeo vacía; el resto de helpers
// (origen del mapeo, nivel por código) se usan tal cual.
vi.mock("@/lib/balance/mapeo-cliente-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/balance/mapeo-cliente-config")>()),
  construirConfigMapeoCliente: vi.fn(() => new Map()),
}));
vi.mock("@/lib/balance/borrador-vm", () => ({
  construirVistaBorrador: mocks.construirVistaBorrador,
}));
// El resumen del cuadre construye su propia vista: aquí basta uno vacío.
vi.mock("@/lib/balance/cuadre-borrador", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/balance/cuadre-borrador")>()),
  resumenCuadreDeFilas: vi.fn((_filas: unknown, _aprobadas: unknown, revision: number) => ({
    v: 1, revision, ecuacionDiff: 0, partidaDobleDiff: 0, clases: [], agrupadoras: [], agrupadorasTotal: 0,
  })),
  // El veredicto al cargar se evalúa con la función real sobre un resumen cuadrado.
  resumirCuadreBorrador: vi.fn((_vista: unknown, _filas: unknown, _aprobadas: unknown, revision: number) => ({
    v: 1, revision, ecuacionDiff: 0, partidaDobleDiff: 0, clases: [], agrupadoras: [], agrupadorasTotal: 0,
  })),
}));
vi.mock("@/lib/balance/borrador", () => ({
  detectarManipulacionesRiesgosas: vi.fn(() => []),
  reclasificarHuerfanas: vi.fn(() => []),
  reclasificarSoloHojas: vi.fn(() => []),
  corregirCodigosPlaceholder: vi.fn(),
  marcarNoContables: vi.fn(),
  validarReubicacionesBorrador: vi.fn(() => []),
}));
vi.mock("@/lib/balance/terceros", () => ({
  esBalancePorTercero: vi.fn(() => false),
  colapsarTerceros: vi.fn((filas) => filas),
  esBalancePorTerceroSufijo: vi.fn(() => false),
  consolidarTercerosPorSufijo: vi.fn((filas) => filas),
  marcarCuentaNit: vi.fn(),
}));
vi.mock("@/lib/balance/staging-borrador", () => ({
  invalidarStagingBorrador: mocks.invalidarStagingBorrador,
}));
vi.mock("@/lib/balance/relistado", () => ({ marcarRelistadoGuiones: vi.fn() }));
vi.mock("@/lib/balance/extraccion/transformar", () => ({
  construirCuadre: vi.fn(() => null),
  marcarSubtotalesDuplicados: vi.fn(() => new Set()),
  reclasificarRepetidos: vi.fn(),
  reclasificarNoImputables: vi.fn(),
  transformarTabular: mocks.transformarTabular,
}));
vi.mock("@/lib/balance/extraccion/extraer", () => ({
  extraerBalance: mocks.extraerBalance,
}));
vi.mock("@/lib/balance/correcciones", () => ({
  claveCuenta: vi.fn(),
  construirCorrecciones: vi.fn(() => []),
  planAplicarCorrecciones: mocks.planAplicarCorrecciones,
}));
vi.mock("@/lib/balance/diagnostico-lectura-registro", () => ({
  registrarDiagnosticoInicial: mocks.registrarDiagnosticoInicial,
  cerrarDiagnostico: mocks.cerrarDiagnostico,
  acumularIntervencionManual: vi.fn(),
}));
vi.mock("@/lib/balance/revisiones-reubicacion-balance", () => ({
  evaluarRevisionesReubicacionStaging: vi.fn(() => ({
    riesgosPendientes: [],
    revisionesAprobadas: [],
  })),
}));
vi.mock("@/lib/balance/advertencia-archivo-fuente", () => ({
  MAX_COMENTARIO_PROMOCION: 1_000,
  esDescuadreDelArchivoFuente: mocks.esDescuadreDelArchivoFuente,
  validarComentarioPromocion: mocks.validarComentarioPromocion,
}));
vi.mock("@/lib/balance/conciliacion-reubicaciones", () => ({
  calcularExplicacionesClaseReubicacion: vi.fn(() => new Map()),
  filtrarHallazgosClaseResueltos: vi.fn((hallazgos) => hallazgos),
}));
vi.mock("@/lib/balance/preferencias-carga", () => ({
  aplicarPreferenciasCarga: mocks.aplicarPreferenciasCarga,
}));
vi.mock("@/lib/balance/extraccion/ingesta", () => ({
  ingerir: mocks.ingerir,
}));
vi.mock("@/lib/import/balance", () => ({
  parseBalanceWorkbook: mocks.parseBalanceWorkbook,
}));

import {
  actualizarPeriodoBorrador,
  asignarClienteBorrador,
  asignarCuentaEstandar,
  cargarBorrador,
  compararBorradorConCorte,
  continuarBalanceTransitorioConSpec,
  descartarBorrador,
  descongelarBalance,
  eliminarBalance,
  freezeBalance,
  validarAlerta,
  revertirValidacionAlerta,
  leerBalance,
  marcarCuentaPendiente,
  quitarPendiente,
  reaplicarMapeoBalance,
  reaplicarMapeoBalancesCliente,
  reemplazarBalanceConciliado,
} from "./balance";
import { resumirCuadreBorrador } from "@/lib/balance/cuadre-borrador";
import { reconstruirBalance, type ResultadoBalance } from "@/lib/balance/calcular";

function filaStaging(filaNum = 1, loteId = LOTE_ID) {
  return {
    loteId,
    clienteId: 7,
    filaNum,
    codigo: "11050501",
    codigoCrudo: "11050501",
    nombre: "Caja",
    nivel: 8,
    tipoFila: "movimiento",
    tipoFilaForzado: null,
    omitida: null,
    desacoplada: false,
    padreManual: null,
    justificacionReubicacion: null,
    reubicacionRevisadaPor: null,
    reubicacionRevisadaPorId: null,
    reubicacionRevisadaEn: null,
    saldoInicial: 0,
    debitos: 100,
    creditos: 0,
    saldoFinal: 100,
  };
}

function loteBorrador(loteId = LOTE_ID) {
  return {
    loteId,
    clienteId: 7,
    cargadoPorId: 3,
    archivoNombre: "balance.xlsx",
    archivoTam: "10 KB",
    nitDetectado: "900123456-7",
    periodoInicial: new Date("2026-01-01T00:00:00.000Z"),
    periodoFinal: new Date("2026-01-31T00:00:00.000Z"),
    convencionCredito: "firmado",
    filasLeidas: 1,
    filasExcluidas: 0,
    cuentasMovimiento: 1,
    huella: null,
    specJson: null,
    origenExtraccion: "plantilla",
    revisionContenido: 0,
    // Apertura declarada en el borrador: el lote la conserva y la promoción la exige.
    aperturaBalance: null,
  };
}

function formPromocion(apertura: string | null = "cuenta") {
  const form = new FormData();
  form.set("clientId", "7");
  form.set("periodoInicio", "2026-01-01");
  form.set("periodoFin", "2026-01-31");
  form.set("loteId", LOTE_ID);
  if (apertura != null) form.set("aperturaBalance", apertura);
  return form;
}

function formLectura(
  loteIdSolicitud = LOTE_ID,
  loteIdAnterior: string | null = null,
  clienteId: number | null = 7,
  archivo: File = new File(["contenido"], "balance.xlsx"),
) {
  const valores = new Map<string, FormDataEntryValue>([
    ["loteIdSolicitud", loteIdSolicitud],
    ["archivo", archivo],
  ]);
  if (clienteId != null) valores.set("clienteId", String(clienteId));
  if (loteIdAnterior) valores.set("loteIdAnterior", loteIdAnterior);
  return {
    get: vi.fn((clave: string) => valores.get(clave) ?? null),
  } as unknown as FormData;
}

function filasImportacion(cantidad: number) {
  return Array.from({ length: cantidad }, (_, indice) => ({
    code: `110505${String(indice).padStart(4, "0")}`,
    name: `Cuenta ${indice + 1}`,
    prevBalance: 0,
    balance: 1,
  }));
}

const SPEC_TRANSITORIO = {
  hoja: "Balance",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: {
    codigo: 1,
    codigoFragmentos: [],
    nombre: 2,
    saldoInicial: 3,
    debitos: 4,
    creditos: 5,
    saldoFinal: 6,
    saldoFinalDebito: 0,
    saldoFinalCredito: 0,
    tercero: 0,
  },
  signoCredito: "firmado" as const,
  reglaDetalle: {
    tipo: "prefijo" as const,
    columna: null,
    valor: null,
  },
  agregarPorTercero: false,
  prefijoDocumentoTercero: null,
  subtotalesTercero: "auto" as const,
};

function ingestaTabular(nit: string | null) {
  return {
    modo: "tabular" as const,
    hojas: [{
      nombre: "Balance",
      filas: [
        ...(nit ? [["NIT", nit]] : []),
        ["Código", "Nombre", "Saldo"],
      ],
    }],
  };
}

function ingestaDocumento() {
  return {
    modo: "documento" as const,
    documento: {
      tipo: "pdf" as const,
      base64: "JVBERi0xLjQ=",
      mime: "application/pdf",
    },
  };
}

function resultadoTransform(cantidad = 1) {
  const importReady = filasImportacion(cantidad);
  return {
    importReady,
    filasCrudas: importReady.map((fila, indice) => ({
      hoja: "Balance",
      filaNum: indice + 2,
      codigoCrudo: fila.code,
      codigo: fila.code,
      nombre: fila.name,
      nivel: fila.code.length,
      tipoFila: "movimiento" as const,
      saldoInicial: fila.prevBalance,
      debitos: 1,
      creditos: 0,
      saldoFinal: fila.balance,
    })),
    excepciones: [],
    cabecera: {
      nit: { valor: null, fuente: "NINGUNO" as const },
      periodoInicial: { valor: null, fuente: "NINGUNO" as const },
      periodoFinal: { valor: null, fuente: "NINGUNO" as const },
      estandar: "NIF" as const,
    },
    resumen: {
      filasLeidas: cantidad,
      filasExcluidas: 0,
      filasImportables: cantidad,
      filasDescuadre: 0,
      cuentasMovimiento: cantidad,
      cuentasAgrupadoras: 0,
      nit: { valor: null, fuente: "NINGUNO" as const },
      periodoInicial: { valor: null, fuente: "NINGUNO" as const },
      periodoFinal: { valor: null, fuente: "NINGUNO" as const },
      estandar: "NIF" as const,
      convencionCredito: "firmado" as const,
    },
    cuadre: {
      detectado: false as const,
      totalDebitos: 0,
      totalCreditos: 0,
      sumaDebitos: 0,
      sumaCreditos: 0,
      diferenciaDebitos: 0,
      diferenciaCreditos: 0,
      toleranciaDebitos: 0,
      toleranciaCreditos: 0,
      cuadra: true,
    },
    modo: "tabular" as const,
    confianza: 0.9,
  };
}

function formContinuacion(
  spec: unknown = SPEC_TRANSITORIO,
  clienteId = 7,
  loteIdSolicitud = LOTE_ID_NUEVO,
  archivo: File = new File(["contenido"], "balance.xlsx"),
) {
  const valores = new Map<string, FormDataEntryValue>([
    ["archivo", archivo],
    ["clienteId", String(clienteId)],
    ["loteIdSolicitud", loteIdSolicitud],
    ["spec", JSON.stringify(spec)],
    ["modeloIA", "anthropic"],
  ]);
  return {
    get: vi.fn((clave: string) => valores.get(clave) ?? null),
  } as unknown as FormData;
}

describe("idempotencia y atomicidad del ciclo de balances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.balances.length = 0;
    mocks.state.lotes.splice(0, mocks.state.lotes.length, loteBorrador());
    mocks.state.staging.splice(0, mocks.state.staging.length, filaStaging());
    mocks.state.diagnosticos.splice(
      0,
      mocks.state.diagnosticos.length,
      { loteId: LOTE_ID, resultado: "borrador" },
    );
    mocks.flags.fallarPurgaLote = false;
    mocks.flags.fallarSegundoBloqueStaging = false;
    mocks.flags.fallarPuc = false;
    mocks.flags.fallarMetricasCorreccion = false;
    mocks.flags.cambiarRevisionAntesCommit = false;
    mocks.flags.bloquesStaging = 0;
    mocks.state.escriturasPuc.length = 0;
    mocks.correccionFindMany.mockResolvedValue([]);
    mocks.planAplicarCorrecciones.mockReturnValue({
      cambios: [],
      cuentasAplicadas: [],
    });
    mocks.authorizePermiso.mockResolvedValue({ ok: true, role: "staff" });
    mocks.puedeVerBorrador.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: 3, name: "Analista", role: "staff" });
    mocks.iaBalanceDisponible.mockReturnValue(false);
    mocks.extraerBalance.mockReset();
    mocks.ingerir.mockRejectedValue(new Error("Sin ingesta especializada"));
    mocks.clientFindMany.mockResolvedValue([]);
    mocks.parseBalanceWorkbook.mockResolvedValue({ filas: filasImportacion(1), errores: [] });
    mocks.ajustesFindUnique.mockResolvedValue(null);
    mocks.aplicarPreferenciasCarga.mockImplementation((spec) => spec);
    mocks.transformarTabular.mockReturnValue(resultadoTransform());
    mocks.construirVistaBorrador.mockReturnValue({
      validacion: {
        activoDiff: 0,
        pasivoDiff: 0,
        patrimonioDiff: 0,
        ingresosDiff: 0,
        gastosDiff: 0,
        costosDiff: 0,
        ecuacionDiff: -2_500,
      },
      partidaDoble: { debitos: 100, creditos: 100, diff: 0, cuadra: true },
      hallazgos: [],
      filasContabilizadas: [1],
      diagnostico: {
        movimientos: 1,
        filas: 1,
        partidaDobleDiff: 0,
        ecuacionDiff: 0,
        cuadrado: true,
      },
    });
    mocks.esDescuadreDelArchivoFuente.mockReturnValue(false);
  });

  it("promueve dos veces el mismo lote como un único balance y conserva la misma ruta", async () => {
    await expect(cargarBorrador({}, formPromocion()))
      .rejects.toThrow("REDIRECT:/balance/1?cargado=1");

    await expect(cargarBorrador({}, formPromocion()))
      .rejects.toThrow("REDIRECT:/balance/1?cargado=1");

    expect(mocks.state.balances).toHaveLength(1);
    expect(mocks.state.balances[0]).toMatchObject({
      loteId: LOTE_ID,
      version: "v1",
      advertenciaArchivoFuente: false,
      diferenciaArchivoFuente: null,
    });
  });

  it("ejecuta el control solo después del commit y un fallo del control no revierte la carga", async () => {
    controlCorte.mockImplementationOnce(async () => {
      expect(mocks.state.balances).toHaveLength(1);
      expect(mocks.state.staging).toHaveLength(0);
      expect(mocks.state.lotes).toHaveLength(0);
      return false;
    });
    await expect(cargarBorrador({}, formPromocion())).rejects.toThrow("REDIRECT:/balance/1?cargado=1");
    expect(mocks.state.balances).toHaveLength(1);
    expect(controlCorte).toHaveBeenCalledWith(7, expect.any(Date), "Analista");
  });

  it("rechaza una versión nueva si la vigente de la misma línea está cerrada y conserva el borrador", async () => {
    mocks.state.balances.push({
      id: 50, loteId: "anterior", clienteId: 7, periodo: "Enero 2026", version: "v1", aperturaBalance: "cuenta",
      advertenciaArchivoFuente: false, diferenciaArchivoFuente: null, estaCongelado: true, creadoEn: new Date(Date.UTC(2026, 1, 1)),
    });
    const r = await cargarBorrador({}, formPromocion());
    expect(r).toMatchObject({ ok: false, message: "La versión v1 de Enero 2026 · Por cuenta está cerrada: ábrela con «Abrir balance» antes de cargar una versión nueva." });
    expect(mocks.state.balances).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(controlCorte).not.toHaveBeenCalled();
  });

  describe("OK heredados de la versión anterior (20/Oct/2026)", () => {
    // La cuenta 11050501 (Caja, débito) llega con saldo crédito de $90.000: saldo contrario sobre el umbral.
    const conCajaContraria = () => vi.mocked(reconstruirBalance).mockImplementation(() => ({
      ...structuredClone(calc),
      breakdown: [{ items: [{ code: "11050501", balance: -90_000, saldoOk: false, mapped: true }] }],
    }) as unknown as ResultadoBalance);
    const okPrevio = { anchor: "11050501", validadoPor: "Ana Senior", validadoPorId: 5, validadoEn: new Date(Date.UTC(2026, 9, 15)), comment: { body: "Sobregiro contable revisado.", authorId: 5 } };
    const versionAbierta = () => mocks.state.balances.push({
      id: 50, loteId: "anterior", clienteId: 7, periodo: "Enero 2026", version: "v1", aperturaBalance: "cuenta",
      advertenciaArchivoFuente: false, diferenciaArchivoFuente: null, estaCongelado: false, creadoEn: new Date(Date.UTC(2026, 1, 1)),
    });
    const restaurar = () => vi.mocked(reconstruirBalance).mockImplementation(() => structuredClone(calc) as unknown as ResultadoBalance);

    it("pasa el OK de una cuenta con el mismo saldo final y la versión queda «En proceso»", async () => {
      versionAbierta();
      conCajaContraria();
      try {
        mocks.tx.balancePruebaDetalle.findMany.mockResolvedValueOnce([{ cuenta8: "11050501", nombreCuenta: "Caja", cuenta6Russell: "110505", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: -90_000 }]);
        mocks.tx.validacionAlerta.findMany.mockResolvedValueOnce([okPrevio]);
        await expect(cargarBorrador({}, formPromocion())).rejects.toThrow("REDIRECT:/balance/2?cargado=1");
        expect(mocks.tx.balancePruebaEncabezado.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: "En proceso" }) }));
        expect(mocks.tx.comment.create).toHaveBeenCalledWith({
          data: { entityType: "balance", entityId: 2, anchor: "11050501", authorId: 5, body: "OK heredado de la v1 (mismo saldo final): Sobregiro contable revisado." },
        });
        expect(mocks.tx.validacionAlerta.create).toHaveBeenCalledWith({
          data: {
            balanceId: 2, anchor: "11050501", tipoAlerta: "naturaleza", commentId: 777,
            validadoPor: "Ana Senior", validadoPorId: 5, validadoEn: okPrevio.validadoEn, heredadaDeBalanceId: 50,
          },
        });
      } finally {
        restaurar();
      }
    });

    it("si el saldo cambió, el OK no pasa y la versión queda «En proceso con alertas»", async () => {
      versionAbierta();
      conCajaContraria();
      try {
        mocks.tx.balancePruebaDetalle.findMany.mockResolvedValueOnce([{ cuenta8: "11050501", nombreCuenta: "Caja", cuenta6Russell: "110505", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: -75_000 }]);
        mocks.tx.validacionAlerta.findMany.mockResolvedValueOnce([okPrevio]);
        await expect(cargarBorrador({}, formPromocion())).rejects.toThrow("REDIRECT:/balance/2?cargado=1");
        expect(mocks.tx.balancePruebaEncabezado.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: "En proceso con alertas" }) }));
        expect(mocks.tx.validacionAlerta.create).not.toHaveBeenCalled();
      } finally {
        restaurar();
      }
    });
  });

  describe("«Dar OK» a un saldo contrario", () => {
    const abierto = () => mocks.state.balances.push({
      id: 41, loteId: null, clienteId: 7, periodo: "Enero 2026", version: "v1", advertenciaArchivoFuente: false, diferenciaArchivoFuente: null, aperturaBalance: null, estaCongelado: false,
    });

    it("solo a una cuenta del cliente del balance", async () => {
      abierto();
      mocks.tx.balancePruebaDetalle.findFirst.mockResolvedValueOnce(null);
      expect(await validarAlerta({ balanceId: 41, anchor: "n6:110505", comentario: "Revisado" }))
        .toEqual({ ok: false, message: "Solo se da OK a la naturaleza contraria de una cuenta del cliente de este balance." });
      expect(mocks.tx.validacionAlerta.upsert).not.toHaveBeenCalled();
    });

    it("guarda el OK como «naturaleza» y recalcula el estado en el mismo commit; revertir también", async () => {
      abierto();
      expect(await validarAlerta({ balanceId: 41, anchor: "11050501", comentario: "Sobregiro revisado" })).toMatchObject({ ok: true });
      expect(mocks.tx.validacionAlerta.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ balanceId: 41, anchor: "11050501", tipoAlerta: "naturaleza", commentId: 777 }),
      }));
      // Sin alertas pendientes (detalle vacío en el mock): queda «En proceso».
      expect(mocks.tx.balancePruebaEncabezado.updateMany).toHaveBeenCalledWith({ where: { id: { in: [41] }, estaCongelado: false }, data: { estado: "En proceso" } });

      mocks.tx.balancePruebaEncabezado.updateMany.mockClear();
      expect(await revertirValidacionAlerta({ balanceId: 41, anchor: "11050501" })).toMatchObject({ ok: true });
      expect(mocks.tx.validacionAlerta.deleteMany).toHaveBeenCalledWith({ where: { balanceId: 41, anchor: "11050501" } });
      expect(mocks.tx.balancePruebaEncabezado.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [41] }, estaCongelado: false } }));
    });
  });

  it("carga una versión nueva cuando la vigente de la misma línea está abierta", async () => {
    mocks.state.balances.push({
      id: 50, loteId: "anterior", clienteId: 7, periodo: "Enero 2026", version: "v1", aperturaBalance: "cuenta",
      advertenciaArchivoFuente: false, diferenciaArchivoFuente: null, estaCongelado: false, creadoEn: new Date(Date.UTC(2026, 1, 1)),
    });
    await expect(cargarBorrador({}, formPromocion())).rejects.toThrow("REDIRECT:/balance/2?cargado=1");
    expect(mocks.state.balances.map((b) => b.version)).toEqual(["v1", "v2"]);
  });

  it("conserva agrupadoras originales y enlaza la procedencia antes de purgar el borrador", async () => {
    mocks.state.staging.push({ ...mocks.state.staging[0], filaNum: 2, codigo: "1105", nombre: "Caja del ERP", tipoFila: "agrupadora" });
    await expect(cargarBorrador({}, formPromocion())).rejects.toThrow("REDIRECT:/balance/1?cargado=1");
    expect(mocks.tx.balancePruebaEncabezado.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pucCliente: expect.arrayContaining([{ codigo: "1105", nombre: "Caja del ERP", tipo_fila: "agrupadora" }, expect.objectContaining({ tipo_fila: "movimiento" })]) }),
    }));
    expect(mocks.tx.clientAccount.updateMany).toHaveBeenCalledWith({
      where: { clienteId: 7, procedenciaMapeo: { path: ["lote_id"], equals: LOTE_ID }, origenMapeo: "automatico" },
      data: { procedenciaMapeo: { fuente: "carga", balance_id: 1, lote_id: LOTE_ID, periodo: expect.any(String), version: "v1" } },
    });
    expect(mocks.state.staging).toHaveLength(0);
  });

  it("exige declarar el tipo de balance y lo copia al encabezado oficial", async () => {
    // Sin declaración —ni en el formulario ni memorizada en el lote— la promoción
    // se niega: el dato nunca se deduce de la heurística de terceros.
    const sinDeclarar = await cargarBorrador({}, formPromocion(null));
    expect(sinDeclarar).toEqual({
      ok: false,
      message: "Indica si el balance es por cuenta o por terceros antes de cargarlo.",
    });
    expect(mocks.state.balances).toHaveLength(0);

    await expect(cargarBorrador({}, formPromocion("tercero")))
      .rejects.toThrow("REDIRECT:/balance/1?cargado=1");
    expect(mocks.state.balances[0]).toMatchObject({ aperturaBalance: "tercero" });
  });

  it("promueve con la apertura ya guardada en el lote aunque el formulario no la reenvíe", async () => {
    mocks.state.lotes.splice(0, mocks.state.lotes.length, {
      ...loteBorrador(),
      aperturaBalance: "tercero",
    });

    await expect(cargarBorrador({}, formPromocion(null)))
      .rejects.toThrow("REDIRECT:/balance/1?cargado=1");

    expect(mocks.state.balances[0]).toMatchObject({ aperturaBalance: "tercero" });
  });

  it("persiste el diagnóstico del archivo fuente junto con la justificación (el comentario de la ecuación)", async () => {
    mocks.esDescuadreDelArchivoFuente.mockReturnValue(true);
    const form = formPromocion();
    form.set("comentarioDescuadre_ecuacion", "Diferencia confirmada con el cliente.");

    await expect(cargarBorrador({}, form))
      .rejects.toThrow("REDIRECT:/balance/1?cargado=1");

    expect(mocks.state.balances[0]).toMatchObject({
      advertenciaArchivoFuente: true,
      diferenciaArchivoFuente: -2_500,
    });
    expect(mocks.tx.balancePruebaEncabezado.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        comentarioAprobacion: "Diferencia confirmada con el cliente.",
        descuadreBorrador: {
          v: 2,
          origen: "archivo_fuente",
          motivos: [{ tipo: "ecuacion", monto: -2_500, comentario: "Diferencia confirmada con el cliente." }],
          umbrales: { descuadre: 2_000 },
        },
      }),
    }));
  });

  it("recalcula en servidor la obligatoriedad y no confía en una bandera del formulario", async () => {
    mocks.esDescuadreDelArchivoFuente.mockReturnValue(true);
    // La nota opcional no reemplaza el comentario de la ecuación.
    const form = formPromocion();
    form.set("comentarioPromocion", "Nota suelta.");

    const resultado = await cargarBorrador({}, form);

    expect(resultado).toEqual({ ok: false, message: "Escribe un comentario para cargar este balance con la diferencia del archivo fuente." });
    expect(mocks.state.balances).toHaveLength(0);
    expect(mocks.state.lotes).toHaveLength(1);
  });

  it("un borrador descuadrado por dos condiciones exige el comentario de cada una", async () => {
    // Partida doble y clases desde el umbral ($2.000): las dos fallan.
    vi.mocked(resumirCuadreBorrador).mockImplementation((_vista, _filas, _aprobadas, revision) => ({
      v: 1, revision, ecuacionDiff: 0, partidaDobleDiff: 2_500,
      clases: [{ clase: "Activo", diff: 3_000 }], agrupadoras: [], agrupadorasTotal: 0,
    }));
    try {
      const soloUno = formPromocion();
      soloUno.set("comentarioDescuadre_partida_doble", "Débitos del cierre fuera del archivo.");
      expect(await cargarBorrador({}, soloUno)).toEqual({
        ok: false,
        message: "El borrador está descuadrado: falta el comentario de «Clases contra el archivo».",
      });
      expect(mocks.state.balances).toHaveLength(0);

      const ambos = formPromocion();
      ambos.set("comentarioDescuadre_partida_doble", "Débitos del cierre fuera del archivo.");
      ambos.set("comentarioDescuadre_clases", "Activo sin la cuenta puente.");
      // Un comentario de una condición que no falla no viaja a la constancia.
      ambos.set("comentarioDescuadre_agrupadoras", "Sobra.");
      await expect(cargarBorrador({}, ambos)).rejects.toThrow("REDIRECT:/balance/1?cargado=1");

      const textoPlano = "Partida doble: Débitos del cierre fuera del archivo.\nClases contra el archivo: Activo sin la cuenta puente.";
      expect(mocks.tx.balancePruebaEncabezado.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          comentarioAprobacion: textoPlano,
          descuadreBorrador: {
            v: 2,
            origen: "borrador",
            motivos: [
              { tipo: "partida_doble", monto: 2_500, comentario: "Débitos del cierre fuera del archivo." },
              { tipo: "clases", clases: [{ clase: "Activo", diff: 3_000 }], comentario: "Activo sin la cuenta puente." },
            ],
            umbrales: { descuadre: 2_000 },
          },
        }),
      }));
      expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
        detail: expect.stringContaining("Comentario: Partida doble: Débitos del cierre fuera del archivo. Clases contra el archivo: Activo sin la cuenta puente."),
      }));
    } finally {
      vi.mocked(resumirCuadreBorrador).mockImplementation((_vista, _filas, _aprobadas, revision) => ({
        v: 1, revision, ecuacionDiff: 0, partidaDobleDiff: 0, clases: [], agrupadoras: [], agrupadorasTotal: 0,
      }));
    }
  });

  it("una diferencia informativa (menor al umbral) no pide comentario y la nota sigue siendo opcional", async () => {
    vi.mocked(resumirCuadreBorrador).mockImplementation((_vista, _filas, _aprobadas, revision) => ({
      v: 1, revision, ecuacionDiff: 1_500, partidaDobleDiff: -1_999.99, clases: [], agrupadoras: [], agrupadorasTotal: 0,
    }));
    try {
      await expect(cargarBorrador({}, formPromocion())).rejects.toThrow("REDIRECT:/balance/1?cargado=1");
      expect(mocks.tx.balancePruebaEncabezado.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ comentarioAprobacion: null, descuadreBorrador: undefined }),
      }));
    } finally {
      vi.mocked(resumirCuadreBorrador).mockImplementation((_vista, _filas, _aprobadas, revision) => ({
        v: 1, revision, ecuacionDiff: 0, partidaDobleDiff: 0, clases: [], agrupadoras: [], agrupadorasTotal: 0,
      }));
    }
  });

  it("recupera el balance confirmado cuando se pierde la primera respuesta", async () => {
    await expect(cargarBorrador({}, formPromocion())).rejects.toThrow("REDIRECT:");
    // El cliente no recibió la respuesta y repite exactamente la solicitud.
    await expect(cargarBorrador({}, formPromocion()))
      .rejects.toThrow("REDIRECT:/balance/1?cargado=1");

    expect(mocks.state.balances).toHaveLength(1);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.createProcessNotification).toHaveBeenCalledTimes(1);
  });

  it("revierte balance y staging consumido si falla la purga del encabezado", async () => {
    mocks.flags.fallarPurgaLote = true;

    const resultado = await cargarBorrador({}, formPromocion());

    expect(resultado.ok).toBe(false);
    expect(mocks.state.balances).toHaveLength(0);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);
    expect(mocks.state.escriturasPuc).toHaveLength(0);
  });

  it("revierte PUC, balance y consumo del borrador si falla la escritura masiva", async () => {
    mocks.flags.fallarPuc = true;

    const resultado = await cargarBorrador({}, formPromocion());

    expect(resultado.ok).toBe(false);
    expect(mocks.state.escriturasPuc).toHaveLength(0);
    expect(mocks.state.balances).toHaveLength(0);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);
  });

  it("no promueve una revisión de staging distinta de la que alcanzó a analizar", async () => {
    mocks.flags.cambiarRevisionAntesCommit = true;

    const resultado = await cargarBorrador({}, formPromocion());

    expect(resultado.ok).toBe(false);
    expect(mocks.state.balances).toHaveLength(0);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.lotes[0]?.revisionContenido).toBe(1);
    expect(mocks.state.staging).toHaveLength(1);
  });

  it("muestra una revisión transitoria sin cliente y no persiste lote ni staging", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.ingerir.mockResolvedValue(ingestaTabular(null));

    const resultado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, null, null),
    );

    expect(resultado).toMatchObject({
      ok: false,
      requiereCliente: true,
      nitDetectado: null,
      sugerencia: {
        persistida: false,
        payload: { loteId: LOTE_ID_NUEVO },
        render: {
          clienteDetectadoId: null,
          importReady: [
            expect.objectContaining({ code: "1105050000" }),
          ],
        },
      },
    });
    expect(mocks.parseBalanceWorkbook).toHaveBeenCalledTimes(1);
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
    expect(mocks.state.lotes).toHaveLength(0);
    expect(mocks.state.staging).toHaveLength(0);
  });

  it("continúa con el mismo UUID y archivo después de seleccionar el cliente manualmente", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.ingerir.mockResolvedValue(ingestaTabular(null));
    const archivo = new File(["contenido"], "balance.xlsx");

    const pendiente = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, null, null, archivo),
    );
    expect(pendiente.requiereCliente).toBe(true);
    expect(pendiente.sugerencia?.persistida).toBe(false);
    expect(mocks.state.lotes).toHaveLength(0);
    expect(mocks.state.staging).toHaveLength(0);

    const continuado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, null, 7, archivo),
    );

    expect(continuado.ok).toBe(true);
    expect(continuado.sugerencia?.persistida).toBe(true);
    expect(continuado.sugerencia?.payload.loteId).toBe(LOTE_ID_NUEVO);
    expect(mocks.state.lotes).toEqual([
      expect.objectContaining({ loteId: LOTE_ID_NUEVO, clienteId: 7 }),
    ]);
    expect(mocks.state.staging).toEqual([
      expect.objectContaining({ loteId: LOTE_ID_NUEVO, clienteId: 7 }),
    ]);
  });

  it("vincula una sugerencia transitoria con su spec sin repetir IA ni confiar en filas del navegador", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.ingerir.mockResolvedValue(ingestaTabular(null));
    mocks.ajustesFindUnique.mockResolvedValue({
      hojaPreferida: null,
      convencionCredito: "magnitud",
      estandar: "NIF",
      agregarPorTercero: null,
      imputarSoloHojas: null,
      observaciones: null,
    });
    mocks.aplicarPreferenciasCarga.mockImplementation((spec, ajustes) => ({
      ...spec,
      signoCredito: ajustes?.convencionCredito === "magnitud"
        ? "magnitud"
        : spec.signoCredito,
    }));
    mocks.correccionFindMany.mockResolvedValue([
      {
        cuenta: "1105050000",
        nombre: "Cuenta 1",
        tipoFilaForzado: null,
        desacoplada: true,
        omitida: null,
        padreCodigo: null,
      },
    ]);
    mocks.planAplicarCorrecciones.mockReturnValue({
      cambios: [{ filaNum: 2, desacoplada: true }],
      cuentasAplicadas: ["1105050000"],
    });

    const resultado = await continuarBalanceTransitorioConSpec(
      {},
      formContinuacion(),
    );

    expect(resultado.ok).toBe(true);
    expect(resultado.sugerencia).toMatchObject({
      persistida: true,
      payload: {
        loteId: LOTE_ID_NUEVO,
        origenExtraccion: "ia",
      },
    });
    expect(mocks.extraerBalance).not.toHaveBeenCalled();
    expect(mocks.parseBalanceWorkbook).not.toHaveBeenCalled();
    expect(mocks.transformarTabular).toHaveBeenCalledWith(
      expect.objectContaining({ signoCredito: "magnitud" }),
      expect.any(Array),
      expect.any(Object),
    );
    expect(mocks.state.lotes).toEqual([
      expect.objectContaining({
        loteId: LOTE_ID_NUEVO,
        clienteId: 7,
        origenExtraccion: "ia",
      }),
    ]);
    expect(mocks.state.staging).toEqual([
      expect.objectContaining({
        loteId: LOTE_ID_NUEVO,
        clienteId: 7,
        desacoplada: true,
      }),
    ]);
  });

  it("recupera por el mismo UUID una continuación transitoria ya persistida sin reprocesarla", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.ingerir.mockResolvedValue(ingestaTabular(null));

    const primero = await continuarBalanceTransitorioConSpec(
      {},
      formContinuacion(),
    );
    expect(primero.ok).toBe(true);
    expect(mocks.transformarTabular).toHaveBeenCalledTimes(1);

    await expect(
      continuarBalanceTransitorioConSpec({}, formContinuacion()),
    ).rejects.toThrow(`REDIRECT:/balance/borradores/${LOTE_ID_NUEVO}`);
    expect(mocks.transformarTabular).toHaveBeenCalledTimes(1);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);
  });

  it("rechaza la continuación transitoria fuera del alcance antes de reingresar el archivo", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.authorizePermiso.mockImplementation(async (
      _permiso: string,
      opciones?: { clientId?: number },
    ) => opciones?.clientId
      ? { ok: false, message: "Cliente fuera del alcance." }
      : { ok: true, role: "staff" });

    const resultado = await continuarBalanceTransitorioConSpec(
      {},
      formContinuacion(),
    );

    expect(resultado).toMatchObject({
      ok: false,
      message: "Cliente fuera del alcance.",
    });
    expect(mocks.ingerir).not.toHaveBeenCalled();
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
    expect(mocks.state.lotes).toHaveLength(0);
    expect(mocks.state.staging).toHaveLength(0);
  });

  it("rechaza un spec transitorio alterado antes de reingresar o persistir el archivo", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;

    const resultado = await continuarBalanceTransitorioConSpec(
      {},
      formContinuacion({ ...SPEC_TRANSITORIO, primeraFilaDatos: 1 }),
    );

    expect(resultado.ok).toBe(false);
    expect(mocks.ingerir).not.toHaveBeenCalled();
    expect(mocks.transformarTabular).not.toHaveBeenCalled();
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
    expect(mocks.state.lotes).toHaveLength(0);
    expect(mocks.state.staging).toHaveLength(0);
  });

  it("pide cliente antes de extraer un PDF y ejecuta IA solo una vez al continuar", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.iaBalanceDisponible.mockReturnValue(true);
    mocks.ingerir.mockResolvedValue(ingestaDocumento());
    const extraccionDocumento = {
      ...resultadoTransform(),
      modo: "documento" as const,
    };
    mocks.extraerBalance.mockResolvedValue({
      resultado: extraccionDocumento,
      origenExtraccion: "ia",
      spec: null,
    });
    const archivo = new File(["pdf"], "balance.pdf", {
      type: "application/pdf",
    });

    const pendiente = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, null, null, archivo),
    );
    expect(pendiente).toMatchObject({
      ok: false,
      requiereCliente: true,
    });
    expect(pendiente.sugerencia).toBeUndefined();
    expect(mocks.extraerBalance).not.toHaveBeenCalled();

    const continuado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, null, 7, archivo),
    );
    expect(continuado.ok).toBe(true);
    expect(continuado.sugerencia?.persistida).toBe(true);
    expect(mocks.extraerBalance).toHaveBeenCalledTimes(1);
    expect(mocks.state.staging).toHaveLength(1);
  });

  it("reconoce un NIT autorizado, persiste una vez y recupera el mismo borrador sin cliente explícito", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.ingerir.mockResolvedValue(ingestaTabular("900123456-7"));
    mocks.clientFindMany.mockResolvedValue([
      { id: 7, nit: "900123456-7" },
    ]);

    const primero = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, null, null),
    );
    expect(primero.ok).toBe(true);
    expect(primero.sugerencia?.persistida).toBe(true);
    expect(primero.sugerencia?.render.clienteDetectadoId).toBe(7);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);

    await expect(
      leerBalance({}, formLectura(LOTE_ID_NUEVO, null, null)),
    ).rejects.toThrow(`REDIRECT:/balance/borradores/${LOTE_ID_NUEVO}`);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);
  });

  it("pide selección y no persiste si el NIT pertenece a un cliente fuera del alcance", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.ingerir.mockResolvedValue(ingestaTabular("900123456-7"));
    mocks.clientFindMany.mockResolvedValue([
      { id: 7, nit: "900123456-7" },
    ]);
    mocks.authorizePermiso.mockImplementation(async (
      _permiso: string,
      opciones?: { clientId?: number },
    ) => opciones?.clientId
      ? { ok: false, message: "Cliente fuera del alcance." }
      : { ok: true, role: "staff" });

    const resultado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, null, null),
    );

    expect(resultado).toMatchObject({
      ok: false,
      requiereCliente: true,
      nitDetectado: "900123456",
      sugerencia: {
        persistida: false,
        render: { clienteDetectadoId: null },
      },
    });
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
    expect(mocks.state.lotes).toHaveLength(0);
    expect(mocks.state.staging).toHaveLength(0);
  });

  it("permite cambiar el cliente al reprocesar un borrador cuyo archivo no traía NIT", async () => {
    mocks.state.lotes[0]!.nitDetectado = null;

    const resultado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, LOTE_ID, 8),
    );

    expect(resultado.ok).toBe(true);
    expect(resultado.sugerencia?.persistida).toBe(true);
    expect(resultado.sugerencia?.render.clienteDetectadoId).toBe(8);
    expect(mocks.state.lotes).toEqual([
      expect.objectContaining({
        loteId: LOTE_ID_NUEVO,
        clienteId: 8,
      }),
    ]);
    expect(mocks.state.staging).toEqual([
      expect.objectContaining({
        loteId: LOTE_ID_NUEVO,
        clienteId: 8,
      }),
    ]);
  });

  it("impide cambiar el cliente de un borrador respaldado por el NIT del archivo", async () => {
    const resultado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, LOTE_ID, 8),
    );

    expect(resultado).toMatchObject({
      ok: false,
      message: "El cliente elegido no corresponde al borrador que se va a reprocesar.",
    });
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
    expect(mocks.state.lotes).toEqual([
      expect.objectContaining({ loteId: LOTE_ID, clienteId: 7 }),
    ]);
    expect(mocks.state.staging).toEqual([
      expect.objectContaining({ loteId: LOTE_ID, clienteId: 7 }),
    ]);
  });

  it("revierte todos los bloques si el proceso se corta entre lotes de staging", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.flags.fallarSegundoBloqueStaging = true;
    mocks.parseBalanceWorkbook.mockResolvedValue({
      filas: filasImportacion(2_001),
      errores: [],
    });

    const form = formLectura();
    expect(form.get("clienteId")).toBe("7");
    const resultado = await leerBalance({}, form);

    expect(resultado.ok).toBe(false);
    expect(mocks.flags.bloquesStaging).toBe(2);
    expect(mocks.state.lotes).toHaveLength(0);
    expect(mocks.state.staging).toHaveLength(0);
  });

  it("persiste 4.001 filas completas y devuelve una revisión compacta", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;
    mocks.parseBalanceWorkbook.mockResolvedValue({
      filas: filasImportacion(4_001),
      errores: [],
    });

    const resultado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO),
    );

    expect(resultado.ok).toBe(true);
    expect(mocks.flags.bloquesStaging).toBe(3);
    expect(mocks.state.staging).toHaveLength(4_001);
    expect(resultado.sugerencia?.render.importReady).toHaveLength(200);
    expect(resultado.sugerencia?.render.totalCuentas).toBe(4_001);
  });

  it("reutiliza el UUID de lectura después de perder la respuesta y no duplica el borrador", async () => {
    mocks.state.lotes.length = 0;
    mocks.state.staging.length = 0;

    const form = formLectura();
    expect(form.get("clienteId")).toBe("7");
    const primero = await leerBalance({}, form);
    expect(primero.ok).toBe(true);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);

    await expect(leerBalance({}, formLectura()))
      .rejects.toThrow(`REDIRECT:/balance/borradores/${LOTE_ID}`);

    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);
  });

  it("revierte el borrador nuevo completo si falla la purga del lote reemplazado", async () => {
    mocks.flags.fallarPurgaLote = true;

    const resultado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, LOTE_ID),
    );

    expect(resultado.ok).toBe(false);
    expect(mocks.state.lotes).toEqual([
      expect.objectContaining({ loteId: LOTE_ID }),
    ]);
    expect(mocks.state.staging).toEqual([
      expect.objectContaining({ loteId: LOTE_ID }),
    ]);
    expect(mocks.state.diagnosticos).toEqual([
      { loteId: LOTE_ID, resultado: "borrador" },
    ]);
  });

  it("revierte también el descarte si no puede eliminar el encabezado", async () => {
    mocks.flags.fallarPurgaLote = true;

    const resultado = await descartarBorrador(LOTE_ID);

    expect(resultado.ok).toBe(false);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);
  });

  it("revierte el borrador nuevo si falla el registro atómico de sus correcciones", async () => {
    mocks.correccionFindMany.mockResolvedValue([
      {
        cuenta: "11050501",
        nombre: "Caja",
        tipoFilaForzado: null,
        desacoplada: true,
        omitida: null,
        padreCodigo: null,
      },
    ]);
    mocks.planAplicarCorrecciones.mockReturnValue({
      cambios: [{ filaNum: 1, desacoplada: true }],
      cuentasAplicadas: ["11050501"],
    });
    mocks.flags.fallarMetricasCorreccion = true;

    const resultado = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, LOTE_ID),
    );

    expect(resultado.ok).toBe(false);
    expect(mocks.state.lotes).toEqual([
      expect.objectContaining({ loteId: LOTE_ID }),
    ]);
    expect(mocks.state.staging).toEqual([
      expect.objectContaining({ loteId: LOTE_ID }),
    ]);
    expect(mocks.state.diagnosticos).toEqual([
      { loteId: LOTE_ID, resultado: "borrador" },
    ]);
  });

  it("reintenta un reemplazo tras perder la respuesta sin dejar dos borradores", async () => {
    const primero = await leerBalance(
      {},
      formLectura(LOTE_ID_NUEVO, LOTE_ID),
    );
    expect(primero.ok).toBe(true);
    expect(mocks.state.lotes).toEqual([
      expect.objectContaining({ loteId: LOTE_ID_NUEVO }),
    ]);
    expect(mocks.state.staging).toEqual([
      expect.objectContaining({ loteId: LOTE_ID_NUEVO }),
    ]);
    expect(mocks.state.diagnosticos).toEqual([
      { loteId: LOTE_ID, resultado: "reemplazado" },
    ]);

    await expect(
      leerBalance({}, formLectura(LOTE_ID_NUEVO, LOTE_ID)),
    ).rejects.toThrow(`REDIRECT:/balance/borradores/${LOTE_ID_NUEVO}`);

    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.lotes[0]?.loteId).toBe(LOTE_ID_NUEVO);
    expect(mocks.state.staging).toHaveLength(1);
    expect(mocks.state.staging[0]?.loteId).toBe(LOTE_ID_NUEVO);
  });

  it("impide modificar, descartar o vincular un borrador histórico ajeno", async () => {
    mocks.state.lotes[0]!.clienteId = null;
    mocks.state.lotes[0]!.cargadoPorId = 99;
    mocks.puedeVerBorrador.mockReturnValue(false);

    const periodo = await actualizarPeriodoBorrador(
      LOTE_ID,
      "2026-02-01",
      "2026-02-28",
    );
    const descarte = await descartarBorrador(LOTE_ID);
    const vinculacion = await asignarClienteBorrador(LOTE_ID, 7);

    expect(periodo.ok).toBe(false);
    expect(descarte.ok).toBe(false);
    expect(vinculacion.ok).toBe(false);
    expect(mocks.state.lotes).toHaveLength(1);
    expect(mocks.state.staging).toHaveLength(1);
  });
});

describe("homologar, re-homologar, congelar y descongelar un balance cargado: Senior asignado", () => {
  function form(campos: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  }

  const acciones: [string, () => Promise<{ ok?: boolean; message?: string }>][] = [
    ["congelar", () => freezeBalance(form({ id: "41" }))],
    ["descongelar", () => descongelarBalance({ id: 41, justificacion: "Corrección de la homologación de la 1305" })],
    ["homologar una cuenta", () => asignarCuentaEstandar(form({ detalleId: "7", codigo: "130505", alcance: "cuenta" }))],
    ["dejar una cuenta pendiente", () => marcarCuentaPendiente(form({ detalleId: "7", alcance: "cuenta" }))],
    ["quitar el pendiente", () => quitarPendiente(form({ detalleId: "7", alcance: "cuenta" }))],
    ["re-homologar el balance", () => reaplicarMapeoBalance(form({ id: "41" }))],
    ["re-homologar los balances del cliente", () => reaplicarMapeoBalancesCliente(form({ clienteId: "7" }))],
  ];

  it.each(acciones)("%s exige balance:revisar: el Staff (que carga con balance:crear) no puede", async (_nombre, ejecutar) => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockImplementation(async (permiso: string) =>
      permiso === "balance:revisar"
        ? { ok: false, message: "No tienes permisos para esta acción." }
        : { ok: true, role: "Staff" });

    const resultado = await ejecutar();

    expect(resultado).toMatchObject({ ok: false, message: "No tienes permisos para esta acción." });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("balance:revisar");
    expect(mocks.authorizePermiso).not.toHaveBeenCalledWith("balance:crear");
    expect(mocks.authorizePermiso).not.toHaveBeenCalledWith("balance:editar");
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
  });
});

describe("eliminar, reemplazar y borradores: también el senior asignado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.balances.length = 0;
    mocks.state.lotes.splice(0, mocks.state.lotes.length, loteBorrador());
    mocks.state.staging.splice(0, mocks.state.staging.length, filaStaging());
    mocks.flags.fallarPurgaLote = false;
    mocks.puedeVerBorrador.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: 5, name: "Senior", role: "Senior" });
  });

  // El senior asignado tiene `balance:revisar`; no tiene `balance:crear` ni `balance:eliminar`.
  const comoSenior = (fueraDeCartera = false) =>
    mocks.authorizePermiso.mockImplementation(async (permiso: string, opciones?: { clientId?: number }) =>
      permiso !== "balance:revisar"
        ? { ok: false, message: "No tienes permisos para esta acción." }
        : fueraDeCartera && opciones?.clientId
          ? { ok: false, message: "No tienes alcance sobre este cliente." }
          : { ok: true, role: "Senior" });

  it("el Staff (sin eliminar ni revisar) no elimina balances", async () => {
    mocks.authorizePermiso.mockImplementation(async (permiso: string) =>
      permiso === "balance:crear" ? { ok: true, role: "Staff" } : { ok: false, message: "No tienes permisos para esta acción." });

    const resultado = await eliminarBalance({ balanceId: 41, alcance: "version" });

    expect(resultado).toMatchObject({ ok: false, message: "No tienes permisos para esta acción." });
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
  });

  it("el senior no elimina el historial del cliente con sus perfiles de carga", async () => {
    comoSenior();

    const resultado = await eliminarBalance({ balanceId: 41, alcance: "cliente_perfiles" });

    expect(resultado).toMatchObject({ ok: false, message: "Eliminar todo el historial del cliente con sus perfiles de carga lo hace un administrador." });
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
  });

  it("el senior elimina una versión solo de un cliente de su cartera", async () => {
    mocks.state.balances.push({ id: 41, loteId: null, clienteId: 7, periodo: "Enero 2026", version: "v1", advertenciaArchivoFuente: false, diferenciaArchivoFuente: null, aperturaBalance: null });
    comoSenior(true);

    const resultado = await eliminarBalance({ balanceId: 41, alcance: "version" });

    expect(resultado).toMatchObject({ ok: false, message: "No tienes alcance sobre este cliente." });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("balance:revisar", { clientId: 7 });
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
  });

  it("el senior compara el borrador con su corte (solo lectura) dentro de su cartera", async () => {
    comoSenior(true);

    const resultado = await compararBorradorConCorte({ loteId: LOTE_ID, clienteId: 7, periodoInicio: "2026-01-01", periodoFin: "2026-01-31", aperturaBalance: null });

    expect(resultado).toMatchObject({ ok: false, message: "No tienes alcance sobre este cliente." });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("balance:revisar", { clientId: 7 });
  });

  it("el senior reemplaza un balance conciliado sin pedir `balance:eliminar`", async () => {
    comoSenior(true);
    mocks.tx.balancePruebaEncabezado.findMany.mockResolvedValueOnce([
      { id: 41, clienteId: 7, periodo: "Diciembre 2025" },
      { id: 42, clienteId: 7, periodo: "Enero 2025 – Diciembre 2025" },
    ] as never);

    const resultado = await reemplazarBalanceConciliado({ balanceNuevoId: 42, balanceViejoId: 41 });

    expect(resultado).toMatchObject({ ok: false, message: "No tienes alcance sobre este cliente." });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("balance:revisar", { clientId: 7 });
    expect(mocks.authorizePermiso).not.toHaveBeenCalledWith("balance:eliminar");
    expect(mocks.authorizePermiso).not.toHaveBeenCalledWith("balance:eliminar", { clientId: 7 });
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
  });

  it("el Staff no reemplaza un balance conciliado", async () => {
    mocks.authorizePermiso.mockImplementation(async (permiso: string) =>
      permiso === "balance:crear" ? { ok: true, role: "Staff" } : { ok: false, message: "No tienes permisos para esta acción." });

    const resultado = await reemplazarBalanceConciliado({ balanceNuevoId: 42, balanceViejoId: 41 });

    expect(resultado).toMatchObject({ ok: false, message: "No tienes permisos para esta acción." });
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
  });

  it("el senior descarta un borrador de su cliente", async () => {
    comoSenior();

    const resultado = await descartarBorrador(LOTE_ID);

    expect(resultado).toMatchObject({ ok: true });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("balance:revisar", { clientId: 7 });
    expect(mocks.state.lotes).toHaveLength(0);
    expect(mocks.state.staging).toHaveLength(0);
  });
});
