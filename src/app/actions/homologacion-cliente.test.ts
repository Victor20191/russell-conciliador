import { beforeEach, describe, expect, it, vi } from "vitest";

// Falso Prisma en memoria: implementa SOLO las formas de consulta que de
// verdad emite `homologacion-cliente-servidor.ts` (no es un motor genérico).
// Se usa TANTO para `prisma` como para `tx`: la transacción mock ejecuta el
// callback contra el mismo estado, con snapshot/restore para simular rollback.
type Encabezado = {
  id: number;
  clienteId: number;
  periodo: string;
  loteId: string | null;
  estaCongelado: boolean;
  creadoEn: Date;
  mapeadas: number;
  sinMapear: number;
  completitud: number;
};
type Detalle = {
  id: number;
  encabezadoId: number;
  cuenta6: string;
  cuenta8: string;
  nombreCuenta: string;
  cuenta6Russell: string | null;
  coincidencia: number | null;
};
type TerceroEncabezado = { id: number; loteId: string | null };
type TerceroDetalle = {
  id: number;
  encabezadoId: number;
  cuenta6: string;
  cuenta8: string;
  cuenta6Russell: string | null;
  coincidencia: number | null;
};
type CuentaCliente = {
  id: number;
  clienteId: number;
  code: string;
  level: number;
  name: string;
  clientName: string;
  nit: string | null;
  cuenta6Russell: string | null;
  coincidencia: number | null;
  origenMapeo: string | null;
  actualizadoPor: string | null;
  actualizadoEn: Date | null;
};
type Filtro = { cuenta6: string } | { cuenta8: string };

function coincideFiltro(fila: { cuenta6: string; cuenta8: string }, filtro: Filtro): boolean {
  return "cuenta6" in filtro ? fila.cuenta6 === filtro.cuenta6 : fila.cuenta8 === filtro.cuenta8;
}

