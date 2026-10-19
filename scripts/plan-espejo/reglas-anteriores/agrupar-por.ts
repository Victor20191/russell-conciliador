// COPIA CONGELADA de src/lib/modulos/nomina/agrupar-por.ts tal como estaba en master el 19/Oct/2026,
// antes del plan espejo (rama nomina-plan-espejo). Solo la usa scripts/corregir-plan-espejo-nomina.ts
// para reconocer lo que salió de las reglas anteriores. No editar ni importar desde la aplicación.
// «AGRUPAR POR» del Consolidado de Nómina (11/Oct/2026): por qué dimensión se agrupan los
// conceptos de un cargue.
//
// Hasta hoy el renglón del Consolidado era el CÓDIGO del concepto (con el nombre como respaldo fila
// a fila cuando el archivo no trae código). Hay ERP que no imprimen código —solo el nombre— y otros
// que traen la cuenta contable completa del cliente, donde el concepto pasa a segundo plano. Por
// eso la dimensión se elige por cargue, entre lo que el archivo tiene mapeado y con datos:
//
//  - `codigo`   → el código canónico del concepto (lo de siempre: columna `clasificador`).
//  - `concepto` → el nombre del concepto, con los espacios colapsados y recortados. NO se cambian
//                 mayúsculas ni tildes: igual que los códigos con letras, el texto se respeta.
//  - `cuenta`   → la cuenta contable del cliente que trae la fila (`cuentaArchivoValida`: dígitos,
//                 al menos 6, no comodín). Conserva los ceros a la izquierda («0005060000» de SIIGO):
//                 por eso NO pasa por `codigoConceptoCanonico`, que los quitaría.
//
// Queda guardada en `modulo_dato_encabezado.agrupar_por` y rige la asignación de cuentas, la
// memoria del cliente y la asignación del período (ambas llevan su `agrupar_por`), el cruce
// contable y el Excel. Se pregunta SIEMPRE al cargar, pre-marcada con la última que usó ese
// cliente con ese patrón, y se puede cambiar en el Consolidado.
//
// Puro: sin BD. Pruebas en `agrupar-por.test.ts`.

// La forma canónica vive en `homologacion.ts` (la usa la memoria) y se publica también aquí.
export { clasificadorCanonico } from "./homologacion";

export const OPCIONES_AGRUPAR_POR = ["codigo", "concepto", "cuenta"] as const;
export type AgruparPorNomina = (typeof OPCIONES_AGRUPAR_POR)[number];

/** Lo que rige cuando el cargue no dice nada (cargues anteriores a esta opción). */
export const AGRUPAR_POR_DEFECTO: AgruparPorNomina = "codigo";

export function esAgruparPor(v: unknown): v is AgruparPorNomina {
  return typeof v === "string" && (OPCIONES_AGRUPAR_POR as readonly string[]).includes(v);
}

const ETIQUETAS: Record<AgruparPorNomina, { singular: string; plural: string; rol: "codigo" | "concepto" | "cuenta" }> = {
  codigo: { singular: "Código del concepto", plural: "Códigos de concepto", rol: "codigo" },
  concepto: { singular: "Nombre del concepto", plural: "Nombres de concepto", rol: "concepto" },
  cuenta: { singular: "Cuenta contable del cliente", plural: "Cuentas contables del cliente", rol: "cuenta" },
};

/** Etiqueta de la columna del Consolidado («Código del concepto», «Nombre del concepto»…). */
export function etiquetaAgruparPor(agruparPor: AgruparPorNomina): string {
  return ETIQUETAS[agruparPor].singular;
}

export function etiquetaAgruparPorPlural(agruparPor: AgruparPorNomina): string {
  return ETIQUETAS[agruparPor].plural;
}

/** Rol del descriptor NOM cuyos datos forman la clave de esa dimensión. */
export function rolDeAgruparPor(agruparPor: AgruparPorNomina): "codigo" | "concepto" | "cuenta" {
  return ETIQUETAS[agruparPor].rol;
}

/** La dimensión que rige cuando nadie eligió: código si lo hay, si no nombre, si no cuenta. */
export function agruparPorDefecto(disponibles: Partial<Record<AgruparPorNomina, boolean>>): AgruparPorNomina {
  for (const opcion of OPCIONES_AGRUPAR_POR) if (disponibles[opcion]) return opcion;
  return AGRUPAR_POR_DEFECTO;
}

/**
 * Con qué llega PRE-MARCADA la pregunta del cargue: la última agrupación que usó el cliente con
 * ese patrón, si este archivo la tiene mapeada; si no (o sin historial), la de por defecto entre
 * las mapeadas. El usuario la confirma o la cambia ahí mismo.
 */
