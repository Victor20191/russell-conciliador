/** Escapa una celda para Excel/CSV sin permitir fórmulas de texto no confiable. */
export function celdaCsv(valor: unknown): string {
  let texto = valor == null ? "" : String(valor);
  // Los números reales conservan su tipo, incluidos los negativos. Un nombre
  // de archivo o cualquier otro texto nunca debe convertirse en fórmula.
  if (typeof valor === "string" && (/^[\s\uFEFF]*[=+\-@]/u.test(texto) || /^[\t\r\n]/.test(texto))) {
    texto = `'${texto}`;
  }
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}
