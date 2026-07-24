// Codificación COMPACTA y sin pérdida de las filas del borrador para el viaje
// servidor → navegador. Un balance abierto por tercero trae decenas de miles de
// filas donde los textos (código, crudo, nombre de la cuenta) se repiten miles de
// veces y cada objeto JSON repite además los nombres de campo: serializado como
// objetos pesaba ~15 MB por visita. Aquí cada fila es una TUPLA posicional y los
// textos van UNA vez en un diccionario compartido (las filas los referencian por
// índice). Es compresión estructural: `expandirFilas(compactarFilas(x))` devuelve
// exactamente los mismos datos — ninguna cifra ni fila se altera.
import type { FilaBorrador } from "./borrador";
import type { TipoFila } from "./extraccion/transformar";

const TIPOS_FILA: readonly TipoFila[] = ["movimiento", "agrupadora", "total", "descuadre"];
const FORZADOS: readonly (FilaBorrador["tipoFilaForzado"] | undefined)[] = [null, "agrupadora", "movimiento"];

/** Tupla posicional de una fila (los índices 1-3 apuntan al diccionario `textos`). */
export type FilaCompacta = [
  filaNum: number,
  codigo: number,
  codigoCrudo: number,
  nombre: number,
  nivel: number, // -1 = null (el PUC real usa 1..n)
  tipoFila: number, // índice en TIPOS_FILA
  tipoFilaForzado: number, // índice en FORZADOS
  flags: number, // bit 0: desacoplada · bits 1-2: omitida (0 sin tocar / 1 omitida / 2 rescatada)
  padreManual: number, // -1 = null
  saldoInicial: number,
  debitos: number,
  creditos: number,
  saldoFinal: number,
];

export type FilasCompactas = { textos: string[]; filas: FilaCompacta[] };

export function compactarFilas(filas: FilaBorrador[]): FilasCompactas {
  const textos: string[] = [];
  const indice = new Map<string, number>();
  const texto = (s: string): number => {
    let i = indice.get(s);
    if (i == null) {
      i = textos.length;
      textos.push(s);
      indice.set(s, i);
    }
    return i;
  };
  const out: FilaCompacta[] = filas.map((f) => {
    const tipo = TIPOS_FILA.indexOf(f.tipoFila);
    if (tipo < 0) throw new Error(`tipoFila desconocido: ${f.tipoFila}`);
    const forzado = FORZADOS.indexOf(f.tipoFilaForzado ?? null);
    const omitida = f.omitida === undefined ? 0 : f.omitida ? 1 : 2;
    const flags = (f.desacoplada ? 1 : 0) | (omitida << 1);
    return [
      f.filaNum,
      texto(f.codigo),
      texto(f.codigoCrudo),
      texto(f.nombre),
      f.nivel ?? -1,
      tipo,
      forzado < 0 ? 0 : forzado,
      flags,
      f.padreManual ?? -1,
      f.saldoInicial,
      f.debitos,
      f.creditos,
      f.saldoFinal,
    ];
  });
  return { textos, filas: out };
}

export function expandirFilas(compactas: FilasCompactas): FilaBorrador[] {
  const { textos, filas } = compactas;
  return filas.map((t) => {
    const omitida = (t[7] >> 1) & 0b11;
    return {
      filaNum: t[0],
      codigo: textos[t[1]],
      codigoCrudo: textos[t[2]],
      nombre: textos[t[3]],
      nivel: t[4] === -1 ? null : t[4],
      tipoFila: TIPOS_FILA[t[5]],
      tipoFilaForzado: FORZADOS[t[6]] ?? null,
      desacoplada: (t[7] & 1) === 1,
      omitida: omitida === 0 ? undefined : omitida === 1,
      padreManual: t[8] === -1 ? null : t[8],
      saldoInicial: t[9],
      debitos: t[10],
      creditos: t[11],
      saldoFinal: t[12],
    };
  });
}
