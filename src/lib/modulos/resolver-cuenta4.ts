// Resolución de lo que el usuario escribe en el campo de cuenta del CRUCE CONTABLE.
// Lógica PURA (sin BD): la pantalla le pasa los subgrupos del módulo y la homologación
// del cliente, y aquí se decide a qué cuenta de 4 dígitos corresponde.
//
// El usuario puede escribir DOS cosas y no siempre sabe cuál tiene a mano:
//  - la cuenta Russell de 4 dígitos (1435), o
//  - su propia cuenta del PUC (143505), que ya está homologada desde el balance.
//
// Se guarda SIEMPRE la de 4 dígitos: la del cliente es una forma de llegar, no un dato
// que se persista. Por eso un solo campo y no dos — la relación es asimétrica, cliente →
// Russell es 1:1 y Russell → cliente es 1:N.
//
// El punto crítico es lo que NO se debe hacer: truncar. La normalización previa
// (`v.replace(/\D/g, "").slice(0, 4)`) convertía `143504` en `1435` sin avisar, y eso solo
// acierta cuando la homologación coincide con los 4 primeros dígitos. Sobre los datos
// reales de la plataforma, en 14xx eso falla en el 25,9% de las cuentas homologadas:
// `143504 DEV,REBAJAS Y DESC.COMPRAS` está homologada a `4175` (ingresos), no a `1435`
// (activo). Truncar cuadraba el cruce contra otra clase contable en silencio.

/** Destino homologado de una cuenta del cliente: su cuenta Russell de 4 dígitos. */
export type DestinoCuentaCliente = { cuenta4: string; nombre: string };

export type EntornoResolucion = {
  /** Cuentas de 4 dígitos válidas para ESTE módulo (p. ej. 1405, 1435… en Inventarios). */
  subgruposModulo: ReadonlySet<string>;
  /**
   * Homologación del cliente SIN filtrar por módulo: código exacto de la cuenta del
   * cliente → su cuenta Russell. Sin filtrar a propósito, para poder decir «está
   * homologada a 4175, que no pertenece a Inventarios» en vez de un «no encontrada»
   * que haría pensar que falta parametrizar.
   */
  homologacionCliente: ReadonlyMap<string, DestinoCuentaCliente>;
};

export type ResolucionCuenta4 =
  | { ok: true; cuenta4: string; via: "russell" }
  | { ok: true; cuenta4: string; via: "cliente"; cuentaCliente: string; nombreCliente: string }
  | { ok: false; motivo: "vacia" }
  | { ok: false; motivo: "no-encontrada"; entrada: string }
  | { ok: false; motivo: "fuera-del-modulo"; entrada: string; cuenta4Real: string; nombreCliente: string };

/** Deja solo dígitos; el resto (puntos, guiones, espacios) es ruido de copiar y pegar. */
const soloDigitos = (v: string): string => String(v ?? "").replace(/\D/g, "");

/**
 * Resuelve la entrada del usuario a una cuenta de 4 dígitos del módulo.
 *
 *  1. Cuatro dígitos que son subgrupo del módulo → es la cuenta Russell, tal cual.
 *  2. Cualquier otra cosa → se busca como cuenta del cliente por código EXACTO.
 *     Si su homologación cae fuera del módulo, se rechaza nombrando el destino real.
 *  3. Si no aparece, se rechaza. Nunca se trunca ni se adivina.
 */
export function resolverCuenta4(entrada: string, entorno: EntornoResolucion): ResolucionCuenta4 {
  const codigo = soloDigitos(entrada);
  if (!codigo) return { ok: false, motivo: "vacia" };

  if (codigo.length === 4 && entorno.subgruposModulo.has(codigo)) {
    return { ok: true, cuenta4: codigo, via: "russell" };
  }

  // Una cuenta del cliente de 4 dígitos que NO es subgrupo del módulo cae aquí también:
  // hay clientes que imputan movimiento directo a nivel 4 y su homologación manda.
  const destino = entorno.homologacionCliente.get(codigo);
  if (!destino) return { ok: false, motivo: "no-encontrada", entrada: codigo };

  if (!entorno.subgruposModulo.has(destino.cuenta4)) {
    return { ok: false, motivo: "fuera-del-modulo", entrada: codigo, cuenta4Real: destino.cuenta4, nombreCliente: destino.nombre };
  }
  return { ok: true, cuenta4: destino.cuenta4, via: "cliente", cuentaCliente: codigo, nombreCliente: destino.nombre };
}

/** Mensaje de error listo para el toast, según por qué no se pudo resolver. */
export function mensajeResolucion(r: Extract<ResolucionCuenta4, { ok: false }>, moduloLabel: string): string {
  if (r.motivo === "vacia") return "Escribe una cuenta de 4 dígitos o una cuenta del cliente.";
  if (r.motivo === "no-encontrada") {
    return `${r.entrada} no es una cuenta de ${moduloLabel} ni una cuenta homologada de este cliente. Revísala o búscala con «Buscar…».`;
  }
  return `${r.entrada}${r.nombreCliente ? ` (${r.nombreCliente})` : ""} está homologada a ${r.cuenta4Real}, que no pertenece a ${moduloLabel}.`;
}
