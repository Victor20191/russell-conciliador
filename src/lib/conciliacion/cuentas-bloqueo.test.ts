import { describe, expect, it } from "vitest";
import { construirCruceContable } from "@/lib/modulos/cruce-contable";
import { anotarCruceConMarcas, type MarcaCruce, type ResumenMarcas } from "@/lib/modulos/marcas-cruce";
import {
  alcanceDeCierres,
  entraEnAlcance,
  cuentasBloqueoDelModulo,
  cuentasRussellDelCruce,
  decidirCongelarConCierres,
  esResponsableSeniorOGerente,
  evaluarCambiosBloqueados,
  evaluarCierreConciliacion,
  mensajeConciliacionEnFirme,
  mensajeTrasladoCierre,
  validarJustificacionDesbloqueo,
  type CierreParaCongelar,
  type FilaDetalleBloqueo,
} from "./cuentas-bloqueo";

const fila = (cuenta8: string, std: string | null, montos: Partial<FilaDetalleBloqueo> = {}): FilaDetalleBloqueo => ({
  cuenta8,
  cuenta6Russell: std,
  saldoInicial: 0,
  debitos: 0,
  creditos: 0,
  saldoFinal: 0,
  ...montos,
});

const detalle: FilaDetalleBloqueo[] = [
  fila("14350501", "143505", { saldoFinal: 100 }), // INV
  fila("14350502", "143505", { saldoFinal: 50.5 }), // INV
  fila("14050101", "140501", { saldoFinal: 20 }), // INV
  fila("13050501", "130505", { saldoFinal: 900 }), // CAR (otro módulo)
  fila("11050501", "110505", { saldoFinal: 10 }), // caja
  fila("14990101", null, { saldoFinal: 5 }), // sin homologar: no entra
];

describe("cuentasBloqueoDelModulo", () => {
  it("bloquea solo las cuentas homologadas a cuentas Russell del módulo", () => {
    const bloqueadas = cuentasBloqueoDelModulo(detalle, new Set(["1435", "1405"]));
    expect(bloqueadas.map((b) => b.cuenta8)).toEqual(["14050101", "14350501", "14350502"]);
    expect(bloqueadas.find((b) => b.cuenta8 === "14350502")?.saldoFinal).toBe(50.5);
  });

  it("no bloquea cuentas de otro módulo ni cuentas sin homologar", () => {
    const bloqueadas = cuentasBloqueoDelModulo(detalle, ["1435"]);
    expect(bloqueadas.map((b) => b.cuenta8)).toEqual(["14350501", "14350502"]);
  });

  it("colapsa filas repetidas (detalle por tercero) por cuenta_8", () => {
    const porTercero = [
      fila("14350501", "143505", { saldoFinal: 60 }),
      fila("14350501", "143505", { saldoFinal: 40 }),
    ];
    expect(cuentasBloqueoDelModulo(porTercero, ["1435"])).toHaveLength(1);
  });
});

describe("cuentasRussellDelCruce", () => {
  it("lista las cuentas de la cédula, sin repetir y ordenadas", () => {
    const cruce = construirCruceContable({
      contablePorCuenta: { "1435": 100, "1405": 20 },
      consolidado: [{ clasificador: "A", total: 100, cuentas4: ["1435"] }],
      nombrePorCuenta: () => null,
    });
    expect(cuentasRussellDelCruce(cruce)).toEqual(["1405", "1435"]);
  });

  it("reduce al subgrupo las claves de una cédula a 6 dígitos (Nómina)", () => {
    const cruce = construirCruceContable({
      contablePorCuenta: { "510506": 100, "510530": 20, "720505": 5 },
      consolidado: [{ clasificador: "001", total: 100, cuentas4: ["510506"] }],
      nombrePorCuenta: () => null,
    });
    expect(cuentasRussellDelCruce(cruce)).toEqual(["5105", "7205"]);
  });

  it("una fila agrupada aporta todas sus cuentas", () => {
    const cruce = construirCruceContable({
      contablePorCuenta: { "130505": 100, "280505": -10 },
      consolidado: [{ clasificador: "GLOBAL", total: 90, cuentas4: ["130505", "280505"] }],
      nombrePorCuenta: () => null,
      agruparMultiAsignados: true,
    });
    expect(cuentasRussellDelCruce(cruce)).toEqual(["1305", "2805"]);
  });
});

