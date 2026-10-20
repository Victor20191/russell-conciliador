import { describe, expect, it } from "vitest";
import { proveedorPorClave } from "./tipos";
import { validarConfiguracion } from "./validacion";

describe("parametrización de conexiones", () => {
  it("rechaza puerto fraccionario, remitente inválido y SMTP sin TLS", () => {
    const errores = validarConfiguracion(proveedorPorClave("smtp")!, { host: "https://smtp.example.com", puerto: 587.5, seguridad: "no", remitente: "mal" });
    expect(Object.keys(errores)).toEqual(expect.arrayContaining(["config_host", "config_puerto", "config_seguridad", "config_remitente"]));
  });
  it("valida SMTP con los datos requeridos", () => {
    expect(validarConfiguracion(proveedorPorClave("smtp")!, { host: "smtp.example.com", puerto: 587, seguridad: "STARTTLS", remitente: "mail@example.com" })).toEqual({});
  });
  it("impide cambiar el destino oficial de una clave IA", () => {
    const errores = validarConfiguracion(proveedorPorClave("anthropic")!, { url_base: "https://otro.example", ruta_prueba: "/v1/models", encabezado_auth: "x-api-key" });
    expect(errores.config_url_base).toBeDefined();
  });
  it("rechaza secretos embebidos en URLs no cifradas", () => {
    for (const url of ["https://usuario:clave@example.com", "https://example.com?api_key=secreto", "file:///etc/passwd"]) {
      expect(validarConfiguracion(proveedorPorClave("api_rest")!, { url_base: url }).config_url_base).toBeDefined();
    }
  });
  it("valida la URL del token OAuth por su nombre real", () => {
    expect(validarConfiguracion(proveedorPorClave("oauth2_client_credentials")!, { url_token: "file:///etc/passwd" }).config_url_token).toBeDefined();
  });
});
