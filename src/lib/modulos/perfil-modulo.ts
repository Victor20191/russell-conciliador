// Memoria de carga de MÓDULOS (Inventarios, Cartera, CxP, Ingresos, Activos Fijos,
// Nómina): lógica PURA (sin BD ni React) para administrar el perfil de formato que el
// motor genérico guarda por (cliente, módulo, huella) en `perfiles_carga_modulo`.
//
// Es el equivalente, para módulos, de `src/lib/balance/extraccion/perfil.ts`: aquí vive
// lo que la pantalla Configuración › Perfiles de carga necesita para MOSTRAR y EDITAR un
// `SpecModulo` guardado sin conocer los detalles de cada módulo — la forma la dicta el
// descriptor (`descriptores.ts`), igual que en el wizard de carga y en el transform.
import type { DescriptorModulo } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";
export { MODOS_SUBTOTALES, descripcionModoSubtotales, type ModoSubtotales } from "./subtotales";

/** Modo EFECTIVO del clasificador de un spec (resuelve el legado `arrastrarClasificador`). */
export type ModoClasificador = NonNullable<SpecModulo["clasificadorModo"]>;

export const MODOS_CLASIFICADOR: readonly ModoClasificador[] = ["columna", "arrastrar", "seccion", "global"];

export function modoClasificadorDe(spec: Pick<SpecModulo, "clasificadorModo" | "arrastrarClasificador">): ModoClasificador {
  return spec.clasificadorModo ?? (spec.arrastrarClasificador ? "arrastrar" : "columna");
}

/** Letra Excel (A, B, …, AA) de un índice de columna 1-based; 0 o inválido → «—». */
export function letraColumnaModulo(numero: number): string {
  if (!Number.isInteger(numero) || numero <= 0) return "—";
  let restante = numero;
  let etiqueta = "";
  while (restante > 0) {
    const modulo = (restante - 1) % 26;
    etiqueta = String.fromCharCode(65 + modulo) + etiqueta;
    restante = Math.floor((restante - 1) / 26);
  }
  return etiqueta;
}

/**
 * Normaliza un spec contra su descriptor para dejarlo APLICABLE de forma determinista:
 *  - conserva únicamente los roles del descriptor (los desconocidos se descartan) y
 *    completa con 0 los que falten;
 *  - índices no enteros o negativos → 0 (= la columna no existe);
 *  - `hoja` sin espacios sobrantes;
 *  - el modo del clasificador queda explícito en `clasificadorModo` (el legado
 *    `arrastrarClasificador` se resuelve y se retira);
 *  - `seccionColumnaVaciaRol` solo tiene sentido en modo «seccion»;
 *  - `subtotales` solo se conserva cuando difiere del predeterminado («auto»), así los
 *    perfiles antiguos siguen siendo equivalentes.
 * No valida: para eso está `validarSpecModulo`.
 */
export function normalizarSpecModulo(descriptor: DescriptorModulo, spec: SpecModulo): SpecModulo {
  const columnas: Record<string, number> = {};
  for (const rol of descriptor.columnas) {
    const valor = spec.columnas[rol.nombre];
    columnas[rol.nombre] = Number.isInteger(valor) && (valor as number) > 0 ? (valor as number) : 0;
  }
  const modo = modoClasificadorDe(spec);
  const normalizado: SpecModulo = {
    hoja: spec.hoja.trim(),
    filaEncabezado: Number.isInteger(spec.filaEncabezado) ? spec.filaEncabezado : 0,
    primeraFilaDatos: Number.isInteger(spec.primeraFilaDatos) ? spec.primeraFilaDatos : 0,
    columnas,
    clasificadorModo: modo,
  };
  if (modo === "seccion") {
    const rol = spec.seccionColumnaVaciaRol?.trim();
    if (rol) normalizado.seccionColumnaVaciaRol = rol;
  }
  if (spec.subtotales === "rotulo" || spec.subtotales === "nunca") normalizado.subtotales = spec.subtotales;
  return normalizado;
}

/**
 * Valida un spec YA normalizado contra el descriptor. Devuelve el primer mensaje de
 * error legible o `null` si el perfil se puede guardar y aplicar.
 */