describe("evaluarCierreConciliacion", () => {
  const marca = (cuenta4: string, diferencia: number): MarcaCruce => ({
    cuenta4,
    numero: 1,
    nota: "Explicación",
    referenciaAnexo: null,
    diferencia,
    marcadoPor: "Ana",
    marcadoEn: "hoy",
    comentarioId: null,
    adjuntos: [],
    noModulares: [],
  });

  it("cierra cuando el cruce cuadra", () => {
    const cruce = construirCruceContable({
      contablePorCuenta: { "1435": 100 },
      consolidado: [{ clasificador: "A", total: 100, cuentas4: ["1435"] }],
      nombrePorCuenta: () => null,
    });
    const { resumen } = anotarCruceConMarcas(cruce.filas, []);
    expect(evaluarCierreConciliacion(cruce, resumen)).toEqual({ ok: true });
  });

  it("rechaza diferencias sin marca y marcas desactualizadas", () => {
    const cruce = construirCruceContable({
      contablePorCuenta: { "1435": 100 },
      consolidado: [{ clasificador: "A", total: 80, cuentas4: ["1435"] }],
      nombrePorCuenta: () => null,
    });
    const sinMarca = anotarCruceConMarcas(cruce.filas, []).resumen;
    expect(evaluarCierreConciliacion(cruce, sinMarca).ok).toBe(false);
    const desactualizada = anotarCruceConMarcas(cruce.filas, [marca("1435", 5)]).resumen;
    expect(evaluarCierreConciliacion(cruce, desactualizada).ok).toBe(false);
    const vigente = anotarCruceConMarcas(cruce.filas, [marca("1435", 20)]).resumen;
    expect(evaluarCierreConciliacion(cruce, vigente)).toEqual({ ok: true });
  });

  it("no cierra un cruce vacío", () => {
    expect(evaluarCierreConciliacion(null, null).ok).toBe(false);
    expect(evaluarCierreConciliacion({ filas: [] }, null).ok).toBe(false);
  });
});

describe("evaluarCambiosBloqueados", () => {
  const bloqueadas = cuentasBloqueoDelModulo(detalle, ["1435", "1405"]);
  const cerradas = new Set(["1435", "1405"]);

  it("acepta una versión idéntica en las cuentas bloqueadas aunque cambien otras", () => {
    const nueva = detalle.map((f) => (f.cuenta8 === "11050501" ? { ...f, saldoFinal: 999 } : f));
    expect(evaluarCambiosBloqueados(bloqueadas, nueva, cerradas)).toEqual([]);
  });

  it("detecta cambios de importes, homologación y cuentas ausentes", () => {
    const nueva = detalle
      .filter((f) => f.cuenta8 !== "14050101")
      .map((f) =>
        f.cuenta8 === "14350501"
          ? { ...f, debitos: 1 }
          : f.cuenta8 === "14350502"
            ? { ...f, cuenta6Russell: "143510" }
            : f,
      );
    const v = evaluarCambiosBloqueados(bloqueadas, nueva, cerradas);
    expect(v.map((x) => `${x.cuenta8}:${x.motivo}`).sort()).toEqual([
      "14050101:ausente",
      "14350501:valores",
      "14350502:homologacion",
    ]);
  });

  it("detecta una cuenta nueva homologada al módulo cerrado", () => {
    const nueva = [...detalle, fila("14350599", "143505", { saldoFinal: 1 })];
    const v = evaluarCambiosBloqueados(bloqueadas, nueva, cerradas);
    expect(v).toEqual([expect.objectContaining({ cuenta8: "14350599", motivo: "nueva_en_modulo" })]);
  });

  it("tolera diferencias por debajo del centavo", () => {
    const nueva = detalle.map((f) => (f.cuenta8 === "14350502" ? { ...f, saldoFinal: 50.504 } : f));
    expect(evaluarCambiosBloqueados(bloqueadas, nueva, cerradas)).toEqual([]);
  });
});

