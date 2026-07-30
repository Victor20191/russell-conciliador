import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PantallaError } from "./pantalla-error";

describe("PantallaError", () => {
  it("no afirma que un Failed to fetch quedó registrado en el servidor", () => {
    const html = renderToStaticMarkup(
      createElement(PantallaError, {
        error: new TypeError("Failed to fetch"),
        retry: vi.fn(),
      }),
    );

    expect(html).toContain("Se perdió la respuesta de red");
    expect(html).not.toContain("detalle quedó registrado");
  });

  it("muestra el código correlacionable cuando existe digest", () => {
    const error = Object.assign(new Error("Error interno"), { digest: "abc123" });
    const html = renderToStaticMarkup(
      createElement(PantallaError, { error, retry: vi.fn() }),
    );

    expect(html).toContain("detalle quedó registrado");
    expect(html).toContain("abc123");
  });
});
