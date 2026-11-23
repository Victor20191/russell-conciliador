import { describe, expect, test } from "vitest";
import {
  agruparOperaciones,
  calcularResumenUso,
  clasificarFamilia,
  conteosPorFamiliaCanon,
  esAccionPorFila,
  familiaDesdeModulo,
  familiaDesdeRuta,
} from "./metricas";

describe("clasificarFamilia", () => {
  test("clasifica acciones de balance", () => {
    expect(clasificarFamilia("CARGÓ BALANCE")).toBe("balance");
    expect(clasificarFamilia("CONGELÓ BALANCE")).toBe("balance");
    expect(clasificarFamilia("CERRÓ BALANCE")).toBe("balance");
    expect(clasificarFamilia("ABRIÓ BALANCE")).toBe("balance");
    expect(clasificarFamilia("GUARDÓ cambios en balance borrador")).toBe("balance");
  });

  test("clasifica conciliaciones y DIAN", () => {
    expect(clasificarFamilia("EJECUTÓ")).toBe("conciliaciones");
    expect(clasificarFamilia("ENVIÓ A REVISOR")).toBe("conciliaciones");
    expect(clasificarFamilia("GUARDÓ MAPEO DIAN")).toBe("dian");
    expect(clasificarFamilia("PIDIÓ ANÁLISIS IA", "Renglón 1", "DIAN 110")).toBe("dian");
  });

  test("desambigua COMENTÓ por contexto", () => {
    expect(clasificarFamilia("COMENTÓ", "Renglón 5", "DIAN 110")).toBe("dian");
    expect(clasificarFamilia("COMENTÓ", "Cuenta 1105", "Cruce 12")).toBe("conciliaciones");
  });

  test("clasifica administración de plataforma", () => {
    expect(clasificarFamilia("GENERÓ REPORTE IA", "Novedades", "")).toBe("administracion");
    expect(clasificarFamilia("EDITÓ PROMPT IA")).toBe("administracion");
  });

  test("clasifica las operaciones de los seis módulos en una sola familia", () => {
    expect(clasificarFamilia("LEYÓ archivo de Inventarios")).toBe("modulos");
    expect(clasificarFamilia("LEYÓ archivo de Cartera")).toBe("modulos");
    expect(clasificarFamilia("CARGÓ Inventarios")).toBe("modulos");
    expect(clasificarFamilia("CARGÓ Cuentas por Pagar")).toBe("modulos");
    expect(clasificarFamilia("AGREGÓ ítems a Nómina")).toBe("modulos");
    for (const accion of [
      "ACTUALIZÓ consolidación de módulo",
      "MARCÓ una diferencia del cruce contable",
      "MARCÓ una diferencia del cruce por tercero",
      "EDITÓ la marca del cruce contable",
      "RETIRÓ la marca del control de deducciones",
      "ELIMINÓ un soporte de la marca del cruce contable",
      "ELIMINÓ DATOS DE MÓDULO",
      "ELIMINÓ DATOS Y PERFILES DE CARGA DE MÓDULO",
    ]) {
      // El módulo del detalle ya no decide la familia: los seis van juntos.
      expect(clasificarFamilia(accion, "Cliente", "INV · 2025-12"), accion).toBe("modulos");
      expect(clasificarFamilia(accion, "Cliente", "NOM · 2025-12"), accion).toBe("modulos");
    }
    // «BORRADOR» no basta para mandarla al balance.
    expect(clasificarFamilia("PREPARÓ BORRADOR DE INVENTARIOS")).toBe("modulos");
    expect(clasificarFamilia("EDITÓ PERFIL de carga de Nómina")).toBe("modulos");
    expect(clasificarFamilia("CREÓ PATRÓN DE ARCHIVO")).toBe("modulos");
    expect(clasificarFamilia("ESCOGIÓ EL BALANCE DEL CRUCE")).toBe("modulos");
    expect(clasificarFamilia("CERRÓ CONCILIACIÓN (EN FIRME)")).toBe("modulos");
    expect(clasificarFamilia("EMPAREJÓ un tercero del cruce por tercero")).toBe("modulos");
  });

  test("clasifica las revisiones de impuestos aunque nombren el balance o un cierre", () => {
    for (const accion of [
      "IMPORTÓ FORMULARIO DIAN",
      "CONFIRMÓ FORMULARIO DIAN",
      "REGISTRÓ MES SIN FORMULARIO DIAN",
      "CREÓ REVISIÓN DE IVA",
      "ELIMINÓ REVISIÓN DE RETENCIÓN",
      "MARCÓ DIFERENCIA DE RETENCIÓN",
      "QUITÓ MARCA DE RST",
      "ESCOGIÓ EL BALANCE DEL CRUCE DE IVA",
      "CERRÓ RETENCIÓN EN LA FUENTE (EN FIRME)",
      "DESBLOQUEÓ ANTICIPOS BIMESTRALES (RST)",
      "GUARDÓ CALENDARIO TRIBUTARIO",
      "MARCÓ RÉGIMEN SIMPLE DEL CLIENTE",
      "EDITÓ MAPEO DIAN",
    ]) {
      expect(clasificarFamilia(accion), accion).toBe("dian");
    }
  });

  test("ubica prevalidador, plan estándar y conexiones", () => {
    expect(clasificarFamilia("APROBÓ PREVALIDADOR")).toBe("balance");
    expect(clasificarFamilia("ASIGNÓ CUENTA ESTÁNDAR")).toBe("balance");
    expect(clasificarFamilia("CREÓ CUENTA ESTÁNDAR")).toBe("mapeo");
    expect(clasificarFamilia("EDITÓ CUENTA ESTÁNDAR")).toBe("mapeo");
    expect(clasificarFamilia("HOMOLOGÓ CUENTA CLIENTE (PUC)")).toBe("mapeo");
    expect(clasificarFamilia("EJECUTÓ CONEXIÓN")).toBe("administracion");
    expect(clasificarFamilia("EJECUTÓ")).toBe("conciliaciones");
  });

  test("las acciones más frecuentes de nov/2026 quedan en su familia", () => {
    // Top real del tablero (25/Oct → 23/Nov/2026): antes 15 iban a «Balance» sin
    // serlo y 200 a «Otras acciones».
    const esperado: Array<[string, string]> = [
      ["ASIGNÓ CUENTA ESTÁNDAR", "balance"],
      ["ACTUALIZÓ consolidación de módulo", "modulos"],
      ["VALIDÓ alerta de balance", "balance"],
      ["MARCÓ una diferencia del cruce contable", "modulos"],
      ["APROBÓ PREVALIDADOR", "balance"],
      ["IMPORTÓ FORMULARIO DIAN", "dian"],
      ["CARGÓ BALANCE", "balance"],
      ["CERRÓ BALANCE", "balance"],
      ["PREPARÓ BORRADOR DE INVENTARIOS", "modulos"],
      ["CREÓ CUENTA ESTÁNDAR", "mapeo"],
      ["AGREGÓ APLICATIVO DESDE LA CARGA", "modulos"],
      ["CREÓ PATRÓN DE ARCHIVO", "modulos"],
      ["EDITÓ CUENTA ESTÁNDAR", "mapeo"],
      ["GUARDÓ PERFIL de carga de balance", "balance"],
    ];
    for (const [accion, familia] of esperado) {
      expect(clasificarFamilia(accion), accion).toBe(familia);
    }
  });
});