const mocks = vi.hoisted(() => {
  const state: {
    encabezados: Encabezado[];
    detalles: Detalle[];
    tercEncabezados: TerceroEncabezado[];
    tercDetalles: TerceroDetalle[];
    cuentas: CuentaCliente[];
    clientes: { id: number; name: string; nit: string | null }[];
    estandares: Set<string>;
    idsCuenta: number;
  } = {
    encabezados: [],
    detalles: [],
    tercEncabezados: [],
    tercDetalles: [],
    cuentas: [],
    clientes: [],
    estandares: new Set(),
    idsCuenta: 1000,
  };

  const flags = { fallarEnTransaccion: null as null | string };

  function detallesDeEncabezado(encabezadoId: number): Detalle[] {
    return state.detalles.filter((d) => d.encabezadoId === encabezadoId);
  }

  const client = {
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
      const c = state.clientes.find((c) => c.id === where.id);
      return c ? { name: c.name, nit: c.nit } : null;
    }),
  };

  const standardAccount = {
    findUnique: vi.fn(async ({ where }: { where: { code: string } }) =>
      state.estandares.has(where.code) ? { code: where.code } : null),
  };

  const balancePruebaEncabezado = {
    count: vi.fn(
      async ({
        where,
      }: {
        where: { clienteId: number; estaCongelado: boolean; detalles?: { some: Filtro } };
      }) =>
        state.encabezados.filter(
          (e) =>
            e.clienteId === where.clienteId &&
            e.estaCongelado === where.estaCongelado &&
            (!where.detalles || detallesDeEncabezado(e.id).some((d) => coincideFiltro(d, where.detalles!.some))),
        ).length,
    ),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { clienteId: number; estaCongelado: boolean; detalles?: { some: Filtro } };
      }) =>
        state.encabezados
          .filter(
            (e) =>
              e.clienteId === where.clienteId &&
              e.estaCongelado === where.estaCongelado &&
              (!where.detalles || detallesDeEncabezado(e.id).some((d) => coincideFiltro(d, where.detalles!.some))),
          )
          .map((e) => ({ id: e.id, periodo: e.periodo, loteId: e.loteId })),
    ),
    update: vi.fn(async ({ where, data }: { where: { id: number }; data: Partial<Encabezado> }) => {
      const enc = state.encabezados.find((e) => e.id === where.id);
      if (!enc) throw new Error("Encabezado inexistente");
      Object.assign(enc, data);
      return enc;
    }),
  };

  const balancePruebaDetalle = {
    count: vi.fn(
      async ({
        where,
      }: {
        where: Filtro & { encabezado: { clienteId: number; estaCongelado: boolean } };
      }) => {
        const { encabezado, ...filtro } = where;
        return state.detalles.filter((d) => {
          const enc = state.encabezados.find((e) => e.id === d.encabezadoId);
          if (!enc) return false;
          if (enc.clienteId !== encabezado.clienteId || enc.estaCongelado !== encabezado.estaCongelado) return false;
          return coincideFiltro(d, filtro as Filtro);
        }).length;
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Filtro & { encabezadoId: { in: number[] } };
        data: { cuenta6Russell: string; coincidencia: number };
      }) => {
        const { encabezadoId, ...filtro } = where;
        let count = 0;
        for (const d of state.detalles) {
          if (!encabezadoId.in.includes(d.encabezadoId)) continue;
          if (!coincideFiltro(d, filtro as Filtro)) continue;
          d.cuenta6Russell = data.cuenta6Russell;
          d.coincidencia = data.coincidencia;
          count += 1;
        }
        if (flags.fallarEnTransaccion === "detalle") throw new Error("Fallo inyectado al migrar el detalle");
        return { count };
      },
    ),
    groupBy: vi.fn(
      async ({
        where,
      }: {
        where: { encabezadoId: { in: number[] }; cuenta6Russell?: { not: null } };
      }) => {
        const filas = state.detalles.filter(
          (d) => where.encabezadoId.in.includes(d.encabezadoId) && (!where.cuenta6Russell || d.cuenta6Russell != null),
        );
        const porEncabezado = new Map<number, number>();
        for (const d of filas) porEncabezado.set(d.encabezadoId, (porEncabezado.get(d.encabezadoId) ?? 0) + 1);
        return [...porEncabezado.entries()].map(([encabezadoId, n]) => ({ encabezadoId, _count: { _all: n } }));
      },
    ),
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: Filtro & { encabezado: { clienteId: number } };
      }) => {
        const { encabezado, ...filtro } = where;
        const candidatas = state.detalles
          .map((d) => ({ d, enc: state.encabezados.find((e) => e.id === d.encabezadoId) }))
          .filter(
            (x): x is { d: Detalle; enc: Encabezado } =>
              x.enc != null && x.enc.clienteId === encabezado.clienteId && coincideFiltro(x.d, filtro as Filtro),
          )
          .sort((a, b) => b.enc.creadoEn.getTime() - a.enc.creadoEn.getTime());
        return candidatas[0] ? { nombreCuenta: candidatas[0].d.nombreCuenta } : null;
      },
    ),
  };

  const balanceTerceroEncabezado = {
    findMany: vi.fn(async ({ where }: { where: { loteId: { in: string[] } } }) =>
      state.tercEncabezados.filter((t) => t.loteId != null && where.loteId.in.includes(t.loteId)).map((t) => ({ id: t.id }))),
  };

  const balanceTerceroDetalle = {
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Filtro & { encabezadoId: { in: number[] } };
        data: { cuenta6Russell: string; coincidencia: number };
      }) => {
        const { encabezadoId, ...filtro } = where;
        let count = 0;
        for (const d of state.tercDetalles) {
          if (!encabezadoId.in.includes(d.encabezadoId)) continue;
          if (!coincideFiltro(d, filtro as Filtro)) continue;
          d.cuenta6Russell = data.cuenta6Russell;
          d.coincidencia = data.coincidencia;
          count += 1;
        }
        return { count };
      },
    ),
  };

  const clientAccount = {
    count: vi.fn(
      async ({
        where,
      }: {
        where: { clienteId: number; origenMapeo: string; code: { startsWith: string }; NOT?: { code: string } };
      }) =>
        state.cuentas.filter(
          (c) =>
            c.clienteId === where.clienteId &&
            c.origenMapeo === where.origenMapeo &&
            c.code.startsWith(where.code.startsWith) &&
            (!where.NOT || c.code !== where.NOT.code),
        ).length,
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { clienteId: number; code: { startsWith: string }; NOT?: { code: string } };
        data: Partial<CuentaCliente>;
      }) => {
        let count = 0;
        for (const c of state.cuentas) {
          if (c.clienteId !== where.clienteId) continue;
          if (!c.code.startsWith(where.code.startsWith)) continue;
          if (where.NOT && c.code === where.NOT.code) continue;
          Object.assign(c, data);
          count += 1;
        }
        if (flags.fallarEnTransaccion === "clientAccountUpdateMany") throw new Error("Fallo inyectado al propagar el grupo");
        return { count };
      },
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { clienteId_code: { clienteId: number; code: string } };
        create: Omit<CuentaCliente, "id">;
        update: Partial<CuentaCliente>;
      }) => {
        if (flags.fallarEnTransaccion === "clientAccountUpsert") throw new Error("Fallo inyectado al memorizar la regla");
        const existente = state.cuentas.find(
          (c) => c.clienteId === where.clienteId_code.clienteId && c.code === where.clienteId_code.code,
        );
        if (existente) {
          Object.assign(existente, update);
          return existente;
        }
        const nueva: CuentaCliente = { id: state.idsCuenta++, ...create };
        state.cuentas.push(nueva);
        return nueva;
      },
    ),
  };

  const dbMock = {
    client,
    standardAccount,
    balancePruebaEncabezado,
    balancePruebaDetalle,
    balanceTerceroEncabezado,
    balanceTerceroDetalle,
    clientAccount,
  };

  const ejecutarTransaccion = vi.fn(async (callback: (tx: typeof dbMock) => Promise<unknown>) => {
    const snapshot = structuredClone({
      encabezados: state.encabezados,
      detalles: state.detalles,
      tercEncabezados: state.tercEncabezados,
      tercDetalles: state.tercDetalles,
      cuentas: state.cuentas,
    });
    try {
      return await callback(dbMock);
    } catch (error) {
      state.encabezados.splice(0, state.encabezados.length, ...snapshot.encabezados);
      state.detalles.splice(0, state.detalles.length, ...snapshot.detalles);
      state.tercEncabezados.splice(0, state.tercEncabezados.length, ...snapshot.tercEncabezados);
      state.tercDetalles.splice(0, state.tercDetalles.length, ...snapshot.tercDetalles);
      state.cuentas.splice(0, state.cuentas.length, ...snapshot.cuentas);
      throw error;
    }
  });

  return {
    state,
    flags,
    dbMock,
    ejecutarTransaccion,
    authorizePermiso: vi.fn<(permiso: string, opts?: { clientId?: number | null }) => Promise<{ ok: boolean; message?: string; userId?: number; role?: string }>>()
      .mockResolvedValue({ ok: true, userId: 1, role: "staff" }),
    tomarCandadoTransaccion: vi.fn<(tx: unknown, recurso: string) => Promise<void>>().mockResolvedValue(undefined),
    getCurrentUser: vi.fn(async () => ({ id: 1, name: "Analista" })),
    logAudit: vi.fn(async () => undefined),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
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
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({
  mensajeErrorBD: (_contexto: string, e: unknown) => `ERROR:${e instanceof Error ? e.message : String(e)}`,
  registrarError: () => undefined,
}));
vi.mock("@/lib/concurrency", () => ({
  tomarCandadoTransaccion: mocks.tomarCandadoTransaccion,
  transaccionSerializable: mocks.ejecutarTransaccion,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.dbMock }));

