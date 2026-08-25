import { describe, expect, it } from "vitest";
import { hacerBarrasCompatiblesCorreo } from "./preparar-html-correo";

describe("hacerBarrasCompatiblesCorreo", () => {
  it("convierte una barra horizontal vacía en una tabla visible al pegar en correo", () => {
    const html = `
      <div style="display:flex;justify-content:space-between">
        <span>Ana</span><span>6</span>
      </div>
      <div style="height:8px;border-radius:999px;background:#eff1f4;overflow:hidden;">
        <div style="height:100%;width:67%;border-radius:999px;background:#2f6fa7;"></div>
      </div>`;

    const resultado = hacerBarrasCompatiblesCorreo(html);

    expect(resultado).toContain("Ana");
    expect(resultado).toContain('<table role="presentation"');
    expect(resultado).toContain('width="67%"');
    expect(resultado).toContain('bgcolor="#2f6fa7"');
    expect(resultado).toContain('width="33%"');
    expect(resultado).toContain('bgcolor="#eff1f4"');
    expect(resultado).toContain("&nbsp;");
    expect(resultado).not.toContain('style="height:100%;width:67%');
  });

  it("conserva otros div anidados y estilos que no representan barras", () => {
    const html =
      '<div style="padding:16px;background:#ffffff;"><div style="color:#142b4a;">Contenido</div></div>';

    expect(hacerBarrasCompatiblesCorreo(html)).toBe(html);
  });

  it("conserva una barra completa sin agregar una celda de pista vacía", () => {
    const html =
      '<div style="height:10px;background:#eff1f4;overflow:hidden;"><div style="height:100%;width:100%;background:#142b4a;"></div></div>';

    const resultado = hacerBarrasCompatiblesCorreo(html);

    expect(resultado).toContain('width="100%"');
    expect(resultado).toContain('bgcolor="#142b4a"');
    expect(resultado).not.toContain('width="0%"');
  });
});