// Congelar en un período con conciliación en firme usa el MISMO predicado que cargar
// (`evaluarCambiosBloqueados`): si las cuentas en firme son idénticas, se congela y el
// cierre se traslada; si cambian, se bloquea con el detalle.
describe("decidirCongelarConCierres", () => {
  const bloqueadas = cuentasBloqueoDelModulo(detalle, ["1435", "1405"]);
  const cierre = (over: Partial<CierreParaCongelar> = {}): CierreParaCongelar => ({
    id: 7, moduloCodigo: "INV", periodo: "2026-03", balancePeriodo: "Marzo 2026",
    balanceEncabezadoId: 215, moduloDatoEncabezadoId: 38, cerradoPor: "Camilo", cuentasRussell: ["1435", "1405"],
    ...over,
  });

  it("sin cierres en el período, se congela como siempre", () => {
    expect(decidirCongelarConCierres({ balanceId: 216, cierres: [], bloqueadas, filasNuevas: detalle })).toEqual({ tipo: "sin_cierres" });
  });

  it("si todo cierre ya apunta al balance que se congela, se congela como siempre", () => {
    expect(decidirCongelarConCierres({ balanceId: 215, cierres: [cierre()], bloqueadas, filasNuevas: detalle })).toEqual({ tipo: "mismo_balance" });
  });

  it("traslada cuando las cuentas en firme son idénticas aunque cambien otras cuentas", () => {
    // Igual que al cargar: caja cambia, Inventarios no.
    const nueva = detalle.map((f) => (f.cuenta8 === "11050501" ? { ...f, saldoFinal: 999 } : f));
    const d = decidirCongelarConCierres({ balanceId: 216, cierres: [cierre()], bloqueadas, filasNuevas: nueva });
    expect(d.tipo).toBe("traslado");
    if (d.tipo !== "traslado") return;
    expect(d.cierres.map((c) => c.id)).toEqual([7]);
    expect(d.cuentasEnFirme).toBe(3); // 14350501, 14350502, 14050101
  });

  it("bloquea si una cuenta en firme cambia un centavo en el saldo", () => {
    const nueva = detalle.map((f) => (f.cuenta8 === "14350501" ? { ...f, saldoFinal: 100.01 } : f));
    const d = decidirCongelarConCierres({ balanceId: 216, cierres: [cierre()], bloqueadas, filasNuevas: nueva });
    expect(d).toMatchObject({ tipo: "bloqueado", violaciones: [expect.objectContaining({ cuenta8: "14350501", motivo: "valores" })] });
  });

  it("bloquea si una cuenta en firme cambia de homologación", () => {
    const nueva = detalle.map((f) => (f.cuenta8 === "14350502" ? { ...f, cuenta6Russell: "143510" } : f));
    const d = decidirCongelarConCierres({ balanceId: 216, cierres: [cierre()], bloqueadas, filasNuevas: nueva });
    expect(d).toMatchObject({ tipo: "bloqueado", violaciones: [expect.objectContaining({ cuenta8: "14350502", motivo: "homologacion" })] });
  });

  it("bloquea si aparece una cuenta nueva homologada al módulo cerrado", () => {
    const nueva = [...detalle, fila("14350599", "143505", { saldoFinal: 1 })];
    const d = decidirCongelarConCierres({ balanceId: 216, cierres: [cierre()], bloqueadas, filasNuevas: nueva });
    expect(d).toMatchObject({ tipo: "bloqueado", violaciones: [expect.objectContaining({ cuenta8: "14350599", motivo: "nueva_en_modulo" })] });
  });

  it("con un cierre propio y uno ajeno, solo el ajeno decide y se traslada", () => {
    const propio = cierre({ id: 1, moduloCodigo: "CAR", balanceEncabezadoId: 216, cuentasRussell: ["1305"] });
    const ajeno = cierre({ id: 2, moduloCodigo: "INV", balanceEncabezadoId: 215 });
    const conCierre = [
      ...cuentasBloqueoDelModulo(detalle, ["1305"]).map((b) => ({ ...b, cierreId: 1 })),
      ...bloqueadas.map((b) => ({ ...b, cierreId: 2 })),
    ];
    const d = decidirCongelarConCierres({ balanceId: 216, cierres: [propio, ajeno], bloqueadas: conCierre, filasNuevas: detalle });
    expect(d.tipo).toBe("traslado");
    if (d.tipo !== "traslado") return;
    expect(d.cierres.map((c) => c.id)).toEqual([2]);
    expect(d.cuentasEnFirme).toBe(3); // solo las del cierre ajeno; la de Cartera no se traslada
  });
});