describe("agruparOperaciones", () => {
  const ev = (user: string, action: string, clientId: number | null, createdAt: string) => ({
    user,
    action,
    entity: "",
    detail: "",
    clientId,
    createdAt,
  });

  test("las acciones por fila valen una por persona, acción, cliente y día", () => {
    const eventos = [
      ...Array.from({ length: 80 }, (_, i) =>
        ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 1, `2026-11-05T1${i % 10}:00:00.000Z`),
      ),
      ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 1, "2026-11-06T10:00:00.000Z"), // otro día
      ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 2, "2026-11-05T10:00:00.000Z"), // otro cliente
      ev("Luis", "ASIGNÓ CUENTA ESTÁNDAR", 1, "2026-11-05T10:00:00.000Z"), // otra persona
      ev("Ana", "VALIDÓ alerta de balance", 1, "2026-11-05T10:00:00.000Z"), // otra acción
    ];
    const operaciones = agruparOperaciones(eventos);
    expect(operaciones).toHaveLength(5);
    expect(operaciones[0]).toMatchObject({ user: "Ana", clientId: 1, registros: 80 });
    expect(operaciones.slice(1).every((o) => o.registros === 1)).toBe(true);
  });

  test("las acciones de proceso se cuentan una a una", () => {
    const eventos = [1, 2, 3].map((n) => ev("Ana", "CARGÓ BALANCE", 1, `2026-11-05T1${n}:00:00.000Z`));
    expect(agruparOperaciones(eventos).map((o) => o.registros)).toEqual([1, 1, 1]);
  });

  test("no modifica los eventos recibidos", () => {
    const eventos = [
      ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 1, "2026-11-05T10:00:00.000Z"),
      ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 1, "2026-11-05T11:00:00.000Z"),
    ];
    const originales = structuredClone(eventos);
    agruparOperaciones(eventos);
    expect(eventos).toEqual(originales);
  });

  test("reconoce las variantes por prefijo", () => {
    expect(esAccionPorFila("MARCÓ una diferencia del cruce por tercero")).toBe(true);
    expect(esAccionPorFila("MARCÓ DIFERENCIA DE IVA")).toBe(true);
    expect(esAccionPorFila("EMPAREJÓ 3 terceros del cruce por tercero")).toBe(true);
    expect(esAccionPorFila("CARGÓ BALANCE")).toBe(false);
    expect(esAccionPorFila("CERRÓ BALANCE")).toBe(false);
  });

  test("el resumen cuenta operaciones y conserva los registros", () => {
    const eventos = [
      ...Array.from({ length: 40 }, (_, i) =>
        ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 1, `2026-11-05T10:${String(i).padStart(2, "0")}:00.000Z`),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        ev("Ana", "VALIDÓ alerta de balance", 1, `2026-11-05T11:${String(i).padStart(2, "0")}:00.000Z`),
      ),
      ev("Ana", "CARGÓ BALANCE", 1, "2026-11-05T09:00:00.000Z"),
      ev("Ana", "CERRÓ BALANCE", 1, "2026-11-05T12:00:00.000Z"),
    ];
    const resumen = calcularResumenUso({
      eventos,
      periodoDesde: "2026-11-01T00:00:00.000Z",
      periodoHasta: "2026-11-30T23:59:59.999Z",
    });

    expect(resumen.totalAcciones).toBe(4);
    expect(resumen.totalRegistros).toBe(52);
    expect(resumen.porFamilia).toEqual([{ nombre: "Balance de comprobación", total: 4 }]);
    expect(resumen.topUsuarios[0]).toMatchObject({ usuario: "Ana", total: 4 });
    expect(resumen.topClientes[0]).toMatchObject({ clienteId: 1, total: 4 });
    expect(resumen.serieDiaria).toEqual([
      { fecha: "2026-11-05", total: 4, usuarios: [{ usuario: "Ana", total: 4 }] },
    ]);
    expect(resumen.topAcciones).toEqual([
      { nombre: "ASIGNÓ CUENTA ESTÁNDAR", total: 1, registros: 40 },
      { nombre: "CARGÓ BALANCE", total: 1 },
      { nombre: "CERRÓ BALANCE", total: 1 },
      { nombre: "VALIDÓ alerta de balance", total: 1, registros: 10 },
    ]);
    // La última acción es el último registro, no el inicio de la última operación.
    expect(resumen.primeraAccion).toBe("2026-11-05T09:00:00.000Z");
    expect(resumen.ultimaAccion).toBe("2026-11-05T12:00:00.000Z");
    expect(resumen.evidencia.find((e) => e.accion === "ASIGNÓ CUENTA ESTÁNDAR")?.registros).toBe(40);
    expect(resumen.evidencia.find((e) => e.accion === "CARGÓ BALANCE")).not.toHaveProperty("registros");
    expect(conteosPorFamiliaCanon(eventos).balance).toBe(4);
  });
});

