import { z } from "zod";
import type { ProveedorDefinicion } from "./tipos";

/** Validación compartida; solo campos del catálogo llegan a persistencia. */
export function validarConfiguracion(
  proveedor: ProveedorDefinicion,
  datos: Record<string, unknown>,
): Record<string, string[]> {
  const errores: Record<string, string[]> = {};
  for (const campo of proveedor.camposConfiguracion) {
    const valor = datos[campo.clave];
    if (typeof valor === "string" && valor.length > 2048) {
      errores[`config_${campo.clave}`] = ["El valor es demasiado largo."];
    }
    if (["url", "url_base", "url_token", "endpoint"].includes(campo.clave) && valor) {
      try {
        const url = new URL(String(valor));
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
        if ([...url.searchParams.keys()].some((key) => /token|secret|password|api.?key/i.test(key))) throw new Error();
      } catch {
        errores[`config_${campo.clave}`] = ["Usa una URL HTTP(S) válida, sin credenciales; guarda los secretos en su campo."];
      }
    }
  }
  if (proveedor.inteligenciaArtificial) {
    for (const campo of proveedor.camposConfiguracion.filter((c) => ["url_base", "ruta_prueba", "encabezado_auth"].includes(c.clave))) {
      if (String(datos[campo.clave] ?? "").replace(/\/$/, "") !== String(campo.porDefecto ?? "").replace(/\/$/, "")) {
        errores[`config_${campo.clave}`] = ["Este proveedor usa su dirección oficial. Para otro destino crea una conexión API REST."];
      }
    }
  }
  if (proveedor.prueba.tipo === "smtp") {
    if (!Number.isInteger(datos.puerto) || Number(datos.puerto) < 1 || Number(datos.puerto) > 65535) {
      errores.config_puerto = ["Ingresa un puerto entero entre 1 y 65535."];
    }
    if (!["TLS", "STARTTLS"].includes(String(datos.seguridad))) {
      errores.config_seguridad = ["Selecciona TLS o STARTTLS."];
    }
    if ((datos.remitente || datos.usar_para_notificaciones) && !z.email().safeParse(datos.remitente).success) {
      errores.config_remitente = ["Ingresa un correo válido para el remitente."];
    }
    if (datos.url_plataforma || datos.usar_para_notificaciones) {
      try {
        const url = new URL(String(datos.url_plataforma ?? ""));
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw new Error();
      } catch {
        errores.config_url_plataforma = ["Ingresa la dirección HTTPS de Russell, sin rutas, parámetros ni credenciales."];
      }
    }
    if (!/^[a-zA-Z0-9.-]+$/.test(String(datos.host ?? ""))) {
      errores.config_host = ["Ingresa únicamente el nombre del servidor, sin URL ni puerto."];
    }
  }
  return errores;
}
