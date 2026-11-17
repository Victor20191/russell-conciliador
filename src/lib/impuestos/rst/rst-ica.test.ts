import { describe, expect, it } from "vitest";
import { libroRetencion, type FormularioExcel } from "@/lib/export/retencion";
import { controlesLectura, normalizarLectura, type LecturaCruda } from "../retencion/lectura";
import { vistasRevision } from "../retencion/vistas";
import { aTarifaPorMil, controlesIca, fallasMunicipioIca, type IcaMunicipioCrudo, type MunicipioIca } from "./ica-municipios";

/**
 * Hoja 2 del 2593 (ICA por municipio). Las cifras son las del bimestre 1 de 2026 del recibo real de
 * `rst-cargue.test.ts`: ICA de $10.005.000 en el 43 y el 76, con un solo municipio.
 */

const MEDELLIN: IcaMunicipioCrudo = {
  pagina: "1", departamento: "ANTIOQUIA", codigoDepartamento: "05", municipio: "MEDELLIN", codigoMunicipio: "001",
  renglones: [
    { renglon: 84, valor: "870,016,000" }, { renglon: 85, valor: "0" }, { renglon: 86, valor: "0" }, { renglon: 87, valor: "0" },
    { renglon: 88, valor: "0" }, { renglon: 89, valor: "0" }, { renglon: 90, valor: "870,016,000" }, { renglon: 95, valor: "10,005,000" },
    { renglon: 96, valor: "0" }, { renglon: 97, valor: "10,005,000" }, { renglon: 98, valor: "0" }, { renglon: 99, valor: "10,005,000" },
    { renglon: 100, valor: "0" }, { renglon: 101, valor: "10,005,000" }, { renglon: 102, valor: "0" }, { renglon: 103, valor: "0" },
    { renglon: 104, valor: "10,005,000" }, { renglon: 105, valor: "0" },
  ],
  // 870.016.000 × 11,5 por mil = 10.005.184, que el recibo aproxima a miles.
  actividades: [{ ciiu: "4659", ingresosGravados: "870,016,000", tarifaPorMil: "11,5", impuesto: "10,005,000" }, { ciiu: "", ingresosGravados: "", tarifaPorMil: "", impuesto: "" }],
  tarifaDelMunicipio: "X",
  tarifaDelContribuyente: "",
};

/** El 2593 con lo justo para los controles de la hoja 2: el 43, el 76 y el 37. */
function cruda2593(ica: IcaMunicipioCrudo[] | undefined): LecturaCruda {
  return {
    formulario: "2593", anio: "2026", periodo: "1", numero: "25936612172158", nit: "900000008", dv: "", razonSocial: "CLIENTE SIMPLE DE PRUEBA S.A.S.",
    periodicidad: "", codigoCorreccion: "", numeroAnterior: "", concepto: "", numeroPagado: "", cuota: "", deCuotas: "", fechaLimitePago: "",
    autoadhesivo: "", fechaSello: "",
    renglones: [{ renglon: 43, valor: "10,005,000" }, { renglon: 76, valor: "10,005,000" }, { renglon: 77, valor: "28,033,000" }],
    exterior: [],
    ...(ica ? { ica } : {}),
  };
}

const CTX = { nitCliente: "900000008", anio: 2026, mesCorte: 2, impuesto: "RST" as const, periodicidad: "Bimestral" };
const deIca = (clave: string) => clave.startsWith("ica_");

