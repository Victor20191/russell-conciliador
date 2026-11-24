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
// 3 — el comparativo se hace sin cuentas de prueba ni genéricas y la instantánea
//     guarda esas cifras en `fuente.usoComparable`. Las de la metodología 2 traían
//     esas cuentas dentro (una sola llegó a ser el 89 % de un período previo): su
//     ventana se conserva pero el comparativo las recalcula en vivo. El reporte ya
//     generado no cambia; solo cambia contra qué cifras se compara el siguiente.
// 4 — se cuentan OPERACIONES, no registros: las acciones que se registran una vez
//     por fila (homologar cuenta por cuenta, validar alertas, marcas, cada cambio
//     del Consolidado) valen una por persona, acción, cliente y día; las cuentas
//     de prueba y genéricas salen de TODO el uso (no solo del comparativo), y los
//     seis módulos se miden juntos como «Módulos de conciliación» (23/Nov/2026).
// 5 — el comparativo se mide SIEMPRE contra el período anterior de igual
//     duración (cortado en el mismo punto si el actual sigue abierto), ya no
//     contra el último reporte generado. Las cifras guardadas en
//     `fuente.usoComparable` quedan como constancia y no se leen para comparar
//     (23/Nov/2026).
// 6 — las visitas a módulos del reporte y del tablero se cuentan solo de las
//     cuentas del uso (sin Xentria ni cuentas de prueba), como ya hacía el
//     comparativo; del 9 al 15-nov/2026 bajan de 490 a 302 (23/Nov/2026).
// 7 — definición de OPERACIÓN acordada con el usuario (24/Nov/2026, ver
//     `metricas.ts`): cargar o aprobar un borrador, crear una marca, cerrar o abrir
//     un balance y cerrar o desbloquear una conciliación o un impuesto cuentan CADA
//     VEZ; homologar cuentas y los cambios del Consolidado, una por cada 10 (35 →
//     4); los demás pasos, una vez por persona, documento y día (validar 5 alertas
//     = 1; cargar o aprobar 10 formularios DIAN de una revisión = 1; exportar un
//     papel de trabajo = 1). Se anotan además la edición del borrador de un módulo
//     y las exportaciones a Excel, y el reporte muestra el volumen de trabajo
//     (cuentas homologadas, alertas validadas, marcas…). El documento lo anota la bitácora
//     (`registros_auditoria.documento`); sin él, el cliente; descartar,
//     eliminar o borrar y lo que la plataforma anota sola no cuentan. Crear el
//     borrador de balance se anota («CREÓ BORRADOR de balance»; volver a leerlo,
//     «RELEYÓ…»), y las alertas de los módulos pasan a «Módulos de conciliación».
export const METODOLOGIA_USO_VIGENTE = 7;

/** ¿La instantánea se calculó con la metodología vigente? Sin marca, no. */
export function metodologiaAlDia(metadatos: unknown): boolean {
  if (!metadatos || typeof metadatos !== "object") return false;
  return (metadatos as { metodologia?: unknown }).metodologia === METODOLOGIA_USO_VIGENTE;
}
