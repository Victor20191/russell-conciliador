import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usuarios: vi.fn(),
  eventos: vi.fn(),
  accesos: vi.fn(),
  reportes: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: mocks.usuarios },
    auditEntry: { findMany: mocks.eventos },
    accessLog: { groupBy: mocks.accesos },
    reporteEjecutivoUsoIA: { findMany: mocks.reportes },
  },
}));

import { construirComparativoUso, construirUsoComparable } from "./comparativo-servidor";
import { alertaComparativo, alertaUsuarios } from "./comparativo";
import { METODOLOGIA_USO_VIGENTE } from "./metodologia";

const filtro = { modulosPublicados: new Set(["balance"]) };
const nombresClientes = new Map<number, string>();

// Las cuentas reales del caso: 5 personas del equipo, 4 cuentas de prueba o genéricas y 1 de Xentria.
const cuentas = [
  { id: 30, name: "LUISA FERNANDA CHAVARRIA CARMONA", email: "luisachavarria@rbcol.co" },
  { id: 32, name: "SINDY KATERINE ECHEVERRI RAMÍREZ", email: "katerineecheverri@rbcol.co" },
  { id: 59, name: "YULI ALEJANDRA VILLA HIGUITA", email: "alejandravilla@rbcol.co" },
  { id: 33, name: "DARWIN GUZMAN MENA", email: "darwinguzman@rbcol.co" },
  { id: 25, name: "ERICA MARIA VERGARA SALAZAR", email: "ericavergara@rbcol.co" },
  { id: 86, name: "Camilo Perez Rojo Pruebas", email: "russell4@rbcol.co" },
  { id: 82, name: "YULI ATEHORTUA GIRALDO Pruebas", email: "russell@russellbedford.com.co" },
  { id: 87, name: "Administrador Russell", email: "admin@russellbedford.co" },
  { id: 85, name: "Russell 3", email: "russell3@russellbedford.com.co" },
  { id: 1, name: "Victor Rivera", email: "admin@xentria.co" },
];

type Evento = { user: string; action: string; entity: string; detail: string; clientId: number | null; createdAt: Date };
let bitacora: Evento[] = [];
let visitas: Array<{ userId: number; path: string; createdAt: Date }> = [];
let ingresos: Array<{ userName: string; createdAt: Date }> = [];

const eventosDe = (user: string, n: number, dia: string): Evento[] =>
  Array.from({ length: n }, () => ({
    user, action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 1, createdAt: new Date(`${dia}T15:00:00Z`),
  }));

const dentro = (fecha: Date, where: { createdAt: { gte: Date; lte: Date } }) =>
  fecha >= where.createdAt.gte && fecha <= where.createdAt.lte;

beforeEach(() => {
  vi.resetAllMocks();
  bitacora = [];
  visitas = [];
  ingresos = [];
  mocks.usuarios.mockResolvedValue(cuentas);
  // La base se simula: cada consulta devuelve lo que caiga dentro de su ventana.
  mocks.eventos.mockImplementation(async ({ where }) => bitacora.filter((e) => dentro(e.createdAt, where)));
  mocks.accesos.mockImplementation(async ({ by, where }) => {
    if (by[0] === "userName") {
      const porNombre = new Map<string, number>();
      for (const i of ingresos.filter((x) => dentro(x.createdAt, where))) porNombre.set(i.userName, (porNombre.get(i.userName) ?? 0) + 1);
      return [...porNombre].map(([userName, n]) => ({ userName, _count: { userName: n } }));
    }
    const ids: number[] = where.userId.in;
    const porRuta = new Map<string, number>();
    for (const v of visitas.filter((x) => dentro(x.createdAt, where) && ids.includes(x.userId))) {
      porRuta.set(v.path, (porRuta.get(v.path) ?? 0) + 1);
    }
    return [...porRuta].map(([path, n]) => ({ path, _count: { path: n } }));
  });
  mocks.reportes.mockResolvedValue([]);
});

