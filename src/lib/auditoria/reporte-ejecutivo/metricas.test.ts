import { describe, expect, test } from "vitest";
import {
  agruparOperaciones,
  calcularResumenUso,
  clasificarFamilia,
  conteosPorFamiliaCanon,
  cuentaCadaVez,
  documentoDeOperacion,
  esAccionAutomatica,
  noEsOperacion,
  familiaDesdeModulo,
  familiaDesdeRuta,
  PASO_PATRON,
  pasoDeAccion,
  textoVolumen,
  volumenDeTrabajo,
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

  test("homologar va por bloques de 10 por persona, documento y día", () => {
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
    // 80 asignaciones del mismo cliente y día = 8 bloques de 10; las otras cuatro, una cada una.
    expect(operaciones).toHaveLength(12);
    expect(operaciones.filter((o) => o.registros === 10)).toHaveLength(8);
    expect(operaciones[0]).toMatchObject({ user: "Ana", clientId: 1, registros: 10 });
  });

  test("repetir el mismo paso el mismo día sobre el mismo cliente es una operación", () => {
    const eventos = [
      ...[1, 2, 3].map((n) => ev("Ana", "IMPORTÓ FORMULARIO DIAN", 1, `2026-11-05T1${n}:00:00.000Z`)),
      ev("Ana", "IMPORTÓ FORMULARIO DIAN", 1, "2026-11-06T10:00:00.000Z"), // otro día
    ];
    expect(agruparOperaciones(eventos).map((o) => o.registros)).toEqual([3, 1]);
  });

  test("cargar o aprobar un borrador y cerrar o abrir cuentan cada vez", () => {
    const eventos = [
      ev("Ana", "CREÓ BORRADOR de balance", 1, "2026-11-05T08:00:00.000Z"),
      ev("Ana", "CREÓ BORRADOR de balance", 1, "2026-11-05T09:00:00.000Z"), // el mismo cliente, el mismo día
      ev("Ana", "LEYÓ archivo de Cartera", 1, "2026-11-05T09:10:00.000Z"),
      ev("Ana", "LEYÓ archivo de Cartera", 1, "2026-11-05T09:20:00.000Z"),
      ev("Ana", "CARGÓ BALANCE", 1, "2026-11-05T10:00:00.000Z"),
      ev("Ana", "CARGÓ Cartera", 1, "2026-11-05T10:10:00.000Z"),
      ev("Ana", "CERRÓ BALANCE", 1, "2026-11-05T11:00:00.000Z"),
      ev("Ana", "ABRIÓ BALANCE", 1, "2026-11-05T11:10:00.000Z"),
      ev("Ana", "CERRÓ BALANCE", 1, "2026-11-05T11:20:00.000Z"),
      ev("Ana", "CERRÓ CONCILIACIÓN (EN FIRME)", 1, "2026-11-05T12:00:00.000Z"),
      ev("Ana", "DESBLOQUEÓ CONCILIACIÓN", 1, "2026-11-05T12:10:00.000Z"),
      ev("Ana", "CERRÓ IVA (EN FIRME)", 1, "2026-11-05T13:00:00.000Z"),
      ev("Ana", "CERRÓ IVA (EN FIRME)", 1, "2026-11-05T13:10:00.000Z"),
    ];
    expect(agruparOperaciones(eventos)).toHaveLength(eventos.length);
  });

  test("cada cuenta nueva del Plan Russell y cada incidente cuentan aparte; editar cuentas, una vez al día", () => {
    const eventos = [
      ev("Ana", "CREÓ CUENTA ESTÁNDAR", null, "2026-11-05T08:00:00.000Z"),
      ev("Ana", "CREÓ CUENTA ESTÁNDAR", null, "2026-11-05T08:05:00.000Z"),
      ev("Ana", "CREÓ CUENTA ESTÁNDAR", null, "2026-11-05T08:10:00.000Z"),
      ev("Ana", "EDITÓ CUENTA ESTÁNDAR", null, "2026-11-05T08:20:00.000Z"),
      ev("Ana", "EDITÓ CUENTA ESTÁNDAR", null, "2026-11-05T08:25:00.000Z"),
      ev("Ana", "REPORTÓ NOVEDAD", null, "2026-11-05T09:00:00.000Z"),
      ev("Ana", "REPORTÓ NOVEDAD", null, "2026-11-05T09:30:00.000Z"),
    ];
    expect(agruparOperaciones(eventos).map((o) => [o.action, o.registros])).toEqual([
      ["CREÓ CUENTA ESTÁNDAR", 1],
      ["CREÓ CUENTA ESTÁNDAR", 1],
      ["CREÓ CUENTA ESTÁNDAR", 1],
      ["EDITÓ CUENTA ESTÁNDAR", 2],
      ["REPORTÓ NOVEDAD", 1],
      ["REPORTÓ NOVEDAD", 1],
    ]);
  });

  test("volver a leer el mismo borrador es una corrección: una vez por cliente y día", () => {
    const eventos = [
      ev("Ana", "CREÓ BORRADOR de balance", 1, "2026-11-05T08:00:00.000Z"),
      ev("Ana", "RELEYÓ BORRADOR de balance", 1, "2026-11-05T08:10:00.000Z"),
      ev("Ana", "RELEYÓ BORRADOR de balance", 1, "2026-11-05T08:20:00.000Z"),
      ev("Ana", "CORRIGIÓ LECTURA DE INVENTARIOS", 1, "2026-11-05T09:00:00.000Z"),
      ev("Ana", "CORRIGIÓ LECTURA DE INVENTARIOS", 1, "2026-11-05T09:10:00.000Z"),
    ];
    expect(agruparOperaciones(eventos).map((o) => [o.action, o.registros])).toEqual([
      ["CREÓ BORRADOR de balance", 1],
      ["RELEYÓ BORRADOR de balance", 2],
      ["CORRIGIÓ LECTURA DE INVENTARIOS", 2],
    ]);
  });

  test("homologar dos balances del mismo cliente el mismo día cuenta por separado (cada 10, una)", () => {
    const conDocumento = (accion: string, balance: number, minuto: number) => ({
      ...ev("Ana", accion, 1, `2026-11-05T10:${String(minuto).padStart(2, "0")}:00.000Z`),
      document: `balance:${balance}`,
    });
    const eventos = [
      ...Array.from({ length: 20 }, (_, i) => conDocumento("ASIGNÓ CUENTA ESTÁNDAR", 101, i)),
      ...Array.from({ length: 15 }, (_, i) => conDocumento("ASIGNÓ CUENTA ESTÁNDAR", 102, 20 + i)),
    ];
    // 20 del balance 101 = 2 bloques; 15 del 102 = 2 (10 + 5).
    expect(agruparOperaciones(eventos).map((o) => o.registros)).toEqual([10, 10, 10, 5]);
  });

  test("cada marca nueva es una operación; editarlas cuenta una vez por conciliación y día", () => {
    const registro = (accion: string, conciliacion: string, minuto: number) => ({
      ...ev("Ana", accion, 1, `2026-11-05T11:${String(minuto).padStart(2, "0")}:00.000Z`),
      document: `conciliacion:${conciliacion}`,
    });
    const eventos = [
      registro("MARCÓ una diferencia del cruce contable", "1-CAR-2026-09", 1),
      registro("MARCÓ una diferencia del cruce contable", "1-CAR-2026-09", 2),
      registro("EDITÓ la marca del cruce contable", "1-CAR-2026-09", 3),
      registro("RETIRÓ la marca del cruce contable", "1-CAR-2026-09", 4),
      registro("MARCÓ una diferencia del cruce contable", "1-INV-2026-09", 5),
    ];
    expect(agruparOperaciones(eventos).map((o) => o.registros)).toEqual([1, 1, 2, 1]);
  });

  test("el Consolidado también va por bloques de 10", () => {
    const eventos = Array.from({ length: 23 }, (_, i) => ({
      ...ev("Ana", "ACTUALIZÓ consolidación de módulo", 1, `2026-11-05T12:${String(i).padStart(2, "0")}:00.000Z`),
      document: "consolidado:1-CAR",
    }));
    expect(agruparOperaciones(eventos).map((o) => o.registros)).toEqual([10, 10, 3]);
  });

  test("el volumen de trabajo cuenta cada unidad y deja fuera los ceros", () => {
    const eventos = [
      ...Array.from({ length: 35 }, (_, i) => ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 1, `2026-11-05T10:${String(i).padStart(2, "0")}:00.000Z`)),
      ...[1, 2, 3].map((i) => ev("Ana", "VALIDÓ alerta de balance", 1, `2026-11-05T11:0${i}:00.000Z`)),
      ev("Ana", "APROBÓ ALERTA", 1, "2026-11-05T11:10:00.000Z"),
      ev("Ana", "MARCÓ DIFERENCIA DE IVA", 1, "2026-11-05T12:00:00.000Z"),
    ];
    expect(volumenDeTrabajo(eventos)).toEqual([
      { nombre: "cuentas homologadas", total: 35 },
      { nombre: "alertas validadas", total: 4 },
      { nombre: "marca", total: 1 },
    ]);
    expect(textoVolumen(volumenDeTrabajo(eventos))).toBe("35 cuentas homologadas · 4 alertas validadas · 1 marca");
  });

  test("sin documento anotado (registros viejos) hace sus veces el cliente; las alertas viejas, su balance", () => {
    expect(documentoDeOperacion(ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 7, "2026-11-05T10:00:00.000Z"), "HOMOLOGÓ CUENTAS DEL BALANCE"))
      .toBe("cliente|7");
    expect(documentoDeOperacion(
      { ...ev("Ana", "VALIDÓ alerta de balance", 7, "2026-11-05T10:00:00.000Z"), entity: "345:fila-12" },
      "VALIDÓ ALERTAS DEL BALANCE",
    )).toBe("balance:345");
    const viejas = [
      { ...ev("Ana", "VALIDÓ alerta de balance", 7, "2026-11-05T10:00:00.000Z"), entity: "345:fila-12" },
      { ...ev("Ana", "VALIDÓ alerta de balance", 7, "2026-11-05T10:01:00.000Z"), entity: "346:fila-3" },
    ];
    expect(agruparOperaciones(viejas)).toHaveLength(2);
  });

  test("descartar, eliminar o borrar algo no es una operación", () => {
    const eventos = [
      "DESCARTÓ BORRADOR de balance",
      "ELIMINÓ BALANCE",
      "ELIMINÓ cuenta del balance",
      "DESCARTÓ FORMULARIO DIAN",
      "ELIMINÓ REVISIÓN DE IVA",
      "ELIMINÓ DATOS DE MÓDULO",
      "BORRÓ PATRÓN DE ARCHIVO",
      "ELIMINÓ un comentario",
      "ELIMINÓ un soporte de la marca del cruce contable",
      "DESCARTÓ LECTURA DE INVENTARIOS",
    ].map((accion, i) => ev("Ana", accion, 1, `2026-11-05T1${i}:00:00.000Z`));
    expect(agruparOperaciones(eventos)).toEqual([]);
    expect(noEsOperacion("QUITÓ PENDIENTE POR ASIGNAR")).toBe(false); // quitar es parte del trabajo
    expect(cuentaCadaVez("DESBLOQUEÓ USUARIO")).toBe(false);
  });

  test("los registros que la plataforma anota sola no son operaciones", () => {
    const eventos = [
      ev("Ana", "CARGÓ BALANCE", 1, "2026-11-05T10:00:00.000Z"),
      ev("Ana", "CAPTURÓ BALANCE POR TERCERO", 1, "2026-11-05T10:00:01.000Z"),
      ev("Ana", "DETECTÓ DIFERENCIAS ENTRE BALANCES DEL CORTE", 1, "2026-11-05T10:00:02.000Z"),
      ev("Ana", "CONCILIACIÓN EN FIRME · INTENTO BLOQUEADO", 1, "2026-11-05T10:00:03.000Z"),
    ];
    expect(agruparOperaciones(eventos).map((o) => o.action)).toEqual(["CARGÓ BALANCE"]);
  });

  test("los 14 casos de la definición de operación", () => {
    const dia = (h: number, m = 0) => `2026-11-05T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
    const casos: Array<[string, ReturnType<typeof ev>[], number]> = [
      ["1. crear un borrador de balance", [ev("Ana", "CREÓ BORRADOR de balance", 1, dia(8))], 1],
      ["2. aprobar el borrador de balance", [
        ev("Ana", "CARGÓ BALANCE", 1, dia(9)),
        ev("Ana", "CONVENCIÓN RELATIVA A LA CLASE", 1, dia(9)),
        ev("Ana", "CAPTURÓ BALANCE POR TERCERO", 1, dia(9)),
        ev("Ana", "DETALLE POR TERCERO INCOMPLETO", 1, dia(9)),
      ], 1],
      ["3. homologar 35 cuentas", [
        ...Array.from({ length: 33 }, (_, i) => ev("Ana", "ASIGNÓ CUENTA ESTÁNDAR", 1, dia(10, i))),
        ev("Ana", "MARCÓ CUENTA PENDIENTE POR ASIGNAR", 1, dia(10, 40)),
        ev("Ana", "QUITÓ PENDIENTE POR ASIGNAR", 1, dia(10, 41)),
      ], 4], // cada 10, una: 10 + 10 + 10 + 5

      ["4. aprobar 4 alertas del balance", [1, 2, 3, 4].map((i) => ev("Ana", "VALIDÓ alerta de balance", 1, dia(11, i))), 1],
      ["5. aprobar el prevalidador", [ev("Ana", "APROBÓ PREVALIDADOR", 1, dia(12))], 1],
      ["6. cerrar el balance", [ev("Ana", "CERRÓ BALANCE", 1, dia(13))], 1],
      ["7. abrir el balance", [ev("Ana", "ABRIÓ BALANCE", 1, dia(14))], 1],
      ["8. cargar un patrón", [
        { ...ev("Ana", "CREÓ PATRÓN DE ARCHIVO", null, dia(8)), entity: "Cartera · SIESA v2" },
        { ...ev("Ana", "SUBIÓ MUESTRA DE PATRÓN", null, dia(8, 5)), entity: "Cartera · SIESA v2" },
        { ...ev("Ana", "INDICÓ EL CLIENTE DE LA MUESTRA DEL PATRÓN", 1, dia(8, 6)), entity: "Cartera · SIESA v2" },
        { ...ev("Ana", "APROBÓ PATRÓN DE ARCHIVO", null, dia(8, 9)), entity: "CAR · SIESA v2" },
      ], 1],
      ["9. cargar el archivo de un módulo", [ev("Ana", "LEYÓ archivo de Cartera", 1, dia(9))], 1],
      ["10. aprobar el borrador de un módulo", [
        ev("Ana", "CARGÓ Cartera", 1, dia(10)),
        ev("Ana", "PROPUSO PATRÓN DE ARCHIVO", 1, dia(10)),
        ev("Ana", "GENERÓ MUESTRA DE PATRÓN", 1, dia(10)),
      ], 1],
      ["11. poner 4 marcas y editar una", [
        ...[1, 2, 3, 4].map((i) => ev("Ana", "MARCÓ una diferencia del cruce contable", 1, dia(11, i))),
        ev("Ana", "EDITÓ la marca del cruce contable", 1, dia(11, 9)),
      ], 5], // cada marca nueva, una; la edición, una
      ["12. aprobar 1 alerta del módulo", [ev("Ana", "APROBÓ ALERTA", 1, dia(12))], 1],
      ["13. cerrar la conciliación", [ev("Ana", "CERRÓ CONCILIACIÓN (EN FIRME)", 1, dia(13))], 1],
      ["14. cargar 10 PDF en IVA", Array.from({ length: 10 }, (_, i) => ev("Ana", "IMPORTÓ FORMULARIO DIAN", 1, dia(14, i))), 1],
      ["14b. y confirmarlos", Array.from({ length: 10 }, (_, i) => ev("Ana", "CONFIRMÓ FORMULARIO DIAN", 1, dia(15, i))), 1],
    ];
    for (const [caso, eventos, esperadas] of casos) {
      expect(agruparOperaciones(eventos), caso).toHaveLength(esperadas);
    }
  });

  test("las alertas del módulo van a «Módulos de conciliación» y crear el borrador al balance", () => {
    expect(clasificarFamilia("APROBÓ ALERTA")).toBe("modulos");
    expect(clasificarFamilia("COMENTÓ ALERTA")).toBe("modulos");
    expect(clasificarFamilia("EDITÓ COMENTARIO DE ALERTA")).toBe("modulos");
    expect(clasificarFamilia("CREÓ BORRADOR de balance")).toBe("balance");
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

  test("reconoce el paso de cada acción, también por prefijo", () => {
    expect(pasoDeAccion("MARCÓ una diferencia del cruce por tercero")).toBe("MARCÓ DIFERENCIAS DEL CRUCE");
    expect(pasoDeAccion("RETIRÓ la marca del cruce contable")).toBe("MARCÓ DIFERENCIAS DEL CRUCE");
    expect(pasoDeAccion("MARCÓ DIFERENCIA DE IVA")).toBe("MARCÓ DIFERENCIAS DE IMPUESTOS");
    expect(pasoDeAccion("EMPAREJÓ 3 terceros del cruce por tercero")).toBe("TRABAJÓ EL CRUCE POR TERCERO");
    expect(pasoDeAccion("COMENTÓ ALERTA")).toBe("ATENDIÓ ALERTAS DEL MÓDULO");
    expect(pasoDeAccion("COMENTÓ")).toBe("COMENTÓ");
    expect(pasoDeAccion("BORRÓ PATRÓN DE ARCHIVO")).toBe(PASO_PATRON);
    expect(pasoDeAccion("CARGÓ BALANCE")).toBe("CARGÓ BALANCE");
    expect(esAccionAutomatica("GENERÓ MUESTRA DE PATRÓN")).toBe(true);
    expect(esAccionAutomatica("CARGÓ BALANCE")).toBe(false);
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

    // 40 homologaciones = 4 bloques; 10 alertas = 1; cargar y cerrar, una cada una.
    expect(resumen.totalAcciones).toBe(7);
    expect(resumen.totalRegistros).toBe(52);
    expect(resumen.porFamilia).toEqual([{ nombre: "Balance de comprobación", total: 7 }]);
    expect(resumen.topUsuarios[0]).toMatchObject({ usuario: "Ana", total: 7 });
    expect(resumen.topClientes[0]).toMatchObject({ clienteId: 1, total: 7 });
    expect(resumen.serieDiaria).toEqual([
      { fecha: "2026-11-05", total: 7, usuarios: [{ usuario: "Ana", total: 7 }] },
    ]);
    // Las acciones se nombran por su paso de trabajo.
    expect(resumen.topAcciones).toEqual([
      { nombre: "HOMOLOGÓ CUENTAS DEL BALANCE", total: 4, registros: 40 },
      { nombre: "CARGÓ BALANCE", total: 1 },
      { nombre: "CERRÓ BALANCE", total: 1 },
      { nombre: "VALIDÓ ALERTAS DEL BALANCE", total: 1, registros: 10 },
    ]);
    expect(resumen.volumen).toEqual([
      { nombre: "cuentas homologadas", total: 40 },
      { nombre: "alertas validadas", total: 10 },
    ]);
    // La última acción es el último registro, no el inicio de la última operación.
    expect(resumen.primeraAccion).toBe("2026-11-05T09:00:00.000Z");
    expect(resumen.ultimaAccion).toBe("2026-11-05T12:00:00.000Z");
    expect(resumen.evidencia.find((e) => e.accion === "HOMOLOGÓ CUENTAS DEL BALANCE")?.registros).toBe(10);
    expect(resumen.evidencia.find((e) => e.accion === "CARGÓ BALANCE")).not.toHaveProperty("registros");
    expect(conteosPorFamiliaCanon(eventos).balance).toBe(7);
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
        // Cada registro de un cliente distinto: son operaciones distintas.
      ].map(([user, createdAt], i) => ({
        user,
        createdAt,
        action: "CARGÓ BALANCE",
        entity: "Balance",
        detail: "",
        clientId: i + 1,
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
      // Otro cliente: otra operación (el mismo cliente el mismo día sería la misma).
      { user: "A", action: "EJECUTÓ", entity: "", detail: "", clientId: 2, createdAt: new Date() },
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