describe("familiaDesdeModulo", () => {
  test("mapea moduleKey conocidos", () => {
    expect(familiaDesdeModulo("balance")).toBe("balance");
    expect(familiaDesdeModulo("conciliaciones")).toBe("conciliaciones");
    expect(familiaDesdeModulo("dian")).toBe("dian");
    expect(familiaDesdeModulo("modulos_datos")).toBe("modulos");
    expect(familiaDesdeModulo("INV")).toBe("modulos");
    expect(familiaDesdeModulo("CAR")).toBe("modulos");
    // «modulos» es la configuración «Módulos y campos», no los módulos de conciliación.
    expect(familiaDesdeModulo("modulos")).toBe("administracion");
    expect(familiaDesdeModulo("novedades")).toBe("administracion");
  });

  test("null si no hay módulo o es desconocido", () => {
    expect(familiaDesdeModulo(null)).toBe(null);
    expect(familiaDesdeModulo("")).toBe(null);
    expect(familiaDesdeModulo("xyz_desconocido")).toBe(null);
  });
});

describe("familiaDesdeRuta", () => {
  test("solo expone familias operativas medibles", () => {
    expect(familiaDesdeRuta("/modulos/inv/25")).toBe("modulos");
    expect(familiaDesdeRuta("/modulos/car/borradores/3")).toBe("modulos");
    expect(familiaDesdeRuta("/impuestos/iva")).toBe("dian");
    expect(familiaDesdeRuta("/balance/borradores")).toBe("balance");
    expect(familiaDesdeRuta("/conciliacion/resultados/8")).toBe("conciliaciones");
    expect(familiaDesdeRuta("/config/prompts")).toBeNull();
    expect(familiaDesdeRuta("/ruta-desconocida")).toBeNull();
  });
});