/** Reporte #50 guardado con la metodología vigente o con una anterior. */
function reporteGuardado(metodologia: number, extra: Record<string, unknown> = {}, corte?: string) {
  const periodo = { periodoDesde: "2026-10-14T00:00:00.000Z", periodoHasta: "2026-10-27T23:59:59.999Z" };
  const vacio = {
    totalAcciones: 124, totalUsuarios: 4, totalConexiones: 0, totalNavegaciones: 0, totalClientes: 1,
    porFamilia: [{ nombre: "Balance de comprobación", total: 124 }],
    detalleUsuarios: [{ usuario: "Camilo Perez Rojo Pruebas", correo: null, conexiones: 0, totalAcciones: 110, accionesPrincipales: [], porFamilia: [] }],
  };
  return {
    creadoEn: new Date("2026-10-27T23:30:01.695Z"),
    metadatos: { metodologia, ...(corte ? { corte } : {}), fuente: { uso: { ...periodo, ...vacio }, ...extra } },
  };
}

const ventanaActual = { desde: new Date("2026-10-30T00:00:00.000Z"), hasta: new Date("2026-11-10T23:59:59.999Z") };

function sembrarCasoReal() {
  bitacora = [
    // Período actual, 30-oct → 10-nov: 823 operaciones, 565 de personas del equipo.
    ...eventosDe("LUISA FERNANDA CHAVARRIA CARMONA", 482, "2026-11-03"),
    ...eventosDe("YULI ATEHORTUA GIRALDO Pruebas", 134, "2026-11-04"),
    ...eventosDe("Camilo Perez Rojo Pruebas", 122, "2026-11-05"),
    ...eventosDe("SINDY KATERINE ECHEVERRI RAMÍREZ", 53, "2026-11-02"),
    ...eventosDe("YULI ALEJANDRA VILLA HIGUITA", 27, "2026-10-31"),
    ...eventosDe("DARWIN GUZMAN MENA", 3, "2026-11-06"),
    ...eventosDe("Administrador Russell", 2, "2026-11-05"),
    // Período previo, 14 → 27-oct: 124 operaciones, 110 de una cuenta de pruebas.
    ...eventosDe("Camilo Perez Rojo Pruebas", 110, "2026-10-20"),
    ...eventosDe("Administrador Russell", 9, "2026-10-21"),
    ...eventosDe("ERICA MARIA VERGARA SALAZAR", 4, "2026-10-22"),
    ...eventosDe("Russell 3", 1, "2026-10-23"),
  ];
}

