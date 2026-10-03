// COMODÍN DE POSICIÓN para buscar códigos de cuenta (puro, sin BD ni UI).
//
// Buscar «25» en un código trae lo que EMPIEZA por 25; para preguntar por una posición concreta
// —«las que en los dígitos 3 y 4 lleven 25», o sea 1125xx, 2225xx…— no había forma. Un `*` (o un
// `?`) en el patrón vale UN carácter cualquiera en esa posición: «**25» encuentra 112505,
// 11250501 y 11250504, pero no 110510.
//
// El patrón se ancla al PRINCIPIO del código y lo que venga después queda libre, igual que la
// búsqueda por prefijo de siempre: «**25» es «dos cualesquiera, luego 25, y sigue lo que sea».
// Un patrón sin comodines se comporta exactamente como antes.

const COMODINES = /[*?]/;

/** Ayuda para el `title` de los campos donde se escriben códigos de cuenta. */
export const AYUDA_COMODIN = "Escribe un prefijo (1125) o usa * como comodín de posición: «**25» trae las cuentas con 25 en los dígitos 3 y 4 (112505, 11250501…).";

/** ¿El texto escrito usa comodines de posición? */
export function tieneComodin(entrada: string | null | undefined): boolean {
  return COMODINES.test(entrada ?? "");
}

function normalizar(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Escapa todo lo que RegExp trataría como sintaxis; los comodines ya se quitaron antes. */
function escapar(texto: string): string {
  return texto.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/**
 * ¿El código casa con el patrón? Anclado al principio, cada `*`/`?` vale un carácter y el resto
 * del código queda libre. Patrón vacío → true (sin filtro).
 */
export function coincideComodin(codigo: string | null | undefined, patron: string | null | undefined): boolean {
  const limpio = normalizar(patron);
  if (limpio === "") return true;
  const expresion = limpio
    .split(COMODINES)
    .map(escapar)
    .join(".");
  return new RegExp(`^${expresion}`).test(normalizar(codigo));
}

/**
 * Coincidencia de un filtro de TEXTO con comodines: con `*` manda la posición (anclado al
 * principio); sin `*`, la subcadena de siempre. Es lo que usan las tablas de módulos, donde la
 * misma casilla sirve para un código y para un nombre.
 */
export function coincideTextoConComodin(valor: string | null | undefined, filtro: string | null | undefined): boolean {
  const buscado = normalizar(filtro);
  if (buscado === "") return true;
  if (tieneComodin(buscado)) return coincideComodin(valor, buscado);
  return normalizar(valor).includes(buscado);
}
