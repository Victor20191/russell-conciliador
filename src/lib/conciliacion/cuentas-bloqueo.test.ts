import { describe, expect, it } from "vitest";
import { construirCruceContable } from "@/lib/modulos/cruce-contable";
import { anotarCruceConMarcas, type MarcaCruce } from "@/lib/modulos/marcas-cruce";
import {
  cuentasBloqueoDelModulo,
  cuentasRussellDelCruce,
  esResponsableSeniorOGerente,
  evaluarCambiosBloqueados,
  evaluarCierreConciliacion,
  mensajeConciliacionEnFirme,
  validarJustificacionDesbloqueo,
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
