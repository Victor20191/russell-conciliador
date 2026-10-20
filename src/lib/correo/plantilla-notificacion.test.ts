import { describe, expect, it } from "vitest";
import { mensajeNotificacion } from "./plantilla-notificacion";

describe("correo de Russell", () => {
  it("escapa texto y conserva una alternativa legible sin HTML", () => {
    const r = mensajeNotificacion({ titulo: "<img>\r\nAviso", texto: '<script>secreto</script> & "cuenta"', urlPlataforma: "https://russell.example", ruta: "/balance/12#corte" });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain('href="https://russell.example/balance/12#corte"');
    expect(r.texto).toContain('<script>secreto</script>');
    expect(r.asunto).not.toMatch(/[\r\n]/);
  });
  it("impide enlaces a otro origen, protocolos inseguros y credenciales", () => {
    for (const urlPlataforma of ["http://example.com", "https://usuario:clave@example.com", "https://example.com?r=secreto", "https://example.com/ruta"]) {
      expect(() => mensajeNotificacion({ titulo: "Aviso", texto: "Mensaje", urlPlataforma })).toThrow();
    }
    for (const ruta of ["//otro.example", "/\\otro.example", "javascript:alert(1)"]) {
      expect(() => mensajeNotificacion({ titulo: "Aviso", texto: "Mensaje", urlPlataforma: "https://russell.example", ruta })).toThrow();
    }
  });
});
