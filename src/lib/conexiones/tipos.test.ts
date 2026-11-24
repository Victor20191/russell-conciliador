import { describe, expect, it } from "vitest";
import {
  clavesCredencialesVisibles,
  credencialesIniciales,
  normalizarCredencial,
  PROVEEDORES,
  proveedorPorClave,
} from "./tipos";

describe("credenciales visibles del catálogo", () => {
  it("solo el usuario de SMTP y de Gmail está marcado como visible: ningún secreto", () => {
    const visibles = PROVEEDORES.flatMap((p) =>
      p.camposCredenciales.filter((c) => c.visible).map((c) => `${p.clave}.${c.clave}`),
    );
    expect(visibles).toEqual(["smtp.usuario", "gmail.usuario"]);
    expect(clavesCredencialesVisibles(proveedorPorClave("smtp"))).toEqual(["usuario"]);
    expect(clavesCredencialesVisibles(proveedorPorClave("gmail"))).toEqual(["usuario"]);
    for (const clave of ["anthropic", "gemini", "cloudflare_r2", "api_rest", "microsoft365"]) {
      expect(clavesCredencialesVisibles(proveedorPorClave(clave)), clave).toEqual([]);
    }
    expect(clavesCredencialesVisibles(null)).toEqual([]);
  });

  it("el formulario precarga el usuario guardado y deja vacías las credenciales secretas", () => {
    const smtp = proveedorPorClave("smtp");
    const conexion = { proveedor: "smtp", credencialesVisibles: { usuario: "notificaciones@russell.co" } };
    expect(credencialesIniciales(smtp, conexion)).toEqual({ usuario: "notificaciones@russell.co" });
    expect(credencialesIniciales(proveedorPorClave("gmail"), { proveedor: "gmail", credencialesVisibles: { usuario: "cuenta@gmail.com" } })).toEqual({
      usuario: "cuenta@gmail.com",
    });
    // Cambiar de proveedor no arrastra el usuario del anterior, y crear no precarga nada.
    expect(credencialesIniciales(proveedorPorClave("gmail"), conexion)).toEqual({});
    expect(credencialesIniciales(smtp, undefined)).toEqual({});
    // Una clave secreta que llegara por error en el objeto no se precarga.
    expect(credencialesIniciales(smtp, { proveedor: "smtp", credencialesVisibles: { usuario: "u", contrasena: "no" } })).toEqual({ usuario: "u" });
  });
});

describe("normalización de credenciales al guardar", () => {
  const campo = (proveedor: string, clave: string) => {
    const c = proveedorPorClave(proveedor)!.camposCredenciales.find((x) => x.clave === clave);
    if (!c) throw new Error(`${proveedor}.${clave}`);
    return c;
  };

  it("Gmail: la contraseña de aplicación pierde todos sus espacios (como la muestra Google)", () => {
    expect(normalizarCredencial(campo("gmail", "contrasena"), "abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(normalizarCredencial(campo("gmail", "contrasena"), " abcd efgh  ijkl\tmnop ")).toBe("abcdefghijklmnop");
  });

  it("el usuario de SMTP y Gmail pierde solo los espacios de los extremos", () => {
    for (const proveedor of ["smtp", "gmail"]) {
      expect(normalizarCredencial(campo(proveedor, "usuario"), "  cuenta@gmail.com ")).toBe("cuenta@gmail.com");
    }
  });

  it("SMTP genérico: la contraseña NO se toca, puede tener espacios legítimos", () => {
    expect(normalizarCredencial(campo("smtp", "contrasena"), " clave con  espacios ")).toBe(" clave con  espacios ");
  });

  it("las demás credenciales (claves de API, tokens) se guardan exactamente como llegan", () => {
    for (const proveedor of PROVEEDORES) {
      for (const c of proveedor.camposCredenciales) {
        if (c.normalizar) continue;
        expect(normalizarCredencial(c, " valor con espacios "), `${proveedor.clave}.${c.clave}`).toBe(" valor con espacios ");
      }
    }
    // Y la lista de las que sí se limpian es exactamente esta.
    const limpian = PROVEEDORES.flatMap((p) => p.camposCredenciales.filter((c) => c.normalizar).map((c) => `${p.clave}.${c.clave}:${c.normalizar}`));
    expect(limpian).toEqual(["smtp.usuario:recortar", "gmail.usuario:recortar", "gmail.contrasena:sin_espacios"]);
  });
});