describe("uso comparable", () => {
  test("deja fuera cuentas de prueba, genéricas y de Xentria de las operaciones, personas y familias", async () => {
    sembrarCasoReal();
    const uso = await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes });
    expect(uso).not.toBeNull();
    expect(uso).toMatchObject({ totalAcciones: 565, totalUsuarios: 4 });
    expect(uso!.detalleUsuarios.map((u) => [u.usuario, u.totalAcciones])).toEqual([
      ["LUISA FERNANDA CHAVARRIA CARMONA", 482],
      ["SINDY KATERINE ECHEVERRI RAMÍREZ", 53],
      ["YULI ALEJANDRA VILLA HIGUITA", 27],
      ["DARWIN GUZMAN MENA", 3],
    ]);
    expect(uso!.porFamilia).toEqual([{ nombre: "Balance de comprobación", total: 565 }]);
    // Conserva el período declarado y no guarda evidencia que nadie lee.
    expect(uso!.periodoDesde).toBe("2026-10-30T00:00:00.000Z");
    expect(uso!.evidencia).toEqual([]);
  });

  test("los inicios de sesión y las visitas tampoco cuentan a las cuentas de prueba", async () => {
    ingresos = [
      { userName: "LUISA FERNANDA CHAVARRIA CARMONA", createdAt: new Date("2026-11-03T10:00:00Z") },
      { userName: "Camilo Perez Rojo Pruebas", createdAt: new Date("2026-11-03T11:00:00Z") },
      { userName: "Administrador Russell", createdAt: new Date("2026-11-03T12:00:00Z") },
    ];
    visitas = [
      { userId: 30, path: "/balance", createdAt: new Date("2026-11-03T10:00:00Z") },
      { userId: 86, path: "/balance", createdAt: new Date("2026-11-03T10:05:00Z") },
      { userId: 87, path: "/balance", createdAt: new Date("2026-11-03T10:06:00Z") },
      { userId: 1, path: "/balance", createdAt: new Date("2026-11-03T10:07:00Z") }, // Xentria
    ];
    const uso = await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes });
    expect(uso).toMatchObject({ totalConexiones: 1, totalNavegaciones: 1 });
    // La consulta de visitas se acota a las cuentas del comparativo, y solo a ellas.
    const consultaVisitas = mocks.accesos.mock.calls.map((c) => c[0]).find((a) => a.by[0] === "path");
    expect([...consultaVisitas.where.userId.in].sort((a: number, b: number) => a - b)).toEqual([25, 30, 32, 33, 59]);
  });

  test("sin cuentas del equipo todo da cero, no «todos»", async () => {
    mocks.usuarios.mockResolvedValue([{ id: 1, name: "Victor Rivera", email: "admin@xentria.co" }]);
    sembrarCasoReal();
    const uso = await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes });
    expect(uso).toMatchObject({ totalAcciones: 0, totalUsuarios: 0 });
  });

  test("si la consulta falla devuelve null y no lanza", async () => {
    mocks.eventos.mockRejectedValue(new Error("BD no disponible"));
    expect(await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes })).toBeNull();
  });

  test("recorta la consulta en el corte cuando el período llega al futuro, sin cambiar el período declarado", async () => {
    bitacora = [...eventosDe("DARWIN GUZMAN MENA", 3, "2026-11-06"), ...eventosDe("DARWIN GUZMAN MENA", 5, "2026-11-09")];
    const uso = await construirUsoComparable({
      desde: ventanaActual.desde, hasta: new Date("2026-11-30T23:59:59.999Z"), corte: new Date("2026-11-07T00:00:00Z"), filtro, nombresClientes,
    });
    expect(uso!.totalAcciones).toBe(3);
    expect(uso!.periodoHasta).toBe("2026-11-30T23:59:59.999Z");
  });
});

