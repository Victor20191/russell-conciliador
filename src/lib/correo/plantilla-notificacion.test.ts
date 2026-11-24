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
  it("sin dirección de Russell el aviso sale completo, sin enlace «Abrir Russell» y sin error", () => {
    // La dirección es opcional: vacía, ausente o solo espacios equivalen a «no configurada».
    for (const urlPlataforma of [undefined, null, "", "   "]) {
      const r = mensajeNotificacion({ titulo: "Balance listo", texto: "El balance quedó cargado.", urlPlataforma, ruta: "/balance/12" });
      expect(r.html).toContain("Balance listo");
      expect(r.html).toContain("El balance quedó cargado.");
      expect(r.html).not.toContain("Abrir Russell");
      expect(r.html).not.toContain("<a ");
      expect(r.html).not.toContain("href=");
      expect(r.texto).toBe("El balance quedó cargado.\n\nAviso automático de Russell Conciliador.");
      expect(r.asunto).toBe("Russell · Balance listo");
    }
    // Sin la clave `urlPlataforma` tampoco hay enlace.
    expect(mensajeNotificacion({ titulo: "Aviso", texto: "Mensaje" }).texto).not.toContain("Abrir Russell");
  });
  it("con dirección válida sí lleva el enlace; con una escrita pero inválida falla con un mensaje claro", () => {
    const con = mensajeNotificacion({ titulo: "Aviso", texto: "Mensaje", urlPlataforma: " https://russell.example ", ruta: "/balance/12" });
    expect(con.texto).toContain("Abrir Russell: https://russell.example/balance/12");
    expect(con.html).toContain("Abrir Russell");
    expect(() => mensajeNotificacion({ titulo: "Aviso", texto: "Mensaje", urlPlataforma: "http://russell.example" })).toThrow(/no es válida/);
  });
});
