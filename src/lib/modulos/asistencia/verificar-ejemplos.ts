// Los productos que el usuario armó a mano son CASOS DE PRUEBA de cualquier regla de lectura,
// la deduzca el código o la proponga la IA: una regla que no los lee exactamente igual —mismas
// celdas y mismo valor— se rechaza antes de mostrarse como válida. Puro y sin BD.
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import { normalizarMonto } from "@/lib/balance/extraccion/transformar";
import { MODULOS_IMPORT } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { ejecutarLecturaEstructurada, tokenNumerico, type RolLecturaInventario, type TrazaRegistroLectura } from "../extraccion/lectura-estructurada";
import { transformarModulo } from "../extraccion/transformar";
import { letraColumnaModulo } from "../perfil-modulo";
import { ETIQUETA_ROL, esRolNumerico, type EjemploVerificado } from "./modelo-usuario";

export type VerificacionEjemplos = { ok: boolean; diferencias: string[] };

const compactar = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const celda = (fila: number, columna: number) => `${letraColumnaModulo(columna)}${fila}`;

/** Un mismo dato aunque la regla lo recorte distinto: «$ 2.401» y «2.401» son el mismo importe. */
export function mismoValor(rol: RolLecturaInventario, leido: CeldaCruda, marcado: string): boolean {
  if (!esRolNumerico(rol)) return compactar(leido) === compactar(marcado);
  const a = typeof leido === "number" ? leido : normalizarMonto(tokenNumerico(leido, rol).valor);
  const b = normalizarMonto(tokenNumerico(marcado, rol).valor);
  return a != null && b != null && Math.abs(a - b) < 0.005;
}

function trazaDelEjemplo(trazas: TrazaRegistroLectura[], ejemplo: EjemploVerificado): TrazaRegistroLectura | undefined {
  let mejor: { traza: TrazaRegistroLectura; puntos: number } | undefined;
  for (const traza of trazas) {
    if (traza.tipo !== "registro") continue;
    const puntos = ejemplo.campos.filter((c) => traza.campos.some((tc) => tc.rol === c.rol && tc.fuentes.some((f) => f.fila === c.fila && f.columna === c.columna))).length
      + (traza.filaAncla === ejemplo.filaInicio ? 0.5 : 0);
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { traza, puntos };
  }
  return mejor?.traza;
}

export function verificarEjemplos(hoja: GridHoja, spec: SpecModulo, ejemplos: readonly EjemploVerificado[]): VerificacionEjemplos {
  const diferencias: string[] = [];
  if (spec.lecturaEstructurada) {
    const lectura = ejecutarLecturaEstructurada(hoja, spec.lecturaEstructurada, spec.primeraFilaDatos);
    ejemplos.forEach((ejemplo, n) => {
      const producto = `el producto ${n + 1} (fila ${ejemplo.filaInicio})`;
      const traza = trazaDelEjemplo(lectura.trazas, ejemplo);
      if (!traza) { diferencias.push(`La regla no reconoce ${producto} como un producto.`); return; }
      for (const campo of ejemplo.campos) {
        const leido = traza.campos.find((c) => c.rol === campo.rol);
        const etiqueta = ETIQUETA_ROL[campo.rol];
        if (!leido) { diferencias.push(`La regla no lee ${etiqueta} en ${producto}.`); continue; }
        if (!leido.fuentes.some((f) => f.fila === campo.fila && f.columna === campo.columna)) {
          const otra = leido.fuentes[0];
          diferencias.push(`La regla toma ${etiqueta} de ${producto} ${otra ? `en ${celda(otra.fila, otra.columna)}` : "de otra celda"}; tú lo marcaste en ${celda(campo.fila, campo.columna)}.`);
          continue;
        }
        if (!mismoValor(campo.rol, leido.valor, campo.valor)) {
          diferencias.push(`La regla lee «${compactar(leido.valor).slice(0, 60)}» como ${etiqueta} de ${producto}; tú marcaste «${compactar(campo.valor).slice(0, 60)}».`);
        }
      }
    });
    return { ok: diferencias.length === 0, diferencias };
  }
  // Lectura tabular: cada campo debe venir de la columna marcada y la fila, quedar en el detalle.
  const desplazamiento = hoja.columnaInicial ?? 0;
  const movimientos = new Set(transformarModulo(MODULOS_IMPORT.INV, spec, hoja).filas.filter((f) => f.tipoFila === "movimiento").map((f) => f.filaNum));
  ejemplos.forEach((ejemplo, n) => {
    const producto = `el producto ${n + 1} (fila ${ejemplo.filaInicio})`;
    for (const campo of ejemplo.campos) {
      const columna = spec.columnas[campo.rol] ?? 0;
      if (columna !== campo.columna - desplazamiento) {
        diferencias.push(`La lectura toma ${ETIQUETA_ROL[campo.rol]} de la columna ${columna > 0 ? letraColumnaModulo(columna + desplazamiento) : "—"}; en ${producto} lo marcaste en la ${letraColumnaModulo(campo.columna)}.`);
      }
    }
    if (!movimientos.has(ejemplo.filaInicio)) diferencias.push(`${producto[0].toUpperCase()}${producto.slice(1)} queda fuera del detalle con esta lectura.`);
  });
  return { ok: diferencias.length === 0, diferencias };
}
