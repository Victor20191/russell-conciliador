import "server-only";
import prisma from "@/lib/prisma";
import { descifrarCredenciales } from "@/lib/conexiones/credenciales";

export type ProveedorConexionIA = "anthropic" | "gemini" | "openrouter";

const PROVEEDORES = {
  anthropic: {
    nombre: "Anthropic",
    origen: "https://api.anthropic.com",
    rutasBase: ["/", "/v1"],
    variables: ["ANTHROPIC_API_KEY"],
  },
  gemini: {
    nombre: "Gemini",
    origen: "https://generativelanguage.googleapis.com",
    rutasBase: ["/", "/v1beta", "/v1"],
    variables: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  },
  openrouter: {
    nombre: "OpenRouter",
    origen: "https://openrouter.ai",
    rutasBase: ["/", "/api/v1"],
    variables: ["OPENROUTER_API_KEY"],
  },
} as const;

/** Solo contiene mensajes propios; nunca incluye credenciales ni errores de BD. */
export class ErrorConfiguracionIA extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorConfiguracionIA";
  }
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};
}

function baseOficial(proveedor: ProveedorConexionIA, valor: unknown): boolean {
  // Una base omitida usa la oficial. Los clientes nunca consumen esta URL:
  // solo evita usar por accidente credenciales destinadas a otro servidor.
  if (valor == null || valor === "") return true;
  if (typeof valor !== "string") return false;
  try {
    const url = new URL(valor.trim());
    const config = PROVEEDORES[proveedor];
    const ruta = url.pathname.replace(/\/+$/, "") || "/";
    return url.origin === config.origen && !url.username && !url.password
      && !url.search && !url.hash && (config.rutasBase as readonly string[]).includes(ruta);
  } catch {
    return false;
  }
}

/**
 * Resuelve la clave en cada uso, sin caché persistente ni selección implícita.
 * Solo una conexión marcada, activa y de producción puede sustituir al .env.
 * Una selección inválida o una BD no disponible bloquean el uso: nunca
 * cambian silenciosamente a otra cuenta del proveedor.
 */
export async function resolverClaveIA(proveedor: ProveedorConexionIA): Promise<string | null> {
  const config = PROVEEDORES[proveedor];
  if (process.env.DATABASE_URL) {
    let conexiones;
    try {
      conexiones = await prisma.conexionIntegracion.findMany({
        where: {
          categoria: "API",
          proveedor,
          entorno: "PRODUCCION",
          activa: true,
          configuracion: { path: ["usar_en_plataforma"], equals: true },
        },
        select: { configuracion: true, credenciales: true },
        take: 2,
      });
    } catch {
      throw new ErrorConfiguracionIA(
        `No se pudo consultar la conexión de ${config.nombre}. Revisa Conexiones e integraciones.`,
      );
    }
    if (conexiones.length > 1) {
      throw new ErrorConfiguracionIA(
        `Hay varias conexiones de ${config.nombre} seleccionadas para la plataforma. Selecciona solo una en Conexiones e integraciones.`,
      );
    }
    if (conexiones.length === 1) {
      const conexion = conexiones[0];
      if (!baseOficial(proveedor, objeto(conexion.configuracion).url_base)) {
        throw new ErrorConfiguracionIA(
          `La conexión de ${config.nombre} seleccionada debe usar la URL oficial del proveedor.`,
        );
      }
      // Descifra exclusivamente el campo que requiere este consumidor.
      const apiKey = descifrarCredenciales({
        api_key: objeto(conexion.credenciales).api_key,
      }).api_key?.trim();
      if (!apiKey) {
        throw new ErrorConfiguracionIA(
          `La conexión de ${config.nombre} seleccionada no tiene una API Key válida. Revisa sus credenciales.`,
        );
      }
      return apiKey;
    }
  }
  for (const variable of config.variables) {
    const apiKey = process.env[variable]?.trim();
    if (apiKey) return apiKey;
  }
  return null;
}

/** La consulta de disponibilidad conserva los flujos deterministas sin IA. */
export async function conexionIADisponible(proveedor: ProveedorConexionIA): Promise<boolean> {
  try {
    return Boolean(await resolverClaveIA(proveedor));
  } catch {
    return false;
  }
}
