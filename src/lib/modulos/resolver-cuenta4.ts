// Resolución de lo que el usuario escribe en el campo de cuenta del CRUCE CONTABLE.
// Lógica PURA (sin BD): la pantalla le pasa las cuentas del módulo y la homologación
// del cliente, y aquí se decide a qué cuenta Russell corresponde.
//
// El usuario puede escribir DOS cosas y no siempre sabe cuál tiene a mano:
//  - la cuenta Russell del nivel del cruce (1435; en Nómina 510506), o
//  - su propia cuenta del PUC (143505), que ya está homologada desde el balance.
//
// Se guarda SIEMPRE la Russell: la del cliente es una forma de llegar, no un dato
// que se persista. Por eso un solo campo y no dos — la relación es asimétrica, cliente →
// Russell es 1:1 y Russell → cliente es 1:N.
//
// El punto crítico es lo que NO se debe hacer: truncar. La normalización previa
// (`v.replace(/\D/g, "").slice(0, 4)`) convertía `143504` en `1435` sin avisar, y eso solo
// acierta cuando la homologación coincide con los 4 primeros dígitos. Sobre los datos
// reales de la plataforma, en 14xx eso falla en el 25,9% de las cuentas homologadas:
// `143504 DEV,REBAJAS Y DESC.COMPRAS` está homologada a `4175` (ingresos), no a `1435`
// (activo). Truncar cuadraba el cruce contra otra clase contable en silencio.
//
// NIVEL: los módulos cruzan a 4 dígitos salvo Nómina, que lo hace a 6 (`nivelCruce` del
// descriptor). El campo `cuenta4` de los resultados conserva su nombre por los consumidores
// (cédula, marcas, consolidado) pero lleva la clave del nivel: «1435» o «510506».
import type { NivelCruce } from "./cuentas-modulo";

/** Destino homologado de una cuenta del cliente: su cuenta Russell de 4 dígitos y, si la tiene, la de 6. */
export type DestinoCuentaCliente = { cuenta4: string; cuenta6?: string | null; nombre: string };

export type EntornoResolucion = {
  /**
   * Cuentas Russell válidas para ESTE módulo al nivel del cruce (p. ej. 1405, 1435… en
   * Inventarios; 510506, 720505… en Nómina).
   */
  subgruposModulo: ReadonlySet<string>;
  /**
   * Homologación del cliente SIN filtrar por módulo: código exacto de la cuenta del
   * cliente → su cuenta Russell. Sin filtrar a propósito, para poder decir «está
   * homologada a 4175, que no pertenece a Inventarios» en vez de un «no encontrada»
   * que haría pensar que falta parametrizar.
   */
  homologacionCliente: ReadonlyMap<string, DestinoCuentaCliente>;
  /** Nivel de la clave del cruce. Ausente = 4. */
  nivel?: NivelCruce;
};

export type ResolucionCuenta4 =
  | { ok: true; cuenta4: string; via: "russell" }
  | { ok: true; cuenta4: string; via: "cliente"; cuentaCliente: string; nombreCliente: string }
  | { ok: false; motivo: "vacia" }
  | { ok: false; motivo: "no-encontrada"; entrada: string }
  | { ok: false; motivo: "fuera-del-modulo"; entrada: string; cuenta4Real: string; nombreCliente: string }
  /** El cliente está homologado solo al subgrupo y el módulo cruza a 6: no hay cuenta completa que usar. */
  | { ok: false; motivo: "sin-nivel"; entrada: string; cuenta4Real: string; nombreCliente: string };

/** Deja solo dígitos; el resto (puntos, guiones, espacios) es ruido de copiar y pegar. */
const soloDigitos = (v: string): string => String(v ?? "").replace(/\D/g, "");

/**
 * Clave del destino homologado al nivel pedido, o `null` si la homologación no llega a él. Una
 * cédula a 4 puede tener claves de 6 (Ingresos 422005): si la cuenta completa es una de ellas, manda.
 */
