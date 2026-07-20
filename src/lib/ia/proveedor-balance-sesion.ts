// Resolución CON SESIÓN del proveedor de IA de balances. Vive aparte de
// `proveedor-balance.ts` para que el pipeline puro (extracción/mapeo) no
// arrastre la capa de sesión/BD: las fronteras (Server Actions y páginas RSC)
// resuelven aquí el proveedor y lo pasan al pipeline ya autorizado.
import "server-only";
import { getCurrentUser } from "@/lib/dal";
import {
  configuracionIABalanceUI,
  correoAutorizadoIAPruebas,
  modoDesarrolloIABalanceActivo,
  proveedorIABalance,
  type ConfiguracionIABalanceUI,
  type ProveedorIABalance,
} from "@/lib/ia/proveedor-balance";

/**
 * ¿La sesión actual puede usar la herramienta de pruebas (Gemini)? Dos vías:
 * desarrollo local con la bandera privada, o —en cualquier entorno, incluida
 * producción— un usuario cuyo correo pertenezca al dominio corporativo.
 * Fail-closed: sin sesión o sin correo, queda Anthropic.
 */
export async function sesionAutorizadaIAPruebas(): Promise<boolean> {
  if (modoDesarrolloIABalanceActivo()) return true;
  const usuario = await getCurrentUser();
  return correoAutorizadoIAPruebas(usuario?.email);
}

/**
 * ÚNICA puerta para valores no confiables (formulario/payload): resuelve el
 * proveedor combinando la selección con la autorización de la sesión.
 */
export async function proveedorIABalanceSesion(solicitado?: unknown): Promise<ProveedorIABalance> {
  return proveedorIABalance(solicitado, { autorizado: await sesionAutorizadaIAPruebas() });
}

/** Selector del modal de carga: visible en dev autorizado o para el dominio. */
export async function configuracionIABalanceUISesion(): Promise<ConfiguracionIABalanceUI | null> {
  return configuracionIABalanceUI({ autorizado: await sesionAutorizadaIAPruebas() });
}
