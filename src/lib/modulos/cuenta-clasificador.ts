/**
 * LA CUENTA DEL CLIENTE QUE VIENE DENTRO DEL CLASIFICADOR (puro, sin BD).
 *
 * Los archivos de Activos fijos traen la cuenta pegada al grupo del activo y cada ERP la escribe
 * a su manera: «AF152805», «1524010500098», «01-1528-05». De ahí hay que sacar la cuenta del
 * CLIENTE —no la Russell— y después homologarla como se homologó el balance, porque el PUC del
 * cliente no tiene por qué coincidir con el Russell en los primeros dígitos: un cliente que lleva
 * sus propiedades de inversión en 1517 cruzaría contra la cuenta equivocada si se truncara.
 *
 * Cuántos caracteres sobran al inicio lo declara el administrador en el patrón del aplicativo
 * (`SpecModulo.prefijoClasificador`), porque es una marca del formato, no del cargue. Lo que no se
 * puede leer NO se inventa: queda sin cuenta, se ve en el Consolidado y el auditor la asigna.
 */
import { resolverCuenta4, type EntornoResolucion } from "./resolver-cuenta4";

/** Separadores con que los ERP parten la cuenta dentro del código del grupo. */
const SEPARADORES = /[\s.\-/_]/g;

/**
 * La cuenta del CLIENTE que queda tras quitar los caracteres sobrantes del inicio.
 *
 * `prefijo` es cuántos caracteres se descartan («AF152805» con 2 → «152805»). Después se toma la
 * corrida de dígitos del principio, uniendo lo que los separadores partan («1528-05» → «152805»),
 * y se exige un mínimo de 4: con menos no hay ni subgrupo que mirar.
 */
export function cuentaDelClasificador(valor: string | null | undefined, prefijo?: number | null): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const sobrantes = Number.isInteger(prefijo) && (prefijo as number) > 0 ? (prefijo as number) : 0;
  // Un prefijo que se comiera todo el texto no es el de este valor: no se recorta a medias.
  if (sobrantes >= texto.length) return null;
  const resto = texto.slice(sobrantes).replace(SEPARADORES, "");
  const digitos = /^\d+/.exec(resto)?.[0] ?? "";
  return digitos.length >= 4 ? digitos : null;
}

export type PropuestaCuentaClasificador =
  /** La cuenta del cliente está homologada (como el balance) a una cuenta del módulo. */
  | { ok: true; cuenta: string; cuentaCliente: string; nombreCliente: string; via: "homologacion" }
  /** Sin homologación, pero su subgrupo de 4 ES una cuenta del módulo: se deduce por estructura. */
  | { ok: true; cuenta: string; cuentaCliente: string; nombreCliente: null; via: "estructura" }
  | { ok: false; motivo: "sin-cuenta" }
  | { ok: false; motivo: "sin-homologar"; cuentaCliente: string }
  /** Homologada, pero a una cuenta que no es de este módulo: se nombra el destino real. */
  | { ok: false; motivo: "fuera-del-modulo"; cuentaCliente: string; cuentaReal: string; nombreCliente: string };

/**
 * Propone la cuenta Russell de un clasificador que trae la cuenta del cliente.
 *
 * Tres vías, en orden, y ninguna adivina:
 *  1. el código exacto, homologado en el balance (`cuentas_cliente`);
 *  2. su grupo de 6 dígitos, por la misma memoria —así una auxiliar larga hereda la regla—;
 *  3. su subgrupo de 4, SOLO si es una cuenta del módulo: la derivación por estructura PUC.
 *
 * Una cuenta homologada FUERA del módulo no cae a la estructura: se informa. Si cayera, un
 * 143504 homologado a 4175 entraría al cruce como 1435 en silencio, que es justo lo que se evita.
 */