describe("calcularResumenUso", () => {
  const base = new Date("2026-06-01T10:00:00.000Z");

  test("agrega totales, familias y tops", () => {
    const resumen = calcularResumenUso({
      periodoDesde: "2026-06-01T00:00:00.000Z",
      periodoHasta: "2026-06-30T23:59:59.000Z",
      nombresClientes: { 1: "Acme SAS" },
      conexiones: [
        { usuario: "Ana", total: 4 },
        { usuario: "Marta", total: 2 },
      ],
      navegaciones: [
        { ruta: "/modulos/inv", total: 12 },
        { ruta: "/modulos/inv/25", total: 3 },
        { ruta: "/balance", total: 4 },
        { ruta: "/config/prompts", total: 30 },
      ],
      eventos: [
        {
          user: "Ana",
          action: "CARGÓ BALANCE",
          entity: "B-1",
          detail: "periodo 2026-05",
          clientId: 1,
          createdAt: base,
        },
        {
          user: "Ana",
          action: "EJECUTÓ",
          entity: "Cruce X",
          detail: "mod · Acme",
          clientId: 1,
          createdAt: new Date("2026-06-02T10:00:00.000Z"),
        },
        {
          user: "Luis",
          action: "GUARDÓ MAPEO DIAN",
          entity: "Renglón 1",
          detail: "DIAN 110",
          clientId: null,
          createdAt: new Date("2026-06-03T10:00:00.000Z"),
        },
      ],
    });

    expect(resumen.totalAcciones).toBe(3);
    expect(resumen.totalConexiones).toBe(6);
    expect(resumen.totalNavegaciones).toBe(19);
    expect(resumen.navegacionesPorFamilia).toEqual([
      { nombre: "Módulos de conciliación", total: 15 },
      { nombre: "Balance de comprobación", total: 4 },
    ]);
    expect(resumen.totalUsuarios).toBe(2);
    expect(resumen.totalClientes).toBe(1);
    expect(resumen.topClientes[0]?.nombre).toBe("Acme SAS");
    expect(resumen.topUsuarios[0]?.usuario).toBe("Ana");
    expect(resumen.porFamilia.some((f) => f.nombre.includes("Balance"))).toBe(true);
    expect(resumen.serieDiaria).toHaveLength(3);
    expect(resumen.evidencia).toHaveLength(3);
    expect(resumen.detalleUsuarios).toEqual([
      expect.objectContaining({
        usuario: "Ana",
        conexiones: 4,
        totalAcciones: 2,
        accionesPrincipales: [
          { nombre: "CARGÓ BALANCE", total: 1 },
          { nombre: "EJECUTÓ", total: 1 },
        ],
      }),
      expect.objectContaining({ usuario: "Luis", conexiones: 0, totalAcciones: 1 }),
      expect.objectContaining({
        usuario: "Marta",
        conexiones: 2,
        totalAcciones: 0,
        accionesPrincipales: [],
      }),
    ]);
  });

  test("desglosa todos los usuarios por día sin aplicar el límite del top", () => {
    const resumen = calcularResumenUso({
      periodoDesde: "2026-06-01T00:00:00.000Z",
      periodoHasta: "2026-06-30T23:59:59.000Z",
      maxTopUsuarios: 1,
      eventos: [
        ["Luis", "2026-06-02T10:00:00.000Z"],
        ["Zoe", "2026-06-01T10:00:00.000Z"],
        ["Ana", "2026-06-01T11:00:00.000Z"],
        ["Luis", "2026-06-01T12:00:00.000Z"],
        ["Luis", "2026-06-01T13:00:00.000Z"],
        // Se conserva la misma fecha UTC usada para el total diario.
        ["Ana", "2026-06-01T23:30:00-05:00"],
      ].map(([user, createdAt]) => ({
        user,
        createdAt,
        action: "CARGÓ BALANCE",
        entity: "Balance",
        detail: "",
        clientId: null,
      })),
    });

    expect(resumen.topUsuarios).toHaveLength(1);
    expect(resumen.serieDiaria).toEqual([
      {
        fecha: "2026-06-01",
        total: 4,
        usuarios: [
          { usuario: "Luis", total: 2 },
          { usuario: "Ana", total: 1 },
          { usuario: "Zoe", total: 1 },
        ],
      },
      {
        fecha: "2026-06-02",
        total: 2,
        usuarios: [
          { usuario: "Ana", total: 1 },
          { usuario: "Luis", total: 1 },
        ],
      },
    ]);
    for (const dia of resumen.serieDiaria) {
      expect(dia.usuarios?.reduce((total, usuario) => total + usuario.total, 0)).toBe(dia.total);
    }
  });

  test("excluye automatizaciones de uso y adopción sin alterar la auditoría", () => {
    const humanos = ["Ana", "Administrador de sistemas", "Sistema de Juan", "Juan Sistema"];
    const automaticos = ["Sistema", "  sIsTeMa  ", "Sistema (script rehomologar-fuera-de-clase)", " SISTEMA   ( script   nocturno ) "];
    const eventos = [...automaticos, ...humanos].map((user, index) => ({
      user,
      action: index < automaticos.length ? "CARGÓ Inventarios" : "CARGÓ BALANCE",
      entity: "",
      detail: "",
      clientId: index < automaticos.length ? 99 : 1,
      createdAt: `2026-06-${index < automaticos.length ? "01" : "02"}T10:00:00.000Z`,
    }));
    const conexiones = [...automaticos, ...humanos].map((usuario) => ({ usuario, total: 2 }));
    const originales = structuredClone({ eventos, conexiones });
    const resumen = calcularResumenUso({
      periodoDesde: "2026-06-01T00:00:00.000Z",
      periodoHasta: "2026-06-30T23:59:59.000Z",
      eventos,
      conexiones,
    });

    expect(resumen.totalAcciones).toBe(4);
    expect(resumen.totalUsuarios).toBe(4);
    expect(resumen.totalClientes).toBe(1);
    expect(resumen.totalConexiones).toBe(8);
    expect(resumen.primeraAccion).toBe("2026-06-02T10:00:00.000Z");
    expect(resumen.ultimaAccion).toBe(resumen.primeraAccion);
    expect(resumen.topUsuarios.map((u) => u.usuario).sort()).toEqual([...humanos].sort());
    expect(resumen.detalleUsuarios.map((u) => u.usuario).sort()).toEqual([...humanos].sort());
    expect(resumen.topClientes).toEqual([{ clienteId: 1, nombre: "Cliente #1", total: 4 }]);
    expect(resumen.topAcciones).toEqual([{ nombre: "CARGÓ BALANCE", total: 4 }]);
    expect(resumen.porFamilia).toEqual([{ nombre: "Balance de comprobación", total: 4 }]);
    expect(resumen.evidencia).toHaveLength(4);
    expect(resumen.evidencia.map((e) => e.usuario).sort()).toEqual([...humanos].sort());
    expect(resumen.serieDiaria).toHaveLength(1);
    expect(resumen.serieDiaria[0]).toMatchObject({ fecha: "2026-06-02", total: 4 });
    expect(resumen.serieDiaria[0].usuarios?.map((u) => u.usuario).sort()).toEqual([...humanos].sort());
    const adopcion = conteosPorFamiliaCanon(eventos);
    expect(adopcion.balance).toBe(4);
    expect(adopcion.modulos).toBe(0);
    expect({ eventos, conexiones }).toEqual(originales);
  });

  test("solo actividad del sistema devuelve un resumen vacío", () => {
    const resumen = calcularResumenUso({
      periodoDesde: "2026-06-01T00:00:00.000Z",
      periodoHasta: "2026-06-30T23:59:59.000Z",
      eventos: [{ user: "Sistema", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 1, createdAt: base }],
      conexiones: [{ usuario: "Sistema (script)", total: 3 }],
    });
    expect(resumen).toMatchObject({
      totalAcciones: 0,
      totalUsuarios: 0,
      totalClientes: 0,
      totalConexiones: 0,
      primeraAccion: null,
      ultimaAccion: null,
      serieDiaria: [],
      evidencia: [],
      detalleUsuarios: [],
    });
  });

  test("sin eventos devuelve ceros", () => {
    const resumen = calcularResumenUso({
      periodoDesde: "2026-06-01T00:00:00.000Z",
      periodoHasta: "2026-06-30T23:59:59.000Z",
      eventos: [],
    });
    expect(resumen.totalAcciones).toBe(0);
    expect(resumen.totalConexiones).toBe(0);
    expect(resumen.totalNavegaciones).toBe(0);
    expect(resumen.navegacionesPorFamilia).toEqual([]);
    expect(resumen.totalUsuarios).toBe(0);
    expect(resumen.primeraAccion).toBe(null);
    expect(resumen.evidencia).toEqual([]);
    expect(resumen.detalleUsuarios).toEqual([]);
  });
});