export function validarSpecModulo(descriptor: DescriptorModulo, spec: SpecModulo): string | null {
  if (spec.hoja.trim().length === 0) return "Indica el nombre exacto de la hoja del archivo.";
  if (spec.hoja.trim().length > 120) return "El nombre de la hoja es demasiado largo (máx. 120 caracteres).";
  if (!Number.isInteger(spec.filaEncabezado) || spec.filaEncabezado < 1) {
    return "La fila del encabezado debe ser un número positivo.";
  }
  if (!Number.isInteger(spec.primeraFilaDatos) || spec.primeraFilaDatos <= spec.filaEncabezado) {
    return "La primera fila de datos debe ir después de la fila de encabezado.";
  }
  const modo = modoClasificadorDe(spec);
  for (const rol of descriptor.columnas) {
    const valor = spec.columnas[rol.nombre] ?? 0;
    if (!Number.isInteger(valor) || valor < 0) {
      return "Las columnas deben usar índices positivos; usa 0 únicamente para indicar que una columna no existe.";
    }
    // El clasificador en modo global no se lee de ninguna columna: todo el archivo es un
    // único grupo (p. ej. inventario globalizado).
    const exentoPorGlobal = rol.nombre === descriptor.clasificador && modo === "global";
    if (rol.requerido && !exentoPorGlobal && valor < 1) {
      return `Falta la columna obligatoria «${rol.etiqueta}».`;
    }
  }
  if (modo === "seccion") {
    const rolSenal = spec.seccionColumnaVaciaRol ?? "";
    const definicion = descriptor.columnas.find((rc) => rc.nombre === rolSenal);
    if (!definicion || rolSenal === descriptor.clasificador) {
      return "En el modo de renglones de sección indica qué otra columna viene vacía en esos renglones (no puede ser la del clasificador).";
    }
    const colSenal = spec.columnas[rolSenal] ?? 0;
    if (colSenal < 1) {
      return `La columna «${definicion.etiqueta}» que identifica los renglones de sección está sin mapear.`;
    }
    if (colSenal === (spec.columnas[descriptor.clasificador] ?? 0)) {
      return `La columna «${definicion.etiqueta}» no puede ser la misma del clasificador: en los renglones de sección nunca estaría vacía.`;
    }
  }
  return null;
}

/** ¿Los dos specs son equivalentes tras normalizarlos? (para no registrar ediciones vacías). */
export function mismoSpecModuloNormalizado(descriptor: DescriptorModulo, a: SpecModulo, b: SpecModulo): boolean {
  return JSON.stringify(normalizarSpecModulo(descriptor, a)) === JSON.stringify(normalizarSpecModulo(descriptor, b));
}

/**
 * Resumen legible de las columnas mapeadas («tipo de inventario B · referencia A · valor
 * total F»), en el orden de declaración del descriptor. Las columnas en 0 no aparecen.
 */
export function resumenColumnasModulo(descriptor: DescriptorModulo, spec: SpecModulo): string {
  const modo = modoClasificadorDe(spec);
  const partes: string[] = [];
  for (const rol of descriptor.columnas) {
    if (rol.nombre === descriptor.clasificador && modo === "global") {
      partes.push(`${rol.etiqueta.toLowerCase()} global`);
      continue;
    }
    const numero = spec.columnas[rol.nombre] ?? 0;
    if (numero > 0) partes.push(`${rol.etiqueta.toLowerCase()} ${letraColumnaModulo(numero)}`);
  }
  return partes.join(" · ");
}

/** Descripción del modo del clasificador para la UI, con la etiqueta del rol clasificador. */
export function descripcionModoClasificador(modo: ModoClasificador, etiquetaClasificador: string): string {
  const etiqueta = etiquetaClasificador.toLowerCase();
  switch (modo) {
    case "arrastrar":
      return `Agrupado en su columna: el ${etiqueta} aparece una vez por bloque y las filas de abajo lo heredan`;
    case "seccion":
      return `En renglones de sección intercalados con los ítems: cada sección hereda su ${etiqueta}`;
    case "global":
      return `Sin columna: todo el archivo se carga como un único ${etiqueta} global`;
    default:
      return `En su propia columna, con valor en cada fila`;
  }
}
