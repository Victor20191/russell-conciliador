// Renglones del Consolidado que el usuario VE con cuenta pero que todavía no están grabados —
// puro, sin BD. El cruce contable solo usa lo grabado, así que antes de salir de la pestaña se
// le recuerda al usuario.
//
// Dos orígenes:
//  - `propuesta`: la cuenta la propuso el sistema al abrir (deducida del código del clasificador,
//    13050505 → 130505, o la sugerencia de Nómina). Nunca se graba sola: puede estar mal.
//  - `edicion`: el usuario la tocó («+ cuenta», quitar, «Buscar…», masiva, «Usar»); el
//    autoguardado la está grabando o falló al intentarlo.

export type OrigenSinGuardar = "propuesta" | "edicion";

export type RenglonSinGuardar = {
  clasificador: string;
  /** Las cuentas que se ven en pantalla (vacío = se quitaron todas). */
  cuentas: string[];
  origen: OrigenSinGuardar;
};

/** ¿Dos conjuntos de cuentas son el mismo, sin importar el orden ni los repetidos? */
export function mismasCuentas(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const clave = (lista: readonly string[] | undefined) => [...new Set(lista ?? [])].sort().join(",");
  return clave(a) === clave(b);
}

/**
 * Los renglones cuyas cuentas en pantalla difieren de las grabadas, en el orden del Consolidado.
 * `tocados` son los clasificadores que el usuario editó: lo que no tocó y difiere es propuesta.
 */
export function renglonesSinGuardar(input: {
  clasificadores: readonly string[];
  valores: Readonly<Record<string, readonly string[]>>;
  guardados: Readonly<Record<string, readonly string[]>>;
  tocados: ReadonlySet<string>;
}): RenglonSinGuardar[] {
  const salida: RenglonSinGuardar[] = [];
  for (const clasificador of input.clasificadores) {
    const cuentas = input.valores[clasificador] ?? [];
    if (mismasCuentas(cuentas, input.guardados[clasificador])) continue;
    salida.push({ clasificador, cuentas: [...cuentas], origen: input.tocados.has(clasificador) ? "edicion" : "propuesta" });
  }
  return salida;
}
