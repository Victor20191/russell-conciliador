import { beforeEach, describe, expect, it, vi } from "vitest";

const LOTE_ID = "11111111-1111-4111-8111-111111111111";
const LOTE_ID_NUEVO = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => {
  type Balance = {
    id: number;
    loteId: string | null;
    clienteId: number;
    periodo: string;
    version: string;
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
  const balanceFindMany = vi.fn(async ({ where }: { where: { clienteId: number; periodo: string } }) =>
    state.balances.filter((b) => b.clienteId === where.clienteId && b.periodo === where.periodo));
  const balanceCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const balance: Balance = {
      id: state.balances.length + 1,
      loteId: String(data.loteId),
      clienteId: Number(data.clienteId),
      periodo: String(data.periodo),
      version: String(data.version),
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
    $executeRaw: vi.fn(async () => {
      if (flags.fallarPuc) throw new Error("Fallo inyectado al persistir el PUC");
      state.escriturasPuc.push("puc-atomico");
      return 1;
    }),
    balancePruebaEncabezado: {
      findUnique: balanceFindUnique,
      findMany: balanceFindMany,
      create: balanceCreate,
    },
    balancePruebaDetalle: {
      findMany: vi.fn(async () => []),
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
    ajustesFindUnique: vi.fn(async () => null),
    perfilFindFirst: vi.fn(async () => null),
    perfilFindUnique: vi.fn(async () => null),
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
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
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
      findMany: vi.fn(async () => []),
    },
    ajustesCargaBalance: {
      findUnique: mocks.ajustesFindUnique,
      upsert: mocks.ajustesUpsert,
    },
    perfilCargaBalance: {
      findFirst: mocks.perfilFindFirst,
      findUnique: mocks.perfilFindUnique,
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
  iaBalanceDisponible: vi.fn(() => false),
  proveedorIABalance: vi.fn(() => "anthropic"),
}));
vi.mock("@/lib/ia/proveedor-balance-sesion", () => ({
  proveedorIABalanceSesion: vi.fn(async () => "anthropic"),
}));
vi.mock("@/lib/ia/uso", () => ({ registrarConsumoIA: vi.fn(async () => undefined) }));
vi.mock("@/lib/balance/mapeo-ia", () => ({ mapearPorIA: vi.fn(async () => new Map()) }));
vi.mock("@/lib/balance/mapeo-cliente-config", () => ({
  construirConfigMapeoCliente: vi.fn(() => new Map()),
}));
vi.mock("@/lib/balance/borrador-vm", () => ({
  construirVistaBorrador: vi.fn(() => ({
    diagnostico: {
      movimientos: 1,
      filas: 1,
      partidaDobleDiff: 0,
      ecuacionDiff: 0,
      cuadrado: true,
    },
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
  transformarTabular: vi.fn(),
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
  validarComentarioPromocion: vi.fn(() => ({ ok: true, comentario: null })),
}));
vi.mock("@/lib/balance/preferencias-carga", () => ({
  aplicarPreferenciasCarga: vi.fn((spec) => spec),
}));
vi.mock("@/lib/balance/extraccion/ingesta", () => ({
  ingerir: vi.fn(async () => {
    throw new Error("Sin ingesta especializada");
  }),
}));
vi.mock("@/lib/import/balance", () => ({
  parseBalanceWorkbook: mocks.parseBalanceWorkbook,
}));

import {
  actualizarPeriodoBorrador,
  asignarClienteBorrador,
  cargarBorrador,
  descartarBorrador,
  leerBalance,
} from "./balance";

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
  };
}

function formPromocion() {
  const form = new FormData();
  form.set("clientId", "7");
  form.set("periodoInicio", "2026-01-01");
  form.set("periodoFin", "2026-01-31");
  form.set("loteId", LOTE_ID);
  return form;
}

function formLectura(
  loteIdSolicitud = LOTE_ID,
  loteIdAnterior: string | null = null,
) {
  const valores = new Map<string, FormDataEntryValue>([
    ["clienteId", "7"],
    ["loteIdSolicitud", loteIdSolicitud],
    ["archivo", new File(["contenido"], "balance.xlsx")],
  ]);
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
    mocks.parseBalanceWorkbook.mockResolvedValue({ filas: filasImportacion(1), errores: [] });
  });

  it("promueve dos veces el mismo lote como un único balance y conserva la misma ruta", async () => {
    await expect(cargarBorrador({}, formPromocion()))
      .rejects.toThrow("REDIRECT:/balance/1?cargado=1");

    await expect(cargarBorrador({}, formPromocion()))
      .rejects.toThrow("REDIRECT:/balance/1?cargado=1");

    expect(mocks.state.balances).toHaveLength(1);
    expect(mocks.state.balances[0]).toMatchObject({ loteId: LOTE_ID, version: "v1" });
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