function claveDestino(destino: DestinoCuentaCliente, nivel: NivelCruce, claves: ReadonlySet<string>): string | null {
  const seis = soloDigitos(destino.cuenta6 ?? "");
  const cuenta6 = seis.length >= 6 ? seis.slice(0, 6) : null;
  if (nivel === 4) return cuenta6 && claves.has(cuenta6) ? cuenta6 : destino.cuenta4;
  return cuenta6;
}

/**
 * Resuelve la entrada del usuario a una cuenta Russell del nivel del módulo.
 *
 *  1. Los dígitos del nivel que son cuenta del módulo → es la cuenta Russell, tal cual.
 *  2. Cualquier otra cosa → se busca como cuenta del cliente por código EXACTO.
 *     Si su homologación cae fuera del módulo, se rechaza nombrando el destino real.
 *  3. Si no aparece, se rechaza. Nunca se trunca ni se adivina.
 */
export function resolverCuenta4(entrada: string, entorno: EntornoResolucion): ResolucionCuenta4 {
  const nivel: NivelCruce = entorno.nivel === 6 ? 6 : 4;
  const codigo = soloDigitos(entrada);
  if (!codigo) return { ok: false, motivo: "vacia" };

  // Las claves del módulo son del nivel del cruce y, en una cédula mixta, también de 6 dígitos.
  if ((codigo.length === nivel || codigo.length === 6) && entorno.subgruposModulo.has(codigo)) {
    return { ok: true, cuenta4: codigo, via: "russell" };
  }

  // Una cuenta del cliente de 4 dígitos que NO es subgrupo del módulo cae aquí también:
  // hay clientes que imputan movimiento directo a nivel 4 y su homologación manda.
  const destino = entorno.homologacionCliente.get(codigo);
  if (!destino) return { ok: false, motivo: "no-encontrada", entrada: codigo };

  const clave = claveDestino(destino, nivel, entorno.subgruposModulo);
  if (clave == null) {
    return { ok: false, motivo: "sin-nivel", entrada: codigo, cuenta4Real: destino.cuenta4, nombreCliente: destino.nombre };
  }
  if (!entorno.subgruposModulo.has(clave)) {
    return { ok: false, motivo: "fuera-del-modulo", entrada: codigo, cuenta4Real: clave, nombreCliente: destino.nombre };
  }
  return { ok: true, cuenta4: clave, via: "cliente", cuentaCliente: codigo, nombreCliente: destino.nombre };
}

/** Mismo resolvedor con el nivel explícito, para quien no arma el entorno. */
export function resolverCuentaRussell(entrada: string, entorno: Omit<EntornoResolucion, "nivel">, nivel: NivelCruce): ResolucionCuenta4 {
  return resolverCuenta4(entrada, { ...entorno, nivel });
}

/** Mensaje de error listo para el toast, según por qué no se pudo resolver. */
export function mensajeResolucion(r: Extract<ResolucionCuenta4, { ok: false }>, moduloLabel: string, nivel: NivelCruce = 4): string {
  if (r.motivo === "vacia") return `Escribe una cuenta Russell de ${nivel} dígitos o una cuenta del cliente.`;
  if (r.motivo === "no-encontrada") {
    return `${r.entrada} no es una cuenta de ${moduloLabel} ni una cuenta homologada de este cliente. Revísala o búscala con «Buscar…».`;
  }
  if (r.motivo === "sin-nivel") {
    return `${r.entrada}${r.nombreCliente ? ` (${r.nombreCliente})` : ""} está homologada solo al subgrupo ${r.cuenta4Real}; ${moduloLabel} cruza a 6 dígitos. Homológala a una cuenta de 6 en el balance o escribe la cuenta Russell.`;
  }
  return `${r.entrada}${r.nombreCliente ? ` (${r.nombreCliente})` : ""} está homologada a ${r.cuenta4Real}, que no pertenece a ${moduloLabel}.`;
}