export function proponerCuentaDeClasificador(
  clasificador: string | null | undefined,
  entorno: EntornoResolucion,
  opciones?: { prefijo?: number | null },
): PropuestaCuentaClasificador {
  const cuentaCliente = cuentaDelClasificador(clasificador, opciones?.prefijo);
  if (!cuentaCliente) return { ok: false, motivo: "sin-cuenta" };

  // El código exacto y, si es más larga, su grupo de seis: las dos granularidades de la memoria.
  const candidatos = cuentaCliente.length > 6 ? [cuentaCliente, cuentaCliente.slice(0, 6)] : [cuentaCliente];
  let fuera: Extract<PropuestaCuentaClasificador, { motivo: "fuera-del-modulo" }> | null = null;
  for (const codigo of candidatos) {
    const r = resolverCuenta4(codigo, entorno);
    if (r.ok && r.via === "cliente") {
      return { ok: true, cuenta: r.cuenta4, cuentaCliente, nombreCliente: r.nombreCliente, via: "homologacion" };
    }
    // Que el código del cliente sea IGUAL a una cuenta Russell del módulo no prueba homologación,
    // pero es la misma cuenta: vale como estructura.
    if (r.ok) return { ok: true, cuenta: r.cuenta4, cuentaCliente, nombreCliente: null, via: "estructura" };
    if (!r.ok && r.motivo === "fuera-del-modulo" && !fuera) {
      fuera = { ok: false, motivo: "fuera-del-modulo", cuentaCliente, cuentaReal: r.cuenta4Real, nombreCliente: r.nombreCliente };
    }
  }
  if (fuera) return fuera;

  const subgrupo = cuentaCliente.slice(0, 4);
  if (entorno.subgruposModulo.has(subgrupo)) {
    return { ok: true, cuenta: subgrupo, cuentaCliente, nombreCliente: null, via: "estructura" };
  }
  return { ok: false, motivo: "sin-homologar", cuentaCliente };
}

/** Por qué no se pudo proponer, listo para el pie del renglón del Consolidado. */
export function motivoPropuestaClasificador(
  p: Extract<PropuestaCuentaClasificador, { ok: false }>,
  moduloLabel: string,
): string {
  if (p.motivo === "sin-cuenta") return "El código del archivo no trae una cuenta contable que leer.";
  if (p.motivo === "sin-homologar") {
    return `${p.cuentaCliente} no está homologada en el balance de este cliente ni su subgrupo es una cuenta de ${moduloLabel}.`;
  }
  return `${p.cuentaCliente}${p.nombreCliente ? ` (${p.nombreCliente})` : ""} está homologada a ${p.cuentaReal}, que no pertenece a ${moduloLabel}.`;
}

/**
 * La cuenta del cliente de cada clasificador, leída de las filas del cargue (`datos._cuentaCliente`,
 * que escribió la lectura del archivo). Un grupo puede traer varias —un activo reclasificado, una
 * fila mal digitada—: manda la MÁS FRECUENTE, y a igualdad, la primera que apareció, para que el
 * renglón no cambie de cuenta entre dos lecturas del mismo archivo.
 */
export function cuentasClientePorClasificador(
  filas: readonly { clasificador: string | null; datos?: Record<string, unknown> | null }[],
): Map<string, string> {
  const conteo = new Map<string, Map<string, number>>();
  for (const f of filas) {
    const clasificador = f.clasificador?.trim();
    const cuenta = f.datos?._cuentaCliente;
    if (!clasificador || typeof cuenta !== "string" || !cuenta) continue;
    const porCuenta = conteo.get(clasificador) ?? new Map<string, number>();
    porCuenta.set(cuenta, (porCuenta.get(cuenta) ?? 0) + 1);
    conteo.set(clasificador, porCuenta);
  }
  const salida = new Map<string, string>();
  for (const [clasificador, porCuenta] of conteo) {
    let mejor: string | null = null;
    let mejorConteo = 0;
    // El Map conserva el orden de aparición, así que un empate se queda con la primera.
    for (const [cuenta, veces] of porCuenta) {
      if (veces > mejorConteo) { mejor = cuenta; mejorConteo = veces; }
    }
    if (mejor) salida.set(clasificador, mejor);
  }
  return salida;
}
