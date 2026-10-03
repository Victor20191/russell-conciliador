// Qué campo del editor de mapeo explica un error del servidor, y hasta cuándo sigue vigente.
// Puro (sin React ni BD): lo usa `EditorMapeoModulo` para llevar el foco al selector de la columna
// que falta cuando guardar o «Probar el mapeo» rechazan el mapeo.
//
// NO valida: la autoridad sigue siendo el servidor (`validarSpecModulo`, `revisarMapeoMuestra`).
// Aquí solo se RECONOCE el mensaje que el servidor ya devolvió —comparándolo con las etiquetas de
// los roles del descriptor, nunca por texto genérico— y se decide si el campo ya se corrigió, para
// quitar el resaltado sin esperar a otro guardado. Si esta lectura local y el servidor discreparan,
// el servidor vuelve a rechazar y el campo se marca otra vez.
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { tieneValorFormula, validarValorFormula } from "@/lib/modulos/extraccion/valor-formula";

/** Lo que el editor necesita saber de un rol del descriptor (`RolModulo` lo satisface). */
export type RolMapeo = {
  nombre: string;
  etiqueta: string;
  requerido: boolean;
  /** Roles de los que se DERIVA este (Nómina: «Valor» sale de devengo/deducción o débito/crédito). */
  derivaDe?: string[];
};

/** El campo del editor al que se refiere un error. */
export type CampoErrorMapeo = { tipo: "rol"; rol: string } | { tipo: "tipoFormato" };

/** Un error atribuido a un campo, con el mensaje tal como lo devolvió el servidor. */
export type ErrorCampoMapeo = { campo: CampoErrorMapeo; mensaje: string };

/**
 * Cartera y CxP: el tipo de formato es obligatorio al guardar un patrón. Es el literal de
 * `MENSAJE_TIPO_FORMATO` (`patrones/revision-mapeo.ts`); se repite aquí porque ese módulo trae la
 * lectura completa del archivo y no debe viajar al navegador. La prueba lo compara con el original.
 */
export const MENSAJE_TIPO_FORMATO_EDITOR =
  "Elige el tipo de formato del archivo: por documento, por edades o por documento y edades.";

/** El mensaje de `validarSpecModulo` para un rol obligatorio sin mapear, con la etiqueta del rol. */
export const mensajeRolObligatorio = (etiqueta: string): string => `Falta la columna obligatoria «${etiqueta}».`;

/** ¿Este rol ya no hace falta porque el archivo trae las columnas de las que se deriva? */
export const rolDerivado = (rc: Pick<RolMapeo, "derivaDe">, columnas: Record<string, number>): boolean =>
  (rc.derivaDe ?? []).some((rol) => (columnas[rol] ?? 0) >= 1);

/**
 * A qué campo se refiere un mensaje del servidor; `null` si no es el de un campo del editor.
 * Solo reconoce los roles obligatorios del descriptor y el tipo de formato; cualquier otro
 * impedimento (hoja inexistente, sin filas, fórmula…) no mueve el foco.
 */
export function campoDeErrorMapeo(mensaje: string, roles: readonly RolMapeo[]): CampoErrorMapeo | null {
  const texto = mensaje.trim();
  // `startsWith`: al aprobar una pendiente el servidor añade «Edita la versión antes de aprobarla.».
  if (texto.startsWith(MENSAJE_TIPO_FORMATO_EDITOR)) return { tipo: "tipoFormato" };
  const rol = roles.find((r) => r.requerido && texto === mensajeRolObligatorio(r.etiqueta));
  return rol ? { tipo: "rol", rol: rol.nombre } : null;
}

export type ContextoVigencia = {
  spec: Pick<SpecModulo, "columnas" | "clasificadorModo" | "valorFormula" | "tipoFormato">;
  roles: readonly RolMapeo[];
  /** El rol que agrupa el archivo (admite «un único valor para todo el archivo»). */
  clasificadorRol: string;
  /** El rol del valor (admite una fórmula de varias columnas). */
  rolValor: string;
};

/**
 * ¿El campo sigue incumpliendo lo que el servidor reclamó? Es `false` en cuanto el mapeo lo
 * resuelve: se elige otra columna para el rol, el clasificador pasa a «único para todo el archivo»,
 * el valor se escribe como una fórmula válida o se mapean las columnas de las que se deriva.
 * Las mismas excepciones que el editor ya refleja en el asterisco de «obligatorio».
 */
export function errorMapeoVigente(campo: CampoErrorMapeo, ctx: ContextoVigencia): boolean {
  const { spec } = ctx;
  if (campo.tipo === "tipoFormato") return !spec.tipoFormato;

  const rc = ctx.roles.find((r) => r.nombre === campo.rol);
  if (!rc) return false;
  if ((spec.columnas[rc.nombre] ?? 0) >= 1) return false;
  if (rc.nombre === ctx.clasificadorRol && spec.clasificadorModo === "global") return false;
  if (rolDerivado(rc, spec.columnas)) return false;
  if (rc.nombre === ctx.rolValor && tieneValorFormula(spec) && validarValorFormula(spec, String) === null) return false;
  return true;
}

/** Id del control del campo, único por instancia del editor (`base` sale de `useId`). */
export const idCampoMapeo = (base: string, campo: CampoErrorMapeo): string =>
  `${base}-${campo.tipo === "rol" ? `rol-${campo.rol}` : "tipo-formato"}`;

/** Id del mensaje inline del campo: el control lo referencia con `aria-describedby`. */
export const idMensajeCampoMapeo = (base: string, campo: CampoErrorMapeo): string => `${idCampoMapeo(base, campo)}-error`;
