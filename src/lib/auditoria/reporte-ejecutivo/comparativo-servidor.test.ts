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

// Cada carga de un cliente distinto: n operaciones (metodología 7 agrupa el mismo
// paso de la misma persona sobre el mismo cliente el mismo día).
const eventosDe = (user: string, n: number, dia: string): Evento[] =>
  Array.from({ length: n }, (_, i) => ({
    user, action: "CARGÓ BALANCE", entity: "", detail: "", clientId: i + 1, createdAt: new Date(`${dia}T15:00:00Z`),
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

/** Un reporte ya generado: desde la metodología 5 no se usa para comparar. */
const reporteGuardado = {
  creadoEn: new Date("2026-10-27T23:30:01.695Z"),
  metadatos: {
    metodologia: 4,
    fuente: { uso: { periodoDesde: "2026-10-14T00:00:00.000Z", periodoHasta: "2026-10-27T23:59:59.999Z", totalAcciones: 124 } },
  },
};

/** Un instante posterior al período: el período ya cerró y se mide completo. */
const corteCerrado = new Date("2026-11-20T00:00:00.000Z");

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

describe("comparativo contra el período anterior de igual duración", () => {
  test("30-oct → 10-nov (12 días) se compara con 18 → 29-oct, sin cuentas de prueba y sin mirar los reportes generados", async () => {
    sembrarCasoReal();
    // Hay un reporte del 14 → 27-oct (14 días): ya no es la base de la comparación.
    mocks.reportes.mockResolvedValue([reporteGuardado]);
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    const c = await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, corte: corteCerrado, filtro, nombresClientes });

    expect(c).not.toBeNull();
    expect(c!.base).toBe("periodo_anterior");
    expect(c!.previo).toEqual({ desde: "2026-10-18", hasta: "2026-10-29", dias: 12 });
    expect(c!.comparable).toBe(true);
    expect(c!.corteMismoPunto).toBeUndefined();
    expect(mocks.reportes).not.toHaveBeenCalled();
    // En 18 → 29-oct solo cuentan las 4 operaciones de Erica (las demás son de cuentas de prueba).
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

  test("con el período abierto, el anterior se corta en el mismo punto (17 → 23-nov hasta las 18:40 contra 10 → 16-nov hasta las 18:40)", async () => {
    const semana = { desde: new Date("2026-11-17T00:00:00.000Z"), hasta: new Date("2026-11-23T23:59:59.999Z") };
    const corte = new Date("2026-11-23T23:40:00.000Z");
    const evento = (user: string, iso: string): Evento => ({ user, action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 1, createdAt: new Date(iso) });
    bitacora = [
      evento("LUISA FERNANDA CHAVARRIA CARMONA", "2026-11-20T15:00:00Z"),
      evento("DARWIN GUZMAN MENA", "2026-11-23T20:00:00Z"),
      // Semana anterior: dos antes del mismo punto y una después (no cuenta).
      evento("DARWIN GUZMAN MENA", "2026-11-10T00:00:00Z"),
      evento("DARWIN GUZMAN MENA", "2026-11-16T22:00:00Z"),
      evento("SINDY KATERINE ECHEVERRI RAMÍREZ", "2026-11-16T23:50:00Z"),
      // Fuera de la semana anterior.
      evento("SINDY KATERINE ECHEVERRI RAMÍREZ", "2026-11-09T23:00:00Z"),
    ];
    const actual = (await construirUsoComparable({ ...semana, corte, filtro, nombresClientes }))!;
    const c = await construirComparativoUso({ usoComparableActual: actual, ...semana, corte, filtro, nombresClientes });

    expect(c!.previo).toEqual({ desde: "2026-11-10", hasta: "2026-11-16", dias: 7 });
    expect(c!.totales[0]).toMatchObject({ previo: 2, actual: 2 });
    expect(c!.corteMismoPunto).toEqual({ actual: "2026-11-23T23:40:00.000Z", previo: "2026-11-16T23:40:00.000Z" });
    // El costo de IA consulta la misma ventana recortada.
    expect(c!.ventanaPrevia).toEqual({ desde: "2026-11-10T00:00:00.000Z", hasta: "2026-11-16T23:40:00.000Z" });
  });

  test("un período previo sin una sola operación del equipo no es una caída: no hay comparativo", async () => {
    bitacora = eventosDe("Camilo Perez Rojo Pruebas", 110, "2026-10-20");
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    expect(
      await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, corte: corteCerrado, filtro, nombresClientes }),
    ).toBeNull();
  });

  test("si la consulta falla devuelve null y no lanza", async () => {
    sembrarCasoReal();
    const actual = (await construirUsoComparable({ ...ventanaActual, filtro, nombresClientes }))!;
    mocks.eventos.mockRejectedValue(new Error("BD no disponible"));
    expect(
      await construirComparativoUso({ usoComparableActual: actual, ...ventanaActual, corte: corteCerrado, filtro, nombresClientes }),
    ).toBeNull();
  });
});