describe("hoja 2 del 2593: ICA por municipio", () => {
  const lectura = normalizarLectura(cruda2593([MEDELLIN]));
  const [medellin] = lectura.ica;

  it("guarda el municipio, sus casillas y sus actividades; descarta las filas vacías", () => {
    expect(lectura.ica).toHaveLength(1);
    expect(medellin).toMatchObject({ pagina: 1, departamento: "ANTIOQUIA", codigoDepartamento: "05", municipio: "MEDELLIN", codigoMunicipio: "001", origenTarifa: "municipio" });
    expect(medellin.valores).toMatchObject({ 84: 870_016_000, 90: 870_016_000, 99: 10_005_000, 104: 10_005_000, 105: 0 });
    expect(medellin.actividades).toEqual([{ ciiu: "4659", ingresosGravados: 870_016_000, tarifaPorMil: 11.5, impuesto: 10_005_000 }]);
    // Los demás formularios no traen hoja 2.
    expect(normalizarLectura({ ...cruda2593([MEDELLIN]), formulario: "350" }).ica).toEqual([]);
  });

  it("la tarifa por mil conserva sus decimales", () => {
    expect(aTarifaPorMil("9,66")).toBe(9.66);
    expect(aTarifaPorMil("11.04 x mil")).toBe(11.04);
    expect(aTarifaPorMil("")).toBeNull();
  });

  it("con el recibo real todo cuadra: 104 = 76, 99 = 43 y las fórmulas del municipio", () => {
    const controles = controlesLectura(lectura, CTX).filter((c) => deIca(c.clave));
    expect(controles.map((c) => c.clave)).toEqual(["ica_76", "ica_43", "ica_municipio_1"]);
    expect(controles.every((c) => c.ok && !c.bloquea)).toBe(true);
  });

  it("avisa, sin bloquear, cuando la hoja 2 no cuadra con la hoja 1 o consigo misma", () => {
    const mal: MunicipioIca = { ...medellin, valores: { ...medellin.valores, 104: 9_000_000, 90: 1 } };
    const controles = controlesIca(lectura.valores, [mal]);
    expect(controles.find((c) => c.clave === "ica_76")).toMatchObject({ ok: false, mensaje: expect.stringContaining("$9.000.000") });
    const municipio = controles.find((c) => c.clave === "ica_municipio_1")!;
    expect(municipio.ok).toBe(false);
    expect(municipio.mensaje).toContain("MEDELLIN (ANTIOQUIA)");
    expect(fallasMunicipioIca(mal)).toEqual([
      "el 90 dice $1 y 84 − 85 − 86 − 87 − 88 − 89 da $870.016.000",
      "el 104 dice $9.000.000 y 99 + 102 − 100 − 103 da $10.005.000",
    ]);
    expect(controlesLectura(normalizarLectura(cruda2593([MEDELLIN])), CTX).every((c) => !deIca(c.clave) || !c.bloquea)).toBe(true);
  });

  it("el impuesto de una actividad admite el redondeo a miles, no más", () => {
    const actividad = medellin.actividades[0];
    expect(fallasMunicipioIca({ ...medellin, actividades: [{ ...actividad, impuesto: 10_006_000 }], valores: { ...medellin.valores, 95: 10_006_000, 97: 10_006_000, 99: 10_006_000, 101: 10_006_000, 104: 10_006_000 } }))
      .toEqual(["la actividad 4659 tiene impuesto $10.006.000 y $870.016.000 × 11.5 por mil da $10.005.184"]);
  });

  it("un 2593 sin hoja 2 (o leído antes de guardarla) lo avisa", () => {
    const sinHoja = controlesLectura(normalizarLectura(cruda2593(undefined)), CTX).filter((c) => deIca(c.clave));
    expect(sinHoja).toEqual([{ clave: "ica_hoja2", ok: false, bloquea: false, mensaje: expect.stringContaining("vuelve a importarlo") }]);
  });

  it("el Excel lleva la hoja «ICA por municipio» con el municipio y sus actividades", () => {
    const formulario: FormularioExcel = {
      periodo: "Bimestre 01 · Enero-Febrero", formulario: "2593", numero: "25936612172158", estado: "Confirmado", correccionDe: null,
      concepto: null, numeroPagado: null, fecha: null, autoadhesivo: null, corregidoAMano: "", ica: lectura.ica,
    };
    const wb = libroRetencion(
      { impuesto: "Anticipos bimestrales (RST)", cliente: "Cliente", nit: "900000008", anio: 2026, corte: "febrero", periodicidad: "Bimestral" },
      vistasRevision([], "RST", "Bimestral"),
      [formulario],
    );
    const ws = wb.getWorksheet("ICA por municipio")!;
    const textos: string[] = [];
    ws.eachRow((row) => textos.push((row.values as unknown[]).slice(1).map((v) => String(v ?? "")).join("|")));
    expect(textos.some((t) => t.startsWith("Bimestre 01 · Enero-Febrero|25936612172158|Confirmado|MEDELLIN (ANTIOQUIA)|05|001|1|Cuadran|870016000"))).toBe(true);
    expect(textos.some((t) => t === "Bimestre 01 · Enero-Febrero|25936612172158|MEDELLIN (ANTIOQUIA)|4659|870016000|11.5|10005000")).toBe(true);
  });
});
