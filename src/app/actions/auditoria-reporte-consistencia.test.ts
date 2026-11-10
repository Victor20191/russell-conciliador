import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), leer: vi.fn(), guardar: vi.fn(), ia: vi.fn(), audit: vi.fn(),
  envios: vi.fn(), eventos: vi.fn(), conexiones: vi.fn(), versiones: vi.fn(), clientes: vi.fn(), usuarios: vi.fn(), tickets: vi.fn(),
  acciones: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: {
  $transaction: (operacion: (tx: unknown) => Promise<unknown>) => operacion({
    auditEntry: { findMany: mocks.eventos }, accessLog: { groupBy: mocks.conexiones },
    platformVersion: { findMany: mocks.versiones }, client: { findMany: mocks.clientes }, user: { findMany: mocks.usuarios },
  }),
  auditEntry: { findMany: mocks.eventos, groupBy: mocks.acciones }, accessLog: { groupBy: mocks.conexiones },
  platformVersion: { findMany: mocks.versiones }, client: { findMany: mocks.clientes }, user: { findMany: mocks.usuarios },
  supportTicket: { findMany: mocks.tickets },
  envioReporteEjecutivo: { findMany: mocks.envios },
} }));
vi.mock("@/lib/rbac/reporte-ejecutivo", () => ({ authorizeReporteEjecutivo: mocks.auth }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ id: 1, name: "Ana" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: vi.fn(() => "Error BD") }));
vi.mock("@/lib/opencode", () => ({ completarTextoOpenCode: mocks.ia, mensajeErrorOpenCode: vi.fn(() => "Error del reporte") }));
vi.mock("@/lib/rbac/publicacion", () => ({ modulosPublicadosParaTodos: vi.fn(async () => new Set(["balance"])) }));
vi.mock("@/lib/auditoria/reporte-ejecutivo/instantaneas", () => ({ claveAlcanceReporte: vi.fn(() => "clave"), leerInstantanea: mocks.leer, guardarInstantanea: mocks.guardar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { generarReporteEjecutivoUso, listarEnviosReporteEjecutivo } from "./auditoria-reporte";

const scope = { desde: "2026-09-01", hasta: "2026-09-07" };
const snapshot = {
  id: 9, report: { titulo: "Guardado", html: "<html>Original</html>" }, model: "modelo-original",
  generatedAt: "2026-09-01T12:00:00Z", totalAcciones: 103, totalUsuarios: 7, totalNovedades: 4,
  porcentajeAdopcion: 75, versionIdsIncluidos: [3, 5], corte: "2026-09-01T11:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true });
  mocks.leer.mockResolvedValue(snapshot);
  mocks.guardar.mockResolvedValue(snapshot);
  mocks.eventos.mockResolvedValue([]);
  mocks.conexiones.mockResolvedValue([]);
  mocks.versiones.mockResolvedValue([]);
  mocks.clientes.mockResolvedValue([]);
  mocks.usuarios.mockResolvedValue([]);
  mocks.acciones.mockResolvedValue([]);
  mocks.ia.mockResolvedValue({ text: "{}" });
});

describe("consistencia de generación del reporte", () => {
  test("reutiliza documento y metadata congelados sin consultar actividad ni IA", async () => {
    expect(await generarReporteEjecutivoUso(scope)).toEqual({ ok: true, ...snapshot, desdeCache: true });
    expect(mocks.eventos).not.toHaveBeenCalled();
    expect(mocks.ia).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  test("autoriza antes de leer la instantánea", async () => {
    mocks.auth.mockResolvedValue({ ok: false, message: "Sin permisos" });
    expect(await generarReporteEjecutivoUso(scope)).toEqual({ ok: false, message: "Sin permisos" });
    expect(mocks.leer).not.toHaveBeenCalled();
  });

  test("actualizar consulta actividad y guarda una plantilla factual con revisión anterior", async () => {
    const result = await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    expect(result).toMatchObject({ ok: true, desdeCache: false });
    // Dos lecturas de la bitácora: la del reporte y la del uso comparable (sin cuentas de prueba).
    expect(mocks.eventos).toHaveBeenCalledTimes(2);
    // El documento se arma entero en código: ninguna generación llama a la IA.
    expect(mocks.ia).not.toHaveBeenCalled();
    expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({
      anteriorId: 9, totalAcciones: 0, totalUsuarios: 0,
      report: expect.objectContaining({ html: expect.stringContaining('id="lo-mas-importante"') }),
    }));
  });

  test("rechaza versiones seleccionadas ausentes o no publicadas antes de construir el documento", async () => {
    mocks.leer.mockResolvedValue(null);
    mocks.versiones.mockResolvedValue([{ id: 3 }]);
    const result = await generarReporteEjecutivoUso({ ...scope, versionIds: [3, 5] });
    expect(result).toMatchObject({ ok: false });
    expect(mocks.versiones).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "publicada", id: { in: [3, 5] } },
    }));
    expect(mocks.ia).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  test("cancelar mientras se consulta la actividad evita auditoría y guardado", async () => {
    const controller = new AbortController();
    mocks.eventos.mockImplementation(async () => { controller.abort(); return []; });
    expect(await generarReporteEjecutivoUso({ ...scope, actualizar: true }, controller.signal))
      .toEqual({ ok: false, message: "Generación cancelada." });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  test("fallo al leer almacenamiento no genera otro documento con IA", async () => {
    mocks.leer.mockRejectedValue(new Error("BD no disponible"));
    expect(await generarReporteEjecutivoUso(scope)).toMatchObject({ ok: false });
    expect(mocks.ia).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  test("fallo al guardar no se presenta como generación exitosa", async () => {
    mocks.guardar.mockRejectedValue(new Error("BD no disponible"));
    expect(await generarReporteEjecutivoUso({ ...scope, actualizar: true })).toMatchObject({ ok: false });
  });

  describe("tickets atendidos", () => {
    const ticketCerrado = {
      code: "TKT-56", subject: "Cierre de asignación", menuLabel: "Inventarios", routeLabel: "Módulos de conciliación",
      reporterFirstName: "Ana", reporterLastName: "Pérez", createdById: 82, status: "cerrado",
      solution: "Disponible desde la versión 2.3.0.", resolvedAt: null,
      events: [{ previousStatus: "en_proceso", newStatus: "cerrado", createdAt: new Date("2026-09-03T11:14:00Z") }],
      messages: [],
    };

    test("el documento y la fuente guardada llevan los tickets que reportó el equipo del cliente", async () => {
      mocks.tickets.mockResolvedValue([
        ticketCerrado,
        { ...ticketCerrado, code: "TKT-57", createdById: 10 }, // cuenta de Xentria: fuera
      ]);
      mocks.usuarios.mockImplementation(async (args?: { where?: { id?: unknown } }) =>
        args?.where?.id
          ? [{ id: 82, email: "ana@russellbedford.com.co" }, { id: 10, email: "luisa@xentria.co" }]
          : [],
      );
      await generarReporteEjecutivoUso({ ...scope, actualizar: true });

      // Solo la bandeja interna (los públicos se ven por token) y solo lo ya atendido.
      expect(mocks.tickets).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ createdById: { not: null }, status: { in: ["resuelto", "cerrado"] } }),
      }));
      const guardado = mocks.guardar.mock.calls[0][0];
      expect(guardado.report.html).toContain('id="tickets-atendidos"');
      expect(guardado.report.html).toContain("TKT-56");
      expect(guardado.report.html).not.toContain("TKT-57");
      expect(guardado.fuente.tickets).toMatchObject({ total: 1, cerrados: 1, resueltos: 0 });
      expect(guardado.fuente.tickets.tickets[0]).toMatchObject({ codigo: "TKT-56", solucion: "Disponible desde la versión 2.3.0." });
    });

    test("si la consulta falla el reporte sale igual, sin la sección y sin decir que no hubo tickets", async () => {
      mocks.tickets.mockRejectedValue(new Error("BD no disponible"));
      const result = await generarReporteEjecutivoUso({ ...scope, actualizar: true });
      expect(result).toMatchObject({ ok: true, desdeCache: false });
      const guardado = mocks.guardar.mock.calls[0][0];
      expect(guardado.report.html).not.toContain("tickets-atendidos");
      expect(guardado.report.html).not.toContain("No se atendieron tickets");
      expect(guardado.fuente.tickets).toBeNull();
    });

    test("un período sin tickets lo dice y guarda la lista vacía", async () => {
      mocks.tickets.mockResolvedValue([]);
      await generarReporteEjecutivoUso({ ...scope, actualizar: true });
      const guardado = mocks.guardar.mock.calls[0][0];
      expect(guardado.report.html).toContain("No se atendieron tickets reportados por el equipo");
      expect(guardado.fuente.tickets).toMatchObject({ total: 0, tickets: [] });
    });
  });
});