describe("conteosPorFamiliaCanon", () => {
  test("cuenta por clave canónica", () => {
    const c = conteosPorFamiliaCanon([
      { user: "A", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: null, createdAt: new Date() },
      { user: "A", action: "EJECUTÓ", entity: "", detail: "", clientId: null, createdAt: new Date() },
      { user: "A", action: "CARGÓ Inventarios", entity: "", detail: "", clientId: null, createdAt: new Date() },
      { user: "A", action: "EJECUTÓ", entity: "", detail: "", clientId: null, createdAt: new Date() },
    ]);
    expect(c.balance).toBe(1);
    expect(c.conciliaciones).toBe(2);
    expect(c.modulos).toBe(1);
    expect(c.dian).toBe(0);
  });
});

describe("correo del usuario", () => {
  test("acompaña al nombre en el top y en el detalle; null si no resuelve", () => {
    const resumen = calcularResumenUso({
      eventos: [
        { user: "Ana", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: null, createdAt: "2026-08-10T10:00:00.000Z" },
        { user: "Sin cuenta", action: "EJECUTÓ", entity: "", detail: "", clientId: null, createdAt: "2026-08-10T11:00:00.000Z" },
      ],
      conexiones: [{ usuario: "Ana", total: 3 }],
      periodoDesde: "2026-08-01T00:00:00.000Z",
      periodoHasta: "2026-08-31T23:59:59.999Z",
      correosUsuarios: new Map([["Ana", "ana@russell.co"]]),
    });

    expect(resumen.topUsuarios.find((u) => u.usuario === "Ana")?.correo).toBe("ana@russell.co");
    expect(resumen.topUsuarios.find((u) => u.usuario === "Sin cuenta")?.correo).toBe(null);
    expect(resumen.detalleUsuarios.find((u) => u.usuario === "Ana")?.correo).toBe("ana@russell.co");
    expect(resumen.detalleUsuarios.find((u) => u.usuario === "Sin cuenta")?.correo).toBe(null);
  });
});

