// Por qué una fila del borrador es NOVEDAD, y en qué campo — puro.
//
// El borrador pinta en rojo las filas con novedad: negativos, valor total que no cuadra con
// cantidad × valor unitario, alertas de costo, la fila que parece el gran total y los subtotales
// del archivo que no cuadran. Son las mismas reglas con que el servidor las cuenta
// (`novedadesDeColumnas` y `resumirBorrador`), aplicadas a una fila para poder decir cuál fue.
import { fmtContable } from "@/lib/format";
import { COLUMNA_DIFERENCIA } from "./cartera/columnas-cartera";
import type { DescriptorModulo } from "./descriptores";
import type { ControlSubtotales } from "./subtotales";
import { ALERTAS_COSTO, alertasCostoDeFila, esDescuadreProducto, type TipoAlertaCosto } from "./validaciones";

/** Lo que el navegador necesita del descriptor para explicar las novedades (serializable). */
export type ReglasNovedad = {
  noNegativos: string[];
  productos: { resultado: string; producto: [string, string] }[];
  alertasCosto: { cantidad: string; unitario: string; total: string } | null;
};

/** Una novedad de la fila: qué pasa y qué columnas la muestran. */
export type MotivoNovedad = { texto: string; campos: string[] };

export function reglasNovedadDe(descriptor: DescriptorModulo): ReglasNovedad {
  return {
    noNegativos: [...(descriptor.noNegativos ?? [])],
    productos: Object.entries(descriptor.derivar ?? {}).flatMap(([resultado, regla]) => ("producto" in regla ? [{ resultado, producto: regla.producto }] : [])),
    alertasCosto: descriptor.alertasCosto ? { ...descriptor.alertasCosto } : null,
  };
}

const numero = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const enCero = (n: number | null) => n != null && Math.abs(n) < 0.005;
const ETIQUETA_COSTO = new Map(ALERTAS_COSTO.map((a) => [a.tipo, a.etiqueta]));

function camposCosto(tipo: TipoAlertaCosto, roles: NonNullable<ReglasNovedad["alertasCosto"]>, v: { unitario: number | null; total: number | null }): string[] {
  if (tipo === "costo_uno") return [roles.unitario];
  if (tipo === "sin_existencias_con_costo") return [roles.cantidad, roles.total];
  return [roles.cantidad, ...(enCero(v.unitario) ? [roles.unitario] : []), ...(enCero(v.total) ? [roles.total] : [])];
}

export type ContextoNovedad = {
  reglas: ReglasNovedad;
  /** Nombre visible de cada rol («Valor total»). */
  etiqueta: (rol: string) => string;
  /** La columna del valor: ahí se ve el total o el subtotal que no cuadra. */
  rolValor: string | null;
  /** Filas que parecen el gran total del archivo, con lo que suman las demás. */
  totalizadoras: ReadonlyMap<number, { resto: number }>;
  control: Pick<ControlSubtotales, "grupos" | "granTotal">;
};

/**
 * Las novedades de UNA fila tal como está guardada (las del servidor también se calculan sobre
 * lo guardado). Negativos, descuadres y alertas de costo solo cuentan en los ítems que suman.
 */
export function motivosNovedadFila(
  fila: { filaNum: number; tipoFila: string; omitida?: boolean | null; datos: Record<string, unknown> },
  contexto: ContextoNovedad,
): MotivoNovedad[] {
  const { reglas, etiqueta } = contexto;
  const enMinuscula = (rol: string) => etiqueta(rol).toLocaleLowerCase("es");
  const salida: MotivoNovedad[] = [];
  if (fila.tipoFila === "movimiento" && fila.omitida !== true) {
    const negativos = reglas.noNegativos.filter((rol) => { const v = numero(fila.datos[rol]); return v != null && v < 0; });
    if (negativos.length) salida.push({ texto: `Negativo en ${negativos.map(enMinuscula).join(", ")}`, campos: negativos });
    for (const p of reglas.productos) {
      const total = numero(fila.datos[p.resultado]);
      const a = numero(fila.datos[p.producto[0]]);
      const b = numero(fila.datos[p.producto[1]]);
      if (total == null || a == null || b == null || a === 0 || b === 0 || !esDescuadreProducto(total, a, b)) continue;
      const diferencia = Math.round((total - Math.round(a * b * 100) / 100) * 100) / 100;
      salida.push({
        texto: `${etiqueta(p.resultado)} no cuadra con ${enMinuscula(p.producto[0])} × ${enMinuscula(p.producto[1])}: diferencia ${fmtContable(diferencia)}`,
        campos: [p.resultado, ...p.producto, COLUMNA_DIFERENCIA],
      });
    }
    if (reglas.alertasCosto) {
      const roles = reglas.alertasCosto;
      const v = { cantidad: numero(fila.datos[roles.cantidad]), unitario: numero(fila.datos[roles.unitario]), total: numero(fila.datos[roles.total]) };
      for (const tipo of alertasCostoDeFila(v)) salida.push({ texto: ETIQUETA_COSTO.get(tipo) ?? tipo, campos: camposCosto(tipo, roles, v) });
    }
  }
  const valor = contexto.rolValor ? [contexto.rolValor] : [];
  const totalizadora = contexto.totalizadoras.get(fila.filaNum);
  if (totalizadora) salida.push({ texto: `Parece el total del archivo: vale lo que suman las demás filas (${fmtContable(totalizadora.resto)})`, campos: valor });
  const subtotal = contexto.control.grupos.find((g) => g.filaSubtotal === fila.filaNum && g.estado === "descuadre");
  if (subtotal) salida.push({ texto: `Subtotal del archivo que no cuadra con su bloque: diferencia ${fmtContable(subtotal.diferencia ?? 0)}`, campos: valor });
  const granTotal = contexto.control.granTotal;
  if (granTotal?.filaNum === fila.filaNum && granTotal.estado === "descuadre") {
    salida.push({ texto: `Total del archivo que no cuadra con el detalle: diferencia ${fmtContable(granTotal.diferencia ?? 0)}`, campos: valor });
  }
  return salida;
}