describe("mensajeTrasladoCierre", () => {
  it("nombra módulo, período, cargue, quién cerró y cuántas cuentas, con el plural correcto", () => {
    const cierres = [{ moduloCodigo: "INV", periodo: "2025-12", moduloDatoEncabezadoId: 38, cerradoPor: "Camilo Perez Rojo" }];
    const msg = mensajeTrasladoCierre(cierres, 3);
    expect(msg).toContain("3 cuentas en firme idénticas");
    expect(msg).toContain("INV · 2025-12");
    expect(msg).toContain("cargue #38");
    expect(msg).toContain("Camilo Perez Rojo");
    expect(mensajeTrasladoCierre(cierres, 1)).toContain("1 cuenta en firme idéntica ");
  });
});

describe("mensajeConciliacionEnFirme", () => {
  it("nombra módulo, período y cierre, y resume las violaciones", () => {
    const msg = mensajeConciliacionEnFirme(
      [{ moduloCodigo: "INV", periodo: "2026-03", cerradoPor: "Ana", moduloDatoEncabezadoId: 12 }],
      [{ cuenta8: "14350501", motivo: "valores", detalle: "14350501 cambia débitos" }],
    );
    expect(msg).toContain("INV · 2026-03");
    expect(msg).toContain("cargue #12");
    expect(msg).toContain("14350501 cambia débitos");
  });
});

describe("validarJustificacionDesbloqueo", () => {
  it("exige un mínimo de texto y normaliza espacios", () => {
    expect(validarJustificacionDesbloqueo("   ").ok).toBe(false);
    expect(validarJustificacionDesbloqueo("corta").ok).toBe(false);
    const ok = validarJustificacionDesbloqueo("  Se  recibió un balance corregido\n del cliente ");
    expect(ok).toEqual({ ok: true, justificacion: "Se recibió un balance corregido del cliente" });
  });
});

describe("esResponsableSeniorOGerente", () => {
  const ahora = new Date("2026-09-05T00:00:00Z");
  const base = { active: true, validFrom: new Date("2026-01-01T00:00:00Z"), validUntil: null as Date | null };
  it("acepta senior o gerente vigente y rechaza staff, inactivos o vencidos", () => {
    expect(esResponsableSeniorOGerente([{ ...base, role: "senior", userId: 7 }], 7, ahora)).toBe(true);
    expect(esResponsableSeniorOGerente([{ ...base, role: "gerente", userId: 7 }], 7, ahora)).toBe(true);
    expect(esResponsableSeniorOGerente([{ ...base, role: "staff", userId: 7 }], 7, ahora)).toBe(false);
    expect(esResponsableSeniorOGerente([{ ...base, role: "senior", userId: 7, active: false }], 7, ahora)).toBe(false);
    expect(esResponsableSeniorOGerente([{ ...base, role: "senior", userId: 7, validUntil: new Date("2026-08-01T00:00:00Z") }], 7, ahora)).toBe(false);
    expect(esResponsableSeniorOGerente([{ ...base, role: "senior", userId: 8 }], 7, ahora)).toBe(false);
  });
});

