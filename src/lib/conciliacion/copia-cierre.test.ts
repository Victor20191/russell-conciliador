import { describe, expect, it } from "vitest";
import type { FilaCatalogoPrevalidador } from "@/lib/balance/prevalidador/catalogo";
import { cedulaDelCargue } from "@/lib/modulos/asignacion-periodo";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";
import {
  construirCopiaCierre,
  descripcionCopiaCierre,
  huellaCopiaCierre,
  insumosDesdeCopia,
  leerCopiaCierre,
} from "./copia-cierre";

const regla = (moduloCodigo: string, cuentaRussell: string, extra: Partial<FilaCatalogoPrevalidador> = {}): FilaCatalogoPrevalidador => ({
  id: Number(cuentaRussell),
  moduloCodigo,
  moduloNombre: moduloCodigo,
  moduloOrden: 0,
  cuentaRussell,
  etiqueta: null,
  baseCalculo: "saldo",
  orden: 1,
  activa: true,
  ...extra,
});

const fila = (clasificador: string, cuenta6: string, extra: Record<string, unknown> = {}) => ({
  clasificador,
  cuenta4: cuenta6.slice(0, 4),
  cuenta6,
  agrupador: "",
  descripcion: null,
  grupo: null,
  subcuentaPuc: null,
  cuentaCliente: "",
  soloPeriodo: false,
  ...extra,
});

const base = () => ({
  origen: "cierre" as const,
  tomadaEn: new Date("2026-10-14T15:00:00Z"),
  encabezadoId: 74,
  moduloCodigo: "NOM",
  agruparPor: "codigo" as const,
  consolidacion: {
    filas: [fila("2", "510515", { agrupador: "GYA" }), fila("1", "510506", { agrupador: "GYA", descripcion: "SUELDO" })],
    filasPeriodo: [{ clasificador: "9", agrupador: "", cuenta4: "2370", cuenta6: "237005" }],
  },
  catalogo: [regla("NOM", "5105"), regla("NOM", "7205", { orden: 2 }), regla("CAR", "13"), regla("NOM", "5205", { activa: false })],
  nomina: { reglasClase: new Map([["MOD", "72" as const], ["GYA", "51" as const]]), mapeoCliente: new Map([["51050601", "510506"], ["", "510595"]]) },
  agrupadorasExcluidas: ["5105", "51"],
  umbralDescuadre: null,
});

