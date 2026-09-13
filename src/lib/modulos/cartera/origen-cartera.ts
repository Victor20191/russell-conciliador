// ORIGEN de una fila del auxiliar: nacional o exterior — puro, sin BD.
//
// En orden (D3 de Cartera): la cuenta que trae la fila, homologada a la cuenta Russell del
// exterior o de la nacional (Cartera 130510 / 130505; CxP 221005 / 220505); lo que declaró quien
// cargó el archivo; la moneda del importe; y, al final, la forma del identificador (EIN, RUC,
// «EXT…»), que es solo una sugerencia. Con «mixta» no hay declaración: decide cada fila.
import { esMonedaExtranjera } from "./moneda";
import type { OrigenCartera } from "./tercero-cartera";

export function resolverOrigenCartera(entrada: {
  /** Cuenta Russell de 6 dígitos de la cuenta que trae la fila, si la trae. */
  cuenta6: string | null;
  cuentasExterior?: readonly string[];
  cuentasNacional?: readonly string[];
  declarado: "nacional" | "exterior" | "mixta" | null | undefined;
  moneda: string | null | undefined;
  sugerido: OrigenCartera | null;
}): OrigenCartera | null {
  if (entrada.cuenta6) {
    if (entrada.cuentasExterior?.includes(entrada.cuenta6)) return "exterior";
    if (entrada.cuentasNacional?.includes(entrada.cuenta6)) return "nacional";
  }
  if (entrada.declarado === "nacional" || entrada.declarado === "exterior") return entrada.declarado;
  if (esMonedaExtranjera(entrada.moneda)) return "exterior";
  return entrada.sugerido;
}

/**
 * Cuenta Russell de 6 dígitos de la cuenta que trae el archivo: por la homologación del cliente,
 * con el código exacto o su prefijo más largo. Con `usarPropia`, una cuenta sin homologar que ya
 * es una cuenta PUC de seis dígitos o más se toma por sus seis primeros dígitos.
 */
export function ubicadorCuentaCliente(
  cuentas: readonly { code: string; cuenta6Russell: string | null }[],
  opciones?: { usarPropia?: boolean },
): (cuentaArchivo: unknown) => string | null {
  const porCodigo = new Map<string, string>();
  for (const c of cuentas) {
    const russell = (c.cuenta6Russell ?? "").replace(/\D/g, "").slice(0, 6);
    const codigo = c.code.replace(/\D/g, "");
    if (russell.length === 6 && codigo) porCodigo.set(codigo, russell);
  }
  return (cuentaArchivo) => {
    const codigo = String(cuentaArchivo ?? "").replace(/\D/g, "");
    for (let largo = codigo.length; largo >= 4; largo--) {
      const russell = porCodigo.get(codigo.slice(0, largo));
      if (russell) return russell;
    }
    return opciones?.usarPropia && codigo.length >= 6 ? codigo.slice(0, 6) : null;
  };
}
