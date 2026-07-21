export const NOMBRE_NIVEL_POR_DIGITOS: Readonly<Record<number, string>> = {
  1: "Clase",
  2: "Grupo",
  4: "Cuenta",
  6: "Subcuenta",
  8: "Auxiliar",
};

/**
 * Nombre del nivel contable según la cantidad de dígitos del código PUC.
 * Los separadores o sufijos informativos no alteran el nivel.
 */
export function nombreNivelCuenta(codigo: string): string {
  const cantidadDigitos = codigo.replace(/\D/g, "").length;
  return NOMBRE_NIVEL_POR_DIGITOS[cantidadDigitos] ?? `Nivel ${cantidadDigitos}`;
}
