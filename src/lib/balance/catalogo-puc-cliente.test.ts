import { describe, expect, it } from "vitest";
import { consolidarPucCliente } from "./catalogo-puc-cliente";

const cuenta = (id: number, code: string, cuenta6Russell: string | null = "110505") => ({
  id, code, name: `Cuenta ${code}`, cuenta6Russell, coincidencia: 100,
  origenMapeo: "manual", actualizadoPor: null, actualizadoEn: null,
});

describe("PUC acumulado del cliente", () => {
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
});