describe("usuarios activos", () => {
  const cuenta = (id: number, name: string, email: string, extra: Record<string, unknown> = {}) =>
    ({ id, name, email, active: true, lastLoginAt: null, createdAt: new Date("2026-06-22T15:00:00Z"), ...extra });
  const ultimo = (userId: number, createdAt = "2026-09-03T10:00:00Z") => ({ userId, _max: { createdAt: new Date(createdAt) } });
  const cuentas = [
    cuenta(1, "Ana Real", "ana@rbcol.co"),
    cuenta(2, "Beto Real", "beto@rbcol.co"),
    cuenta(3, "Russell 1", "russell1@russellbedford.com.co"), // de prueba: fuera del total
    cuenta(4, "Luisa", "luisa@xentria.co"), // de Xentria: fuera del total
  ];

  beforeEach(() => {
    mocks.usuarios.mockImplementation(async (args?: { where?: { id?: unknown } }) => (args?.where?.id ? [] : cuentas));
    // Un mismo mock sirve a las cuatro lecturas de accesos; se distinguen por cómo se agrupan.
    mocks.conexiones.mockImplementation(async (args: { by: string[]; where: { createdAt?: unknown } }) => {
      if (args.by[0] !== "userId") return [];
      return args.where.createdAt ? [ultimo(1), ultimo(3)] : [ultimo(1), ultimo(3), ultimo(4)];
    });
  });

  test("el documento y la fuente guardada llevan «Usuarios activos: X de Y» de las cuentas del equipo", async () => {
    await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    const guardado = mocks.guardar.mock.calls[0][0];
    expect(guardado.fuente.uso.usuariosActivos).toEqual({ total: 2, activos: 1, porcentaje: 50, nuncaIngresaron: 1 });
    expect(guardado.report.html).toContain('id="usuarios-activos"');
    expect(guardado.report.html).toContain("Usuarios activos: 1 de 2 (50 %)");
    expect(guardado.report.html).toContain("Nunca han ingresado: 1");
  });

  test("lee accesos por userId (ingreso o navegación) y acciones sin contar la generación del reporte", async () => {
    await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    expect(mocks.conexiones).toHaveBeenCalledWith(expect.objectContaining({
      by: ["userId"],
      where: expect.objectContaining({ kind: { in: ["ingreso", "navegacion"] }, createdAt: expect.anything() }),
    }));
    expect(mocks.acciones).toHaveBeenCalledWith(expect.objectContaining({
      by: ["user"],
      where: expect.objectContaining({ action: { not: "GENERÓ REPORTE IA" } }),
    }));
  });

  test("un acceso anterior a la creación de la cuenta (id reutilizado) no la vuelve activa ni «con ingreso»", async () => {
    mocks.conexiones.mockImplementation(async (args: { by: string[] }) =>
      args.by[0] === "userId" ? [ultimo(2, "2026-05-01T10:00:00Z")] : []);
    await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    expect(mocks.guardar.mock.calls[0][0].fuente.uso.usuariosActivos).toEqual({
      total: 2, activos: 0, porcentaje: 0, nuncaIngresaron: 2,
    });
  });

  test("una acción de la bitácora basta para estar activo", async () => {
    mocks.conexiones.mockImplementation(async () => []);
    mocks.acciones.mockResolvedValue([{ user: "Beto Real", _max: { createdAt: new Date("2026-09-03T10:00:00Z") } }]);
    await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    expect(mocks.guardar.mock.calls[0][0].fuente.uso.usuariosActivos).toMatchObject({ total: 2, activos: 1 });
  });

  test("si no se pudo medir el reporte sale igual, sin la sección ni una cifra inventada", async () => {
    mocks.acciones.mockRejectedValue(new Error("BD no disponible"));
    const result = await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    expect(result).toMatchObject({ ok: true, desdeCache: false });
    const guardado = mocks.guardar.mock.calls[0][0];
    expect(guardado.report.html).not.toContain("usuarios-activos");
    expect("usuariosActivos" in guardado.fuente.uso).toBe(false);
  });
});