describe("cierre por cuentas Russell de 6 dígitos (Cartera y CxP)", () => {
  const CARTERA6 = ["130505", "130510", "280505"];
  const cartera: FilaDetalleBloqueo[] = [
    fila("13050501", "130505", { saldoFinal: 900 }),
    fila("13051501", "130515", { saldoFinal: 40 }), // trabajadores: fuera del módulo
    fila("28050501", "280505", { saldoFinal: -30 }),
  ];

  it("bloquea solo las cuentas del módulo: 130515 no queda en firme", () => {
    expect(cuentasBloqueoDelModulo(cartera, ["1305", "2805"], CARTERA6).map((b) => b.cuenta8)).toEqual(["13050501", "28050501"]);
  });

  it("una cuenta nueva homologada a 130515 no entra al módulo cerrado; una a 130510 sí", () => {
    const bloqueadas = cuentasBloqueoDelModulo(cartera, ["1305", "2805"], CARTERA6);
    const alcance = alcanceDeCierres([{ cuentasRussell: ["1305", "2805"], cuentasRussell6: CARTERA6 }]);
    const nuevas = [...cartera, fila("13051502", "130515", { saldoFinal: 5 }), fila("13051001", "130510", { saldoFinal: 7 })];
    expect(evaluarCambiosBloqueados(bloqueadas, nuevas, alcance).map((v) => [v.cuenta8, v.motivo])).toEqual([["13051001", "nueva_en_modulo"]]);
  });

  it("los cierres anteriores, sin cuentas de 6, siguen comparando por cuenta de 4", () => {
    const alcance = alcanceDeCierres([{ cuentasRussell: ["1435"] }, { cuentasRussell: ["1305"], cuentasRussell6: ["130505"] }]);
    expect([...alcance.cuentas4]).toEqual(["1435"]);
    expect([...alcance.cuentas6]).toEqual(["130505"]);
    expect(entraEnAlcance("143599", alcance)).toBe(true);
    expect(entraEnAlcance("130515", alcance)).toBe(false);
    expect(entraEnAlcance("130505", alcance)).toBe(true);
    expect(entraEnAlcance(null, alcance)).toBe(false);
  });
});

describe("evaluarCierreConciliacion con cruce por tercero", () => {
  const cuadra = construirCruceContable({
    contablePorCuenta: { "1305": 100 },
    consolidado: [{ clasificador: "CARTERA", total: 100, cuentas4: ["1305"] }],
    nombrePorCuenta: () => null,
  });
  const marcas = (p: Partial<ResumenMarcas>): ResumenMarcas => ({ conDiferencia: 0, marcadas: 0, pendientes: 0, desactualizadas: 0, montoPendiente: 0, ...p });

  it("exige el cruce por tercero disponible y sin diferencias pendientes o desactualizadas", () => {
    expect(evaluarCierreConciliacion(cuadra, null, { exigido: true, estado: "sin_detalle_tercero", mensaje: "El balance v1 del período no conserva detalle por tercero.", resumenMarcas: null }))
      .toEqual({ ok: false, motivo: "El cruce por tercero es obligatorio para cerrar y no está disponible: El balance v1 del período no conserva detalle por tercero." });
    expect(evaluarCierreConciliacion(cuadra, null, { exigido: true, estado: "listo", mensaje: null, resumenMarcas: marcas({ conDiferencia: 3, marcadas: 1, pendientes: 2 }) }))
      .toMatchObject({ ok: false, motivo: expect.stringContaining("2 diferencia(s) por tercero sin marca") });
    expect(evaluarCierreConciliacion(cuadra, null, { exigido: true, estado: "listo", mensaje: null, resumenMarcas: marcas({ conDiferencia: 1, marcadas: 1, desactualizadas: 1 }) }))
      .toMatchObject({ ok: false });
    expect(evaluarCierreConciliacion(cuadra, null, { exigido: true, estado: "listo", mensaje: null, resumenMarcas: marcas({ conDiferencia: 2, marcadas: 2, bajoUmbral: 5 }) }))
      .toEqual({ ok: true });
  });

  it("donde no se exige, el cruce por tercero no condiciona el cierre", () => {
    expect(evaluarCierreConciliacion(cuadra, null, { exigido: false, estado: "sin_balance", mensaje: null, resumenMarcas: null })).toEqual({ ok: true });
  });
});
