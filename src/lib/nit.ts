export function claveNit(nit: string): string {
  return nit.replace(/\D/g, "");
}

export function tieneDigitosNit(nit: string): boolean {
  return claveNit(nit).length > 0;
}

/** Núcleo comparable del NIT: solo dígitos y SIN dígito de verificación (9 primeros). */
export function nucleoNit(nit: string): string {
  return claveNit(nit).slice(0, 9);
}

/**
 * ¿Dos NIT identifican a la misma empresa? Compara el núcleo (el DV puede venir
 * o no) y exige al menos 5 dígitos para no igualar cadenas cortas o basura. Es
 * la misma regla con la que se resuelve el cliente por NIT al leer un balance.
 */
export function nitCoincide(a: string | null | undefined, b: string | null | undefined): boolean {
  const nucleoA = nucleoNit(a ?? "");
  return nucleoA.length >= 5 && nucleoA === nucleoNit(b ?? "");
}
