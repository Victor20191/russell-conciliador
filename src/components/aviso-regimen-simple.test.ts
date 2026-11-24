import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CUENTAS_IVA_RST, MAPEO_F2593_FABRICA } from "@/lib/impuestos/rst/mapeo-f2593";
import { AvisoRegimenSimple, CUENTAS_AVISO_REGIMEN_SIMPLE } from "./aviso-regimen-simple";

/** El aviso de los clientes del Régimen Simple en el balance, el borrador y Mapeo cuentas cliente. */
describe("aviso de cliente del Régimen Simple", () => {
  it("nombra las cuatro cuentas propias del RST, las mismas contra las que cruza el IVA del 2593", () => {
    expect(CUENTAS_AVISO_REGIMEN_SIMPLE).toEqual(["240855", "240856", "240857", "240858"]);
    const delCruce = MAPEO_F2593_FABRICA.filter((f) => f.concepto === "iva_generado" || f.concepto === "iva_descontable").flatMap((f) => (f.cuentaRussell ?? "").split("+"));
    expect([...delCruce].sort()).toEqual([...CUENTAS_IVA_RST.generado, ...CUENTAS_IVA_RST.descontable].sort());
  });

  it("dice que es cliente del Régimen Simple y qué IVA homologar a cada cuenta", () => {
    const html = renderToStaticMarkup(createElement(AvisoRegimenSimple));
    expect(html).toContain("Cliente de Régimen Simple de Tributación");
    expect(html).toContain("Recuerda homologar el IVA generado, el descontable y el de devoluciones con las cuentas propias del RST");
    for (const [cuenta, nombre] of [
      ["240855", "IVA generado"],
      ["240856", "IVA por devoluciones, anulaciones y ajustes en compras"],
      ["240857", "IVA descontable"],
      ["240858", "IVA por devoluciones, anulaciones y ajustes en ventas"],
    ]) {
      expect(html).toMatch(new RegExp(`${cuenta}</span> ${nombre}`));
    }
  });
});
