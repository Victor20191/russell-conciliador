import { describe, expect, it } from "vitest";
import { consolidarPucCliente, type CuentaCatalogo } from "./catalogo-puc-cliente";

const cuenta = (id: number, code: string, cuenta6Russell: string | null = "110505") => ({
  id, code, name: `Cuenta ${code}`, cuenta6Russell, coincidencia: 100,
  origenMapeo: "manual", actualizadoPor: null, actualizadoEn: null,
});

describe("PUC acumulado del cliente", () => {
  it("recupera los nombres originales sin reemplazar una homologación manual", () => {
    const r = consolidarPucCliente([{ ...cuenta(1, "110505"), name: "110505" }], [], [
      { ...cuenta(10, "1105", null), name: "Efectivo ERP" },
      { ...cuenta(10, "110505", null), name: "Caja ERP" },
    ]);
    expect(r[0]).toMatchObject({ code: "1105", name: "Efectivo ERP", enMemoria: false });
    expect(r[1]).toMatchObject({ name: "Caja ERP", cuenta6Russell: "110505", enMemoria: true });
  });
  it("no crea agrupadoras ni prefijos que no existen en el catálogo", () => {
    const r = consolidarPucCliente([cuenta(1, "110505"), cuenta(2, "11050501010101")], []);
    expect(r.map((c) => c.code)).toEqual(["110505", "11050501010101"]);
  });
  it("excluye totales sin código y rótulos legados del catálogo de cuentas", () => {
    expect(consolidarPucCliente([cuenta(1, ""), cuenta(2, "Total"), cuenta(3, "110505")], [cuenta(4, " ")]).map((c) => c.code)).toEqual(["110505"]);
  });
  it("reúne cuentas de distintos balances sin duplicar ni perder las ausentes del último", () => {
    const r = consolidarPucCliente([cuenta(1, "110505")], [cuenta(30, "11050501"), cuenta(20, "11050502"), cuenta(10, "11050501")]);
    expect(r.map((c) => c.code)).toEqual(["110505", "11050501", "11050502"]);
    expect(r[1]).toMatchObject({ id: -30, enMemoria: false });
  });
  it("respeta la memoria actual incluso si se quitó una homologación histórica", () => {
    const r = consolidarPucCliente([cuenta(1, "11050501", null)], [cuenta(2, "11050501")]);
    expect(r[0]).toMatchObject({ id: 1, cuenta6Russell: null, enMemoria: true });
  });
  it("distingue los niveles reales 8, 10, 12 y 14 sin truncar los códigos", () => {
    const codes = ["11050501", "1105050101", "110505010101", "11050501010101"];
    expect(consolidarPucCliente(codes.map((code, i) => cuenta(i + 1, code)), []).map((c) => [c.code, c.level]))
      .toEqual(codes.map((code) => [code, code.length]));
  });

  const automatica = (id: number, code: string, std: string | null = null): CuentaCatalogo => ({
    ...cuenta(id, code, std), origenMapeo: "automatico",
  });
  const original = (code: string, tipoFila: "agrupadora" | "movimiento", fechaBalance = "2026-09-05T12:00:00Z"): CuentaCatalogo => ({
    ...automatica(240, code), tipoFila, fechaBalance,
  });

  it("REDPLAS: retira las siete filas señaladas y conserva sus cuentas reales", () => {
    const r = consolidarPucCliente([
      automatica(1, "100000"), { ...automatica(2, "100000000000000"), name: "Activos" },
      automatica(3, "110505", "110505"),
    ], [
      { ...automatica(69, "100000000000000"), fechaBalance: "2026-07-14T19:42:20Z" },
      { ...automatica(240, "11050505"), fechaBalance: "2026-09-05T12:00:00Z" },
    ], [original("100000000000000", "agrupadora"), original("1105", "agrupadora")]);
    const codigos = r.map((c) => c.code);
    expect(codigos).toEqual(["1105", "110505", "11050505"]);
    for (const code of ["1000", "100000", "10000000", "1000000000", "100000000000", "10000000000000", "100000000000000"]) {
      expect(codigos).not.toContain(code);
    }
  });

  it.each(["manual", "manual_cuenta", "pendiente"])("conserva decisiones humanas %s sin respaldo y ante una agrupadora posterior", (origenMapeo) => {
    const r = consolidarPucCliente([
      { ...automatica(1, "100000000000000"), origenMapeo },
      { ...automatica(2, "99999999"), origenMapeo },
    ], [], [original("100000000000000", "agrupadora")]);
    expect(r.map((c) => c.code)).toEqual(["100000000000000", "99999999"]);
    expect(r.every((c) => c.enMemoria)).toBe(true);
  });

  it("no confunde una cuenta imputable que termina en ceros con un resumen", () => {
    expect(consolidarPucCliente([], [], [original("100000", "movimiento"), original("110500", "agrupadora")]))
      .toMatchObject([{ code: "100000", tipoFila: "movimiento" }, { code: "110500", tipoFila: "agrupadora" }]);
  });

  it("conserva un código de clase imputable sin evidencia de agrupadora", () => {
    expect(consolidarPucCliente([], [automatica(77, "100000000000000")]).map((c) => c.code))
      .toEqual(["100000000000000"]);
  });

  it("un movimiento posterior prevalece sobre la antigua agrupadora sin usar la fecha de edición", () => {
    const r = consolidarPucCliente([], [{
      ...automatica(300, "100000000000000"), fechaBalance: "2026-09-06T12:00:00Z", actualizadoEn: "2026-07-01T12:00:00Z",
    }], [original("100000000000000", "agrupadora")]);
    expect(r).toMatchObject([{ code: "100000000000000", tipoFila: "movimiento" }]);
  });

  it("conserva la imputable cuando el mismo balance contiene un movimiento y una agrupadora del mismo código", () => {
    const fechaBalance = "2026-09-05T12:00:00Z";
    const r = consolidarPucCliente([], [{
      ...automatica(240, "100000000000000"), fechaBalance, tipoFila: "movimiento",
    }], [original("100000000000000", "agrupadora", fechaBalance)]);
    expect(r).toMatchObject([{ code: "100000000000000", tipoFila: "movimiento" }]);
  });

  it("la última clasificación prevalece aunque un detalle viejo se editó después", () => {
    expect(consolidarPucCliente([], [{
      ...automatica(77, "100000000000000"), fechaBalance: "2026-07-14T12:00:00Z", actualizadoEn: "2026-09-07T12:00:00Z",
    }], [original("100000000000000", "agrupadora")])).toEqual([]);
  });

  it("conserva grupos memorizados con descendientes reales y reglas válidas sin generar otros grupos", () => {
    const r = consolidarPucCliente([
      automatica(1, "110505"), automatica(2, "130505", "130505"),
      automatica(3, "140505"), automatica(4, "150505", "410505"),
    ], [automatica(10, "11050501"), automatica(11, "22050501")]);
    expect(r.map((c) => c.code)).toEqual(["110505", "11050501", "130505", "22050501"]);
    expect(r[0]).toMatchObject({ tipoFila: "agrupadora", enMemoria: true, cuenta6Russell: null });
  });

  it("identifica agrupadoras originales aunque tengan memoria y no modifica las entradas", () => {
    const memoria = [Object.freeze({ ...automatica(1, "1105"), name: "1105" })];
    const originales = [Object.freeze({ ...original("1105", "agrupadora"), name: "CAJA" })];
    const antes = structuredClone({ memoria, originales });
    const r = consolidarPucCliente(Object.freeze(memoria), [], Object.freeze(originales));
    expect(r).toMatchObject([{ code: "1105", name: "CAJA", tipoFila: "agrupadora", enMemoria: true }]);
    expect({ memoria, originales }).toEqual(antes);
  });
});
