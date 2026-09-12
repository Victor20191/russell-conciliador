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

// Pesos del dígito de verificación del NIT colombiano (DIAN), aplicados de DERECHA a
// izquierda sobre el número base. Módulo 11 con la tabla oficial.
const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

/**
 * Dígito de verificación DIAN de un número base (solo dígitos, sin DV). `null` si el
 * base no es utilizable (vacío o más largo que la tabla de pesos).
 */
export function dvNit(base: string): number | null {
  const digitos = claveNit(base);
  if (digitos.length === 0 || digitos.length > PESOS_DV.length) return null;
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    // El último dígito del base lleva el primer peso (3), por eso se recorre al revés.
    suma += Number(digitos[digitos.length - 1 - i]) * PESOS_DV[i];
  }
  const resto = suma % 11;
  return resto > 1 ? 11 - resto : resto;
}

/** ¿`dv` es el dígito de verificación que le corresponde a `base`? */
export function dvValido(base: string, dv: string | number): boolean {
  const esperado = dvNit(base);
  const recibido = typeof dv === "number" ? dv : Number(claveNit(dv));
  return esperado != null && Number.isInteger(recibido) && esperado === recibido;
}

/**
 * Clave CANÓNICA de un tercero para cruzar dos fuentes (balance por tercero ↔ auxiliar de
 * un módulo). Conserva el documento COMPLETO y solo retira el dígito de verificación
 * cuando es demostrablemente un DV: 10 dígitos cuyo último dígito es el DV válido de los
 * 9 primeros.
 *
 * Por qué NO se trunca siempre a 9 (que es lo que hace `nucleoNit`): las cédulas
 * colombianas de 10 dígitos son numerosas —en un archivo real de SAP hay 1.917— y
 * truncarlas colisiona a personas distintas que solo difieren en el último dígito
 * (1128385972 y 1128385973 caerían en el mismo renglón de la conciliación). El núcleo de
 * 9 sigue existiendo como SEGUNDA pasada, marcada, para no perder los cruces del histórico.
 *
 * Los identificadores no colombianos (RUC de 13, EIN de 9 con guion, pasaportes) se
 * conservan íntegros: no tienen DV DIAN que retirar.
 */
export function claveTerceroCanonica(documento: string | null | undefined): string | null {
  const digitos = claveNit(documento ?? "");
  if (digitos.length < 5) return null;
  if (digitos.length === 10 && dvValido(digitos.slice(0, 9), digitos[9])) {
    return digitos.slice(0, 9);
  }
  return digitos;
}
