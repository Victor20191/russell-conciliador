// Versión de la METODOLOGÍA con la que se calcula el uso.
//
// Las instantáneas guardan sus cifras para no recalcularlas, pero una regla
// nueva las deja incomparables: cuando se excluyó al equipo de Xentria, el
// período anterior seguía contando sus acciones y el comparativo mostraba a
// esas personas «cayendo a cero», que es un artefacto del cambio y no un hecho.
//
// Por eso cada instantánea anota con qué metodología se hizo. Si no coincide
// con la vigente, `comparativo-servidor.ts` RECALCULA ese período en vivo en vez
// de usar sus cifras guardadas. Subir este número es la forma de decir «lo de
// antes ya no es comparable».
//
// 1 — cifras originales (incluían a los actores sin cuenta y al equipo de Xentria).
// 2 — solo cuentas existentes de la plataforma; sin `@xentria.co` (20/Sep/2026).
export const METODOLOGIA_USO_VIGENTE = 2;

/** ¿La instantánea se calculó con la metodología vigente? Sin marca, no. */
export function metodologiaAlDia(metadatos: unknown): boolean {
  if (!metadatos || typeof metadatos !== "object") return false;
  return (metadatos as { metodologia?: unknown }).metodologia === METODOLOGIA_USO_VIGENTE;
}