describe("copia congelada del cierre", () => {
  it("guarda lo evaluado ordenado, solo las reglas activas del módulo y sobrevive a JSON", () => {
    const copia = construirCopiaCierre(base());
    expect(copia.consolidacion.filas.map((f) => f.clasificador)).toEqual(["1", "2"]);
    expect(copia.catalogo.map((r) => r.cuentaRussell)).toEqual(["5105", "7205"]);
    expect(copia.nomina?.clases).toEqual([{ agrupador: "GYA", clase: "51" }, { agrupador: "MOD", clase: "72" }]);
    expect(copia.nomina?.mapeoCliente).toEqual([["51050601", "510506"]]);
    expect(copia.agrupadorasExcluidas).toEqual(["51", "5105"]);

    const leida = leerCopiaCierre(JSON.parse(JSON.stringify(copia)), "NOM");
    expect(leida.ok).toBe(true);
    if (!leida.ok) return;
    const insumos = insumosDesdeCopia(leida.copia);
    expect(insumos.nomina?.reglasClase.get("MOD")).toBe("72");
    expect(insumos.nomina?.mapeoCliente.get("51050601")).toBe("510506");
    expect([...insumos.agrupadorasExcluidas]).toEqual(["51", "5105"]);
    expect(insumos.consolidacion.filasPeriodo).toEqual(base().consolidacion.filasPeriodo);
  });

  it("la huella no depende del orden en que llegan las filas y sí del contenido", () => {
    const a = construirCopiaCierre(base());
    const invertida = base();
    invertida.consolidacion.filas.reverse();
    invertida.catalogo.reverse();
    const b = construirCopiaCierre({ ...invertida, origen: "respaldo", tomadaEn: new Date("2026-11-01T00:00:00Z") });
    expect(b.huella).toBe(a.huella);
    const otra = base();
    otra.consolidacion.filas[0] = fila("2", "510595", { agrupador: "GYA" });
    expect(construirCopiaCierre(otra).huella).not.toBe(a.huella);
  });

  it("rechaza una copia ausente, de otra versión, de otro módulo, malformada o alterada", () => {
    const copia = construirCopiaCierre(base());
    expect(leerCopiaCierre(null, "NOM")).toEqual({ ok: false, motivo: "ausente" });
    expect(leerCopiaCierre({ ...copia, version: 2 }, "NOM")).toEqual({ ok: false, motivo: "version_desconocida" });
    expect(leerCopiaCierre(copia, "CAR")).toEqual({ ok: false, motivo: "invalida" });
    expect(leerCopiaCierre({ ...copia, consolidacion: { filas: [{ clasificador: 1 }], filasPeriodo: [] } }, "NOM")).toEqual({ ok: false, motivo: "invalida" });
    const alterada = JSON.parse(JSON.stringify(copia));
    alterada.consolidacion.filas[0].cuenta6 = "510595";
    expect(leerCopiaCierre(alterada, "NOM")).toEqual({ ok: false, motivo: "invalida" });
    const { huella, ...contenido } = copia;
    const { origen: _o, tomadaEn: _t, ...sinMeta } = contenido;
    void _o;
    void _t;
    expect(huellaCopiaCierre(sinMeta)).toBe(huella);
  });

  it("la cédula que arma el cruce es la misma con los insumos vivos y con los de la copia", () => {
    const vivo = base();
    const copia = leerCopiaCierre(JSON.parse(JSON.stringify(construirCopiaCierre(vivo))), "NOM");
    if (!copia.ok) throw new Error("copia inválida");
    const desdeCopia = insumosDesdeCopia(copia.copia);
    const conVivo = cedulaDelCargue(MODULOS_IMPORT.NOM, "NOM", vivo.catalogo, vivo.consolidacion.filasPeriodo);
    const conCopia = cedulaDelCargue(MODULOS_IMPORT.NOM, "NOM", desdeCopia.catalogoPrevalidador, desdeCopia.consolidacion.filasPeriodo);
    expect(conCopia.cedula.prefijos).toEqual(conVivo.cedula.prefijos);
    expect(conCopia.extras).toEqual(conVivo.extras);
    expect([...conCopia.cedula.delPeriodo.keys()]).toEqual([...conVivo.cedula.delPeriodo.keys()]);
  });

  it("congela la tolerancia de la cédula; una copia anterior al parámetro sigue válida y exige marca en toda diferencia", () => {
    // Copia anterior: sin la llave, su huella es la de siempre y se lee con tolerancia 0.
    const vieja = construirCopiaCierre(base());
    const leidaVieja = leerCopiaCierre(JSON.parse(JSON.stringify(vieja)), "NOM");
    expect(leidaVieja.ok).toBe(true);
    if (!leidaVieja.ok) return;
    expect("toleranciaCedula" in leidaVieja.copia).toBe(false);
    expect(insumosDesdeCopia(leidaVieja.copia).toleranciaCedula).toBe(0);

    const nueva = construirCopiaCierre({ ...base(), toleranciaCedula: 2_000 });
    expect(nueva.huella).not.toBe(vieja.huella);
    const leidaNueva = leerCopiaCierre(JSON.parse(JSON.stringify(nueva)), "NOM");
    expect(leidaNueva.ok).toBe(true);
    if (!leidaNueva.ok) return;
    expect(insumosDesdeCopia(leidaNueva.copia).toleranciaCedula).toBe(2_000);

    // La huella cubre la tolerancia: cambiarla después invalida la copia.
    expect(leerCopiaCierre({ ...JSON.parse(JSON.stringify(nueva)), toleranciaCedula: 50_000 }, "NOM")).toEqual({ ok: false, motivo: "invalida" });
    expect(leerCopiaCierre({ ...JSON.parse(JSON.stringify(nueva)), toleranciaCedula: -1 }, "NOM")).toEqual({ ok: false, motivo: "invalida" });
  });

  it("Activos fijos: congela la tolerancia del detalle; una copia anterior la lee como regla apagada", () => {
    const vieja = leerCopiaCierre(JSON.parse(JSON.stringify(construirCopiaCierre(base()))), "NOM");
    if (!vieja.ok) throw new Error("copia inválida");
    expect(insumosDesdeCopia(vieja.copia).toleranciaDetalleActivos).toBe(Number.POSITIVE_INFINITY);
    const nueva = leerCopiaCierre(JSON.parse(JSON.stringify(construirCopiaCierre({ ...base(), toleranciaDetalleActivos: 10_000 }))), "NOM");
    if (!nueva.ok) throw new Error("copia inválida");
    expect(insumosDesdeCopia(nueva.copia).toleranciaDetalleActivos).toBe(10_000);
  });

  it("describe de dónde salen los insumos", () => {
    const fmt = (iso: string) => iso.slice(0, 10);
    expect(descripcionCopiaCierre({ origen: "cierre", tomadaEn: "2026-10-14T15:00:00Z" }, fmt)).toBe("Insumos congelados al cerrar (2026-10-14).");
    expect(descripcionCopiaCierre({ origen: "respaldo", tomadaEn: "2026-10-20T15:00:00Z" }, fmt)).toContain("respaldo el 2026-10-20");
    expect(descripcionCopiaCierre(null, fmt)).toContain("Sin copia congelada");
  });
});
