// COLUMNA DOBLE EN EL MAPEO — puro, sin BD.
//
// El mapeo deja poner la misma columna en dos campos, y a veces es lo correcto (el tipo de
// inventario va en la columna del código). Pero si los dos campos son importes que el módulo SUMA
// entre sí (`importesQueSeSuman` del descriptor), el importe de esa columna se toma dos veces y el
// valor queda duplicado: en KOEN PACK la valorización leía la columna del costo y cada activo salía
// al doble en la cédula. Aquí se detecta para avisarlo mientras se mapea; no bloquea la carga.
import type { DescriptorModulo } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";
import { tieneValorFormula } from "./extraccion/valor-formula";

/** El grupo de importes que se suman al que pertenece un rol (viaja con el rol al editor). */
export type SumaDelRol = { grupo: number; efecto: string };

/** `{ suma }` para el rol que pertenece a un grupo; vacío si no (se esparce en el rol del editor). */
export function sumaDelRol(
  descriptor: Pick<DescriptorModulo, "importesQueSeSuman">,
  rol: string,
): { suma?: SumaDelRol } {
  const grupos = descriptor.importesQueSeSuman ?? [];
  const grupo = grupos.findIndex((g) => g.roles.includes(rol));
  return grupo >= 0 ? { suma: { grupo, efecto: grupos[grupo].efecto } } : {};
}

export type AvisoColumnaDoble = {
  columna: number;
  /** Los roles que la toman, en el orden del mapeo. */
  roles: string[];
  mensaje: string;
};

const VECES = ["", "una vez", "dos veces", "tres veces", "cuatro veces"];
const CUANTOS = ["", "", "Los dos", "Los tres", "Los cuatro"];

const lista = (etiquetas: readonly string[]): string => {
  const citadas = etiquetas.map((e) => `en «${e}»`);
  return citadas.length <= 1 ? citadas.join("") : `${citadas.slice(0, -1).join(", ")} y ${citadas.at(-1)}`;
};

/**
 * Columnas que toman dos o más roles de un mismo grupo de importes que se suman. El valor por
 * FÓRMULA ocupa el lugar de la columna del valor: cuentan sus términos que suman (uno que resta
 * anularía el otro campo, no lo duplicaría).
 */
export function avisosColumnaDoble(p: {
  roles: readonly { nombre: string; etiqueta: string; suma?: SumaDelRol }[];
  spec: Pick<SpecModulo, "columnas" | "valorFormula">;
  rolValor: string;
  /** Cómo se nombra la columna en el aviso («D («VALOR»)»). */
  rotulo: (columna: number) => string;
}): AvisoColumnaDoble[] {
  const formula = tieneValorFormula(p.spec) ? p.spec.valorFormula : null;
  const columnasDe = (rol: string): number[] => {
    if (rol === p.rolValor && formula) return [...new Set(formula.filter((t) => t.signo === "+").map((t) => t.columna))];
    const c = p.spec.columnas[rol] ?? 0;
    return c >= 1 ? [c] : [];
  };
  // grupo → columna → roles que la toman
  const tomas = new Map<number, Map<number, { nombre: string; etiqueta: string; efecto: string }[]>>();
  for (const rol of p.roles) {
    if (!rol.suma) continue;
    const porColumna = tomas.get(rol.suma.grupo) ?? new Map();
    tomas.set(rol.suma.grupo, porColumna);
    for (const c of columnasDe(rol.nombre)) {
      porColumna.set(c, [...(porColumna.get(c) ?? []), { nombre: rol.nombre, etiqueta: rol.etiqueta, efecto: rol.suma.efecto }]);
    }
  }
  const avisos: AvisoColumnaDoble[] = [];
  for (const porColumna of tomas.values()) {
    for (const [columna, quienes] of porColumna) {
      if (quienes.length < 2) continue;
      const n = quienes.length;
      const veces = VECES[n] ?? `${n} veces`;
      const cuantos = CUANTOS[n] ?? `Los ${n}`;
      avisos.push({
        columna,
        roles: quienes.map((q) => q.nombre),
        mensaje: `La columna ${p.rotulo(columna)} se toma ${veces}: ${lista(quienes.map((q) => q.etiqueta))}. ${cuantos} ${quienes[0].efecto}, así que su valor quedará duplicado.`,
      });
    }
  }
  return avisos.sort((a, b) => a.columna - b.columna);
}
