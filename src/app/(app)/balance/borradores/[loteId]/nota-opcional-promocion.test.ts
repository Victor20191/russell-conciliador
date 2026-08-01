import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotaOpcionalPromocion } from "./nota-opcional-promocion";

describe("nota opcional al promover un balance", () => {
  it("mantiene disponible el campo que viaja al formulario cuando no hay advertencia obligatoria", () => {
    const html = renderToStaticMarkup(
      createElement(NotaOpcionalPromocion, {
        comentario: "",
        onComentarioChange: vi.fn(),
      }),
    );

    expect(html).toContain('form="cargar-balance-oficial"');
    expect(html).toContain('name="comentarioPromocion"');
    expect(html).toContain("Agregar nota (opcional)");
    expect(html).not.toContain("required");
  });

  it("refleja una nota lista para persistirse en la versión oficial", () => {
    const comentario = "Diferencia desde saldo inicial.";
    const html = renderToStaticMarkup(
      createElement(NotaOpcionalPromocion, {
        comentario,
        onComentarioChange: vi.fn(),
      }),
    );

    expect(html).toContain(`value="${comentario}"`);
    expect(html).toContain(`«${comentario}»`);
    expect(html).toContain("Editar nota");
  });
});