describe("comparativo contra el reporte anterior", () => {
  test("reporte guardado con una metodología anterior: conserva su ventana y recalcula sin cuentas de prueba (30-oct → 10-nov contra 14 → 27-oct)", async () => {
    sembrarCasoReal();
    mocks.reportes.mockResolvedValue([reporteGuardado(METODOLOGIA_USO_VIGENTE - 1)]);
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    const c = await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes });

    expect(c).not.toBeNull();
    expect(c!.base).toBe("reporte_anterior");
    expect(c!.previo).toMatchObject({ desde: "2026-10-14", hasta: "2026-10-27", dias: 14 });
    expect(c!.totales[0]).toMatchObject({ previo: 4, actual: 565 });
    expect(c!.totales[1]).toMatchObject({ previo: 1, actual: 4 });
    expect(c!.usuarios.salieron).toEqual(["ERICA MARIA VERGARA SALAZAR"]);

    expect(alertaComparativo(c!).titulo).toBe("El uso subió: de 4 a 565 operaciones (0,3 → 47,1 por día)");
    expect(alertaComparativo(c!).avisos).toEqual([
      "La base anterior es pequeña (4 operaciones y 1 persona): un porcentaje exageraría la variación, por eso se muestran las cifras.",
      "El 85 % de las operaciones lo hizo una sola persona: LUISA FERNANDA CHAVARRIA CARMONA.",
    ]);
    expect(alertaUsuarios(c!).titulo).toBe("Operaron más usuarios: de 1 a 4");
  });

  test("recalcula el período previo solo hasta el corte de su reporte: lo operado después no se le suma", async () => {
    sembrarCasoReal();
    // El reporte del 14 → 27-oct se generó a las 18:30 del 27; Sindy operó 263 veces más tarde esa noche.
    bitacora.push(...Array.from({ length: 263 }, () => ({
      user: "SINDY KATERINE ECHEVERRI RAMÍREZ", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 1,
      createdAt: new Date("2026-10-27T23:45:00Z"),
    })));
    mocks.reportes.mockResolvedValue([reporteGuardado(METODOLOGIA_USO_VIGENTE - 1, {}, "2026-10-27T23:30:01.695Z")]);
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    const c = await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes });
    expect(c!.totales[0]).toMatchObject({ previo: 4, actual: 565 });
    expect(c!.totales[1]).toMatchObject({ previo: 1, actual: 4 });

    // Sin corte guardado (instantánea muy antigua) se lee la ventana completa, como antes.
    mocks.reportes.mockResolvedValue([reporteGuardado(METODOLOGIA_USO_VIGENTE - 1)]);
    const entera = await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes });
    expect(entera!.totales[0].previo).toBe(267);
  });

  test("reporte guardado con la metodología vigente: usa su `usoComparable` tal cual, sin recalcular", async () => {
    sembrarCasoReal();
    const guardado = {
      periodoDesde: "2026-10-14T00:00:00.000Z", periodoHasta: "2026-10-27T23:59:59.999Z",
      totalAcciones: 4, totalUsuarios: 1, totalConexiones: 0, totalNavegaciones: 0, totalClientes: 1,
      porFamilia: [{ nombre: "Balance de comprobación", total: 4 }],
      detalleUsuarios: [{ usuario: "ERICA MARIA VERGARA SALAZAR", correo: null, conexiones: 0, totalAcciones: 4, accionesPrincipales: [], porFamilia: [] }],
    };
    mocks.reportes.mockResolvedValue([reporteGuardado(METODOLOGIA_USO_VIGENTE, { usoComparable: guardado })]);
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    mocks.eventos.mockClear();
    const c = await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes });

    expect(c!.totales[0]).toMatchObject({ previo: 4, actual: 565 });
    // No volvió a leer la bitácora del período previo: las cifras son las guardadas.
    expect(mocks.eventos).not.toHaveBeenCalled();
  });

  test("con la metodología vigente pero sin `usoComparable` guardado, lo recalcula en vivo", async () => {
    sembrarCasoReal();
    mocks.reportes.mockResolvedValue([reporteGuardado(METODOLOGIA_USO_VIGENTE)]);
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    const c = await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes });
    expect(c!.totales[0]).toMatchObject({ previo: 4, actual: 565 });
  });

  test("salta las instantáneas sin fuente y compara contra la primera que la trae", async () => {
    sembrarCasoReal();
    mocks.reportes.mockResolvedValue([
      { creadoEn: new Date("2026-10-31T00:00:00Z"), metadatos: { metodologia: 2 } },
      reporteGuardado(2),
    ]);
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    const c = await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes });
    expect(c!.previo.desde).toBe("2026-10-14");
  });

  test("sin reporte anterior compara contra el período inmediatamente anterior, también sin cuentas de prueba", async () => {
    sembrarCasoReal();
    // Período previo de igual duración: 18 → 29-oct (12 días); ahí solo hay 4 operaciones de Erica.
    bitacora = [
      ...bitacora.filter((e) => e.createdAt >= new Date("2026-10-30T00:00:00Z")),
      ...eventosDe("Camilo Perez Rojo Pruebas", 110, "2026-10-20"),
      ...eventosDe("ERICA MARIA VERGARA SALAZAR", 4, "2026-10-22"),
    ];
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    const c = await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes });
    expect(c!.base).toBe("periodo_anterior");
    expect(c!.totales[0]).toMatchObject({ previo: 4, actual: 565 });
  });

  test("un período previo sin una sola operación del equipo no es una caída: no hay comparativo", async () => {
    bitacora = eventosDe("Camilo Perez Rojo Pruebas", 110, "2026-10-20");
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    expect(await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes })).toBeNull();
  });

  test("si la consulta falla devuelve null y no lanza", async () => {
    mocks.reportes.mockRejectedValue(new Error("BD no disponible"));
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    expect(await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, filtro, nombresClientes })).toBeNull();
  });
});