describe("solo usuarios creados en la app", () => {
  const eventos = [
    { user: "Ana", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 1, createdAt: "2026-08-10T10:00:00.000Z" },
    { user: "Codex", action: "EDITÓ PROMPT IA", entity: "", detail: "", clientId: 2, createdAt: "2026-08-10T11:00:00.000Z" },
    { user: "Sistema", action: "EJECUTÓ", entity: "", detail: "", clientId: null, createdAt: "2026-08-10T12:00:00.000Z" },
  ];

  test("descarta del reporte completo a quien no tiene cuenta en la plataforma", () => {
    const resumen = calcularResumenUso({
      eventos,
      conexiones: [
        { usuario: "Ana", total: 3 },
        { usuario: "Codex", total: 9 },
      ],
      periodoDesde: "2026-08-01T00:00:00.000Z",
      periodoHasta: "2026-08-31T23:59:59.999Z",
      usuariosRegistrados: ["Ana"],
    });

    expect(resumen.totalAcciones).toBe(1);
    expect(resumen.totalUsuarios).toBe(1);
    // Ni en los tops, ni en el detalle, ni en los clientes tocados, ni en las conexiones.
    expect(resumen.topUsuarios.map((u) => u.usuario)).toEqual(["Ana"]);
    expect(resumen.detalleUsuarios.map((u) => u.usuario)).toEqual(["Ana"]);
    expect(resumen.topClientes.map((c) => c.clienteId)).toEqual([1]);
    expect(resumen.totalConexiones).toBe(3);
  });

  test("sin la lista de cuentas no filtra nada (compatibilidad)", () => {
    const resumen = calcularResumenUso({
      eventos,
      periodoDesde: "2026-08-01T00:00:00.000Z",
      periodoHasta: "2026-08-31T23:59:59.999Z",
    });
    // «Sistema» se sigue excluyendo aparte, como siempre.
    expect(resumen.totalUsuarios).toBe(2);
  });

  test("conteosPorFamiliaCanon aplica la misma regla", () => {
    const eventosCanon = eventos.map((e) => ({ ...e, createdAt: new Date(e.createdAt) }));
    expect(conteosPorFamiliaCanon(eventosCanon).administracion).toBe(1);
    expect(conteosPorFamiliaCanon(eventosCanon, ["Ana"]).administracion).toBe(0);
    expect(conteosPorFamiliaCanon(eventosCanon, ["Ana"]).balance).toBe(1);
  });
});

describe("calcularResumenUso: usuarios activos", () => {
  const params = {
    eventos: [],
    periodoDesde: "2026-08-01T00:00:00.000Z",
    periodoHasta: "2026-08-31T23:59:59.999Z",
  };

  test("lleva el indicador tal cual al resumen cuando viene", () => {
    const usuariosActivos = { total: 68, activos: 4, porcentaje: 5.9, nuncaIngresaron: 59 };
    expect(calcularResumenUso({ ...params, usuariosActivos }).usuariosActivos).toEqual(usuariosActivos);
  });

  test("sin el indicador (o si no se pudo medir) el resumen no trae el campo", () => {
    expect("usuariosActivos" in calcularResumenUso(params)).toBe(false);
    expect("usuariosActivos" in calcularResumenUso({ ...params, usuariosActivos: null })).toBe(false);
  });

  test("no cambia ninguna otra cifra del resumen", () => {
    const sin = calcularResumenUso(params);
    const con = calcularResumenUso({
      ...params,
      usuariosActivos: { total: 1, activos: 1, porcentaje: 100, nuncaIngresaron: 0 },
    });
    expect({ ...con, usuariosActivos: undefined }).toEqual(sin);
  });
});