describe("comparativo sin cuentas de prueba", () => {
  const cuentas = [
    { id: 1, name: "Ana Real", email: "ana@rbcol.co", active: true, lastLoginAt: null, createdAt: new Date("2026-06-22T15:00:00Z") },
    { id: 3, name: "Russell 1", email: "russell1@russellbedford.com.co", active: true, lastLoginAt: null, createdAt: new Date("2026-06-22T15:00:00Z") },
  ];
  const evento = (user: string) => ({
    user, action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 7, createdAt: new Date("2026-09-03T10:00:00Z"),
  });

  beforeEach(() => {
    mocks.usuarios.mockImplementation(async (args?: { where?: { id?: unknown } }) => (args?.where?.id ? [] : cuentas));
    mocks.eventos.mockResolvedValue([evento("Ana Real"), evento("Ana Real"), evento("Ana Real"), evento("Russell 1"), evento("Russell 1")]);
  });

  test("el reporte deja como está su detalle y guarda aparte las cifras comparables, sin cuentas de prueba", async () => {
    await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    const { fuente } = mocks.guardar.mock.calls[0][0];
    // El resto del reporte (detalle por usuario, top) conserva a las cuentas de prueba.
    expect(fuente.uso).toMatchObject({ totalAcciones: 5, totalUsuarios: 2 });
    // Lo que se compara no las trae, y se guarda para que el siguiente reporte compare contra esto.
    expect(fuente.usoComparable).toMatchObject({ totalAcciones: 3, totalUsuarios: 1 });
    expect(fuente.usoComparable.detalleUsuarios.map((u: { usuario: string }) => u.usuario)).toEqual(["Ana Real"]);
  });

  test("si no se pudo medir el uso comparable el reporte sale igual, sin comparativo", async () => {
    mocks.eventos.mockResolvedValueOnce([evento("Ana Real")]); // la lectura principal
    mocks.eventos.mockRejectedValue(new Error("BD no disponible")); // la del uso comparable
    const result = await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    expect(result).toMatchObject({ ok: true, desdeCache: false });
    const guardado = mocks.guardar.mock.calls[0][0];
    expect(guardado.fuente.usoComparable).toBeNull();
    expect(guardado.fuente.comparativo).toBeNull();
    expect(guardado.report.html).not.toContain('id="comparativo"');
  });
});

describe("acceso al historial de envíos de reportes", () => {
  test("deniega la consulta directa sin el permiso de reporte ejecutivo", async () => {
    mocks.auth.mockResolvedValue({ ok: false, message: "Sin permisos" });
    expect(await listarEnviosReporteEjecutivo()).toEqual([]);
    expect(mocks.envios).not.toHaveBeenCalled();
  });

  test("consulta el historial después de autorizar", async () => {
    mocks.envios.mockResolvedValue([]);
    expect(await listarEnviosReporteEjecutivo(500)).toEqual([]);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.envios).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.envios.mock.invocationCallOrder[0]);
  });
});
