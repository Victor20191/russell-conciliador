import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ContenidoCierreBloqueado, FreezeBalanceButton } from "./freeze-balance-button";
import type { BloqueoCierreBalance } from "@/lib/balance/cierre-balance";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/balance", () => ({ freezeBalance: vi.fn() }));
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);

const render = (bloqueo: BloqueoCierreBalance) => renderToStaticMarkup(React.createElement(ContenidoCierreBloqueado, { bloqueo }));

describe("FreezeBalanceButton", () => {
  it("sin bloqueo: el formulario de siempre, con el id del balance", () => {
    const html = renderToStaticMarkup(React.createElement(FreezeBalanceButton, { id: 216 }));
    expect(html).toContain("Cerrar balance");
    expect(html).toContain('name="id"');
    expect(html).toContain('value="216"');
  });

  it("con bloqueo: un botón que abre el modal, sin formulario", () => {
    const html = renderToStaticMarkup(React.createElement(FreezeBalanceButton, { id: 216, bloqueo: { tipo: "prevalidador", mensaje: "No se puede cerrar el balance: el prevalidador todavía no ha sido aprobado." } }));
    expect(html).toContain("Cerrar balance");
    expect(html).not.toContain('name="id"');
    expect(html).not.toMatch(/\sdisabled[=\s>]/); // el botón no se deshabilita: abre el modal
  });
});

describe("ContenidoCierreBloqueado", () => {
  it("diferencias: nombra cada balance, sus cuentas, la acción que lo resuelve y el panel del corte", () => {
    const html = render({
      tipo: "inconsistente",
      balances: [
        { id: 7, version: "v2", nombre: "Diciembre 2025 · Por cuenta", cuentas: 3, accion: "abrir_y_eliminar" },
        { id: 9, version: "v1", nombre: "Enero 2025 – Diciembre 2025", cuentas: 1, accion: "reemplazar" },
      ],
    });
    for (const texto of ["Diciembre 2025 · Por cuenta v2", "difiere en 3 cuenta(s)", "ábrelo y elimínalo", "Reemplazar el balance conciliado", "/balance/9", "#corte"]) {
      expect(html).toContain(texto);
    }
  });

  it("versión anterior: enlaza la vigente", () => {
    const html = render({ tipo: "no_vigente", vigente: { id: 31, version: "v4" } });
    expect(html).toContain("versión anterior");
    expect(html).toContain("/balance/31");
  });

  it("versión anterior cerrada, sin comparar y prevalidador", () => {
    expect(render({ tipo: "version_anterior_cerrada", cerradas: [{ id: 5, version: "v1" }] })).toContain("ábrela antes de cerrar esta");
    expect(render({ tipo: "sin_comparar", pendientes: [{ id: 6, version: "v1", nombre: "Diciembre 2025" }] })).toContain("Revisar comparación");
    expect(render({ tipo: "prevalidador", mensaje: "No se puede cerrar el balance: el prevalidador todavía no ha sido aprobado." })).toContain("todavía no ha sido aprobado");
  });

  it("naturaleza contraria sin «Dar OK»: cuántas faltan y dónde verlas", () => {
    const html = render({ tipo: "saldos_contrarios", pendientes: 14 });
    expect(html).toContain("Faltan 14 cuentas");
    expect(html).toContain("filtra «Naturaleza contraria»");
    expect(render({ tipo: "saldos_contrarios", pendientes: 1 })).toContain("Falta 1 cuenta");
  });
});