import { consultarImpactoHomologacionCliente, guardarHomologacionCliente } from "./homologacion-cliente";

function form(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

function encabezado(overrides: Partial<Encabezado> & { id: number; clienteId: number }): Encabezado {
  return {
    periodo: "Enero 2026",
    loteId: null,
    estaCongelado: false,
    creadoEn: new Date("2026-01-15T00:00:00.000Z"),
    mapeadas: 0,
    sinMapear: 1,
    completitud: 0,
    ...overrides,
  };
}

function detalle(overrides: Partial<Detalle> & { id: number; encabezadoId: number; cuenta8: string }): Detalle {
  return {
    cuenta6: overrides.cuenta8.slice(0, 6),
    nombreCuenta: `Cuenta ${overrides.cuenta8}`,
    cuenta6Russell: "999999",
    coincidencia: 80,
    ...overrides,
  };
}

describe("guardarHomologacionCliente / consultarImpactoHomologacionCliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.encabezados.length = 0;
    mocks.state.detalles.length = 0;
    mocks.state.tercEncabezados.length = 0;
    mocks.state.tercDetalles.length = 0;
    mocks.state.cuentas.length = 0;
    mocks.state.clientes.splice(0, mocks.state.clientes.length, { id: 7, name: "Cliente Uno", nit: "900-1" }, { id: 99, name: "Cliente Dos", nit: "900-2" });
    mocks.state.estandares = new Set(["110505", "410506"]);
    mocks.state.idsCuenta = 1000;
    mocks.flags.fallarEnTransaccion = null;
    mocks.tomarCandadoTransaccion.mockReset().mockResolvedValue(undefined);
    mocks.authorizePermiso.mockResolvedValue({ ok: true, userId: 1, role: "staff" });
    mocks.getCurrentUser.mockResolvedValue({ id: 1, name: "Analista" });
  });

  it("deniega por alcance de cartera antes de leer cliente/estándar (scope denial)", async () => {
    mocks.authorizePermiso.mockImplementation(async (_permiso: string, opts?: { clientId?: number | null }) =>
      opts?.clientId ? { ok: false, message: "Cliente fuera del alcance." } : { ok: true, userId: 1, role: "staff" });

    const resultado = await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "110505", codigo: "110505", alcance: "grupo" }),
    );

    expect(resultado).toEqual({ ok: false, message: "Cliente fuera del alcance." });
    expect(mocks.dbMock.client.findUnique).not.toHaveBeenCalled();
    expect(mocks.ejecutarTransaccion).not.toHaveBeenCalled();
  });

  it("incluye un período cargado antes de adquirir el candado del PUC", async () => {
    mocks.state.encabezados.push(encabezado({ id: 1, clienteId: 7 }));
    mocks.state.detalles.push(detalle({ id: 1, encabezadoId: 1, cuenta8: "1105050001" }));
    mocks.tomarCandadoTransaccion.mockImplementationOnce(async () => {
      mocks.state.encabezados.push(encabezado({ id: 2, clienteId: 7, periodo: "Febrero 2026" }));
      mocks.state.detalles.push(detalle({ id: 2, encabezadoId: 2, cuenta8: "1105050001" }));
    });
    const r = await guardarHomologacionCliente(undefined, form({ clienteId: "7", cuentaCliente: "1105050001", codigo: "110505", alcance: "solo", aplicarExistentes: "1" }));
    expect(r.ok).toBe(true);
    expect(mocks.state.detalles.map((d) => d.cuenta6Russell)).toEqual(["110505", "110505"]);
    expect(mocks.tomarCandadoTransaccion.mock.calls.map((c) => c[1])).toEqual(["balance-puc:7", "balance-oficial:7:Enero 2026", "balance-oficial:7:Febrero 2026"]);
  });

  it("revalida si un balance se congela mientras espera su candado", async () => {
    mocks.state.encabezados.push(encabezado({ id: 1, clienteId: 7 }));
    mocks.state.detalles.push(detalle({ id: 1, encabezadoId: 1, cuenta8: "1105050001" }));
    mocks.tomarCandadoTransaccion.mockImplementation(async (_tx, recurso) => {
      if (recurso === "balance-oficial:7:Enero 2026") mocks.state.encabezados[0].estaCongelado = true;
    });
    const r = await guardarHomologacionCliente(undefined, form({ clienteId: "7", cuentaCliente: "1105050001", codigo: "110505", alcance: "solo", aplicarExistentes: "1" }));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("1 balance(s) congelado(s)");
    expect(mocks.state.detalles[0].cuenta6Russell).toBe("999999");
    expect(mocks.dbMock.balancePruebaDetalle.updateMany).not.toHaveBeenCalled();
  });

  it("crear la regla grupal no usa el nombre de una auxiliar como nombre del grupo", async () => {
    mocks.state.encabezados.push(encabezado({ id: 1, clienteId: 7 }));
    mocks.state.detalles.push(detalle({ id: 1, encabezadoId: 1, cuenta8: "1105050001", nombreCuenta: "Caja sede norte" }));
    await guardarHomologacionCliente(undefined, form({ clienteId: "7", cuentaCliente: "1105050001", codigo: "110505", alcance: "grupo" }));
    expect(mocks.state.cuentas.find((c) => c.code === "110505")?.name).toBe("110505");
  });

  it("con el flag de migración ausente o malformado, solo memoriza (future-only)", async () => {
    mocks.state.encabezados.push(encabezado({ id: 1, clienteId: 7 }));
    mocks.state.detalles.push(detalle({ id: 1, encabezadoId: 1, cuenta8: "11050501" }));

    // Ausente
    const sinFlag = await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "11050501", codigo: "110505", alcance: "solo" }),
    );
    expect(sinFlag.ok).toBe(true);
    expect(mocks.state.detalles[0]?.cuenta6Russell).toBe("999999"); // sin tocar

    // Malformado ("true" en vez de "1")
    const malformado = await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "11050501", codigo: "110505", alcance: "solo", aplicarExistentes: "true" }),
    );
    expect(malformado.ok).toBe(true);
    expect(mocks.state.detalles[0]?.cuenta6Russell).toBe("999999"); // sigue sin tocar

    // La memoria SIEMPRE se escribe, aunque no se migre nada.
    expect(mocks.state.cuentas.find((c) => c.code === "11050501")?.cuenta6Russell).toBe("110505");
    expect(mocks.dbMock.balancePruebaDetalle.updateMany).not.toHaveBeenCalled();
  });

  it("alcance «solo» con código largo NO afecta hermanas ni descendientes", async () => {
    mocks.state.encabezados.push(encabezado({ id: 1, clienteId: 7 }));
    mocks.state.detalles.push(
      detalle({ id: 1, encabezadoId: 1, cuenta8: "1105050001" }), // objetivo (10 dígitos)
      detalle({ id: 2, encabezadoId: 1, cuenta8: "1105050002" }), // hermana
      detalle({ id: 3, encabezadoId: 1, cuenta8: "110505000101" }), // descendiente (12 dígitos)
      detalle({ id: 4, encabezadoId: 1, cuenta8: "110505" }), // grupo (6 dígitos)
    );

    const resultado = await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "1105050001", codigo: "110505", alcance: "solo", aplicarExistentes: "1" }),
    );

    expect(resultado.ok).toBe(true);
    expect(mocks.state.detalles.find((d) => d.id === 1)?.cuenta6Russell).toBe("110505");
    expect(mocks.state.detalles.find((d) => d.id === 2)?.cuenta6Russell).toBe("999999");
    expect(mocks.state.detalles.find((d) => d.id === 3)?.cuenta6Russell).toBe("999999");
    expect(mocks.state.detalles.find((d) => d.id === 4)?.cuenta6Russell).toBe("999999");
    // Memoria: excepción de esa sola cuenta, no regla de grupo.
    const fila = mocks.state.cuentas.find((c) => c.code === "1105050001");
    expect(fila?.origenMapeo).toBe("manual_cuenta");
  });

  it("alcance «grupo» propaga a las imputables y pisa excepciones existentes", async () => {
    mocks.state.encabezados.push(encabezado({ id: 1, clienteId: 7 }));
    mocks.state.detalles.push(
      detalle({ id: 1, encabezadoId: 1, cuenta8: "110505" }),
      detalle({ id: 2, encabezadoId: 1, cuenta8: "11050501" }),
      detalle({ id: 3, encabezadoId: 1, cuenta8: "11050502" }),
    );
    mocks.state.cuentas.push({
      id: 1,
      clienteId: 7,
      code: "11050501",
      level: 8,
      name: "Excepción previa",
      clientName: "Cliente Uno",
      nit: "900-1",
      cuenta6Russell: "410506",
      coincidencia: 100,
      origenMapeo: "manual_cuenta",
      actualizadoPor: "Otro",
      actualizadoEn: new Date("2026-01-01T00:00:00.000Z"),
    });

    const resultado = await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "110505", codigo: "110505", alcance: "grupo", aplicarExistentes: "1" }),
    );

    expect(resultado.ok).toBe(true);
    for (const id of [1, 2, 3]) {
      expect(mocks.state.detalles.find((d) => d.id === id)?.cuenta6Russell).toBe("110505");
    }
    const canonica = mocks.state.cuentas.find((c) => c.code === "110505");
    expect(canonica?.origenMapeo).toBe("manual");
    const excepcionPisada = mocks.state.cuentas.find((c) => c.code === "11050501");
    expect(excepcionPisada?.origenMapeo).toBe("manual");
    expect(excepcionPisada?.cuenta6Russell).toBe("110505");
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.stringContaining("excepción") }),
    );
  });

  it("excluye del contador y de la migración los balances congelados (frozen excluded)", async () => {
    mocks.state.encabezados.push(
      encabezado({ id: 1, clienteId: 7, estaCongelado: false }),
      encabezado({ id: 2, clienteId: 7, estaCongelado: true, periodo: "Diciembre 2025" }),
    );
    mocks.state.detalles.push(
      detalle({ id: 1, encabezadoId: 1, cuenta8: "11050501" }),
      detalle({ id: 2, encabezadoId: 2, cuenta8: "11050501" }),
    );

    const resultado = await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "11050501", codigo: "110505", alcance: "solo", aplicarExistentes: "1" }),
    );

    expect(resultado.ok).toBe(true);
    expect(mocks.state.detalles.find((d) => d.id === 1)?.cuenta6Russell).toBe("110505");
    expect(mocks.state.detalles.find((d) => d.id === 2)?.cuenta6Russell).toBe("999999"); // congelado, intacto
    if (resultado.ok) expect(resultado.message).toContain("1 balance(s) congelado(s)");
  });

  it("aísla por cliente: no toca datos de otro cliente (tenant isolation)", async () => {
    mocks.state.encabezados.push(
      encabezado({ id: 1, clienteId: 7 }),
      encabezado({ id: 2, clienteId: 99 }),
    );
    mocks.state.detalles.push(
      detalle({ id: 1, encabezadoId: 1, cuenta8: "11050501" }),
      detalle({ id: 2, encabezadoId: 2, cuenta8: "11050501" }),
    );

    await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "11050501", codigo: "110505", alcance: "solo", aplicarExistentes: "1" }),
    );

    expect(mocks.state.detalles.find((d) => d.id === 1)?.cuenta6Russell).toBe("110505");
    expect(mocks.state.detalles.find((d) => d.id === 2)?.cuenta6Russell).toBe("999999");
    expect(mocks.state.cuentas.some((c) => c.clienteId === 99)).toBe(false);
  });

  it("sincroniza el balance por tercero ligado por loteId (linked third parties)", async () => {
    mocks.state.encabezados.push(encabezado({ id: 1, clienteId: 7, loteId: "LOTE-A" }));
    mocks.state.detalles.push(detalle({ id: 1, encabezadoId: 1, cuenta8: "11050501" }));
    mocks.state.tercEncabezados.push({ id: 50, loteId: "LOTE-A" }, { id: 51, loteId: "LOTE-OTRO" });
    mocks.state.tercDetalles.push(
      { id: 1, encabezadoId: 50, cuenta6: "110505", cuenta8: "11050501", cuenta6Russell: "999999", coincidencia: 80 },
      { id: 2, encabezadoId: 51, cuenta6: "110505", cuenta8: "11050501", cuenta6Russell: "999999", coincidencia: 80 },
    );

    await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "11050501", codigo: "110505", alcance: "solo", aplicarExistentes: "1" }),
    );

    expect(mocks.state.tercDetalles.find((d) => d.id === 1)?.cuenta6Russell).toBe("110505");
    expect(mocks.state.tercDetalles.find((d) => d.id === 2)?.cuenta6Russell).toBe("999999"); // lote no ligado
  });

  it("revierte todo si falla la escritura dentro de la transacción (rollback failure)", async () => {
    mocks.state.encabezados.push(encabezado({ id: 1, clienteId: 7 }));
    mocks.state.detalles.push(detalle({ id: 1, encabezadoId: 1, cuenta8: "11050501" }));
    mocks.flags.fallarEnTransaccion = "clientAccountUpsert";

    const resultado = await guardarHomologacionCliente(
      undefined,
      form({ clienteId: "7", cuentaCliente: "11050501", codigo: "110505", alcance: "solo", aplicarExistentes: "1" }),
    );

    expect(resultado.ok).toBe(false);
    expect(mocks.state.detalles.find((d) => d.id === 1)?.cuenta6Russell).toBe("999999"); // revertido
    expect(mocks.state.cuentas).toHaveLength(0); // revertido
  });

  it("consultarImpactoHomologacionCliente es de solo lectura y refleja congelados/excepciones", async () => {
    mocks.state.encabezados.push(
      encabezado({ id: 1, clienteId: 7 }),
      encabezado({ id: 2, clienteId: 7, estaCongelado: true, periodo: "Diciembre 2025" }),
    );
    mocks.state.detalles.push(
      detalle({ id: 1, encabezadoId: 1, cuenta8: "11050501" }),
      detalle({ id: 2, encabezadoId: 2, cuenta8: "11050501" }),
    );
    mocks.state.cuentas.push({
      id: 1,
      clienteId: 7,
      code: "11050501",
      level: 8,
      name: "Excepción",
      clientName: "Cliente Uno",
      nit: "900-1",
      cuenta6Russell: "410506",
      coincidencia: 100,
      origenMapeo: "manual_cuenta",
      actualizadoPor: null,
      actualizadoEn: null,
    });

    const resultado = await consultarImpactoHomologacionCliente({ clienteId: 7, cuentaCliente: "110505", alcance: "grupo" });

    expect(resultado).toEqual({ ok: true, balances: 1, filas: 1, congelados: 1, excepciones: 1 });
    expect(mocks.dbMock.balancePruebaDetalle.updateMany).not.toHaveBeenCalled();
    expect(mocks.dbMock.clientAccount.upsert).not.toHaveBeenCalled();
  });
});