export function agruparPorPreseleccion(
  ultimo: AgruparPorNomina | null | undefined,
  mapeadas: Partial<Record<AgruparPorNomina, boolean>>,
): AgruparPorNomina {
  if (ultimo && mapeadas[ultimo]) return ultimo;
  return agruparPorDefecto(mapeadas);
}

/** Qué dimensiones tiene mapeadas un spec (columna del rol ≥ 1). */
export function agruparPorMapeadas(columnas: Readonly<Record<string, number>> | null | undefined): Record<AgruparPorNomina, boolean> {
  const mapeada = (rol: string) => Number.isInteger(columnas?.[rol]) && (columnas![rol] as number) >= 1;
  return {
    codigo: mapeada("codigo"),
    concepto: mapeada("concepto"),
    cuenta: mapeada("cuenta"),
  };
}

/** La agrupación guardada en el spec de un lote (`spec.agruparPor`), o null si no la trae. */
export function leerAgruparPorDeLote(specJson: unknown): AgruparPorNomina | null {
  if (specJson == null || typeof specJson !== "object") return null;
  const crudo = (specJson as Record<string, unknown>).agruparPor;
  return esAgruparPor(crudo) ? crudo : null;
}

/**
 * La agrupación de un BORRADOR (o del cargue que saldrá de él): la que se respondió al leer el
 * archivo o, en un lote anterior a la pregunta, la de por defecto entre lo que su mapeo trae.
 */
export function agruparPorDeLote(specJson: unknown): AgruparPorNomina {
  const columnas = specJson != null && typeof specJson === "object"
    ? (specJson as { columnas?: Record<string, number> }).columnas
    : undefined;
  return leerAgruparPorDeLote(specJson) ?? agruparPorDefecto(agruparPorMapeadas(columnas));
}

/**
 * ¿La clave del grupo es otra cosa que el clasificador de la fila? Por código el grupo ES el
 * clasificador (lo de siempre); por nombre o por cuenta se calcula de `datos`.
 */
export function agrupaPorOtraDimension(agruparPor: AgruparPorNomina | null | undefined): agruparPor is "concepto" | "cuenta" {
  return agruparPor === "concepto" || agruparPor === "cuenta";
}

/**
 * Los dígitos de la cuenta del cliente de cada fila (`c.d`), que usa `expresionSqlClaveNomina` al
 * agrupar por cuenta. Va después del FROM de `modulo_dato_detalle` o `modulo_importacion_staging`.
 */
export const SQL_LATERAL_CUENTA_NOMINA =
  "CROSS JOIN LATERAL (SELECT CASE WHEN datos ? 'cuenta' THEN regexp_replace(COALESCE(datos->>'cuenta', ''), '[^0-9]', '', 'g') ELSE '' END AS d) c";

/** La agrupación de un encabezado ya guardado: null (cargue anterior) = código. */
export function agruparPorDeEncabezado(v: unknown): AgruparPorNomina {
  return esAgruparPor(v) ? v : AGRUPAR_POR_DEFECTO;
}

/**
 * La MISMA clave de `baseClaveNomina` (consolidado-nomina.ts) escrita en SQL, para los GROUP BY del
 * cargue (`gruposNominaDelCargue`, `nombresConceptoDelCargue`) sobre `modulo_dato_detalle`. Agrupando
 * por cuenta usa `c.d`: los dígitos de `datos->>'cuenta'` que calcula el `CROSS JOIN LATERAL` de
 * esas consultas. NULL cuando la fila no trae el dato (el llamador lo vuelve «(sin clasificar)»).
 * El nombre colapsa cualquier espacio, también el de no separación (U+00A0) que pegan algunos ERP.
 */
export function expresionSqlClaveNomina(agruparPor: AgruparPorNomina): string {
  switch (agruparPor) {
    case "concepto":
      return "NULLIF(btrim(regexp_replace(COALESCE(datos->>'concepto', ''), '[[:space:] ]+', ' ', 'g')), '')";
    case "cuenta":
      return "CASE WHEN c.d ~ '^[0-9]{6,}$' AND c.d !~ '^([0-9])\\1+$' THEN c.d END";
    default:
      return "NULLIF(btrim(clasificador), '')";
  }
}

/** Texto para la bitácora: « · agrupado por nombre del concepto». */
export function detalleAuditoriaAgruparPor(agruparPor: AgruparPorNomina | null | undefined): string {
  return agruparPor ? ` · agrupado por ${etiquetaAgruparPor(agruparPor).toLocaleLowerCase("es")}` : "";
}
