// Reporte de nómina POR EMPLEADO (HGI «LIQUIDACION»): cada empleado es una fila con su cédula en
// la columna del CÓDIGO, su nombre en la del CONCEPTO y su total en la del VALOR; debajo van sus
// conceptos (código, nombre, valor). Puro, sin BD.
//
//   1022093434  GALLO LEZCANO DANIEL ALBERTO   19.922.093   ← empleado (= Σ de sus conceptos)
//   01          SALARIO BASICO                 17.082.000
//   02          AUXILIO DE TRANSPORTE           2.400.000
//   30          APORTE SALUD                     -683.280
//
// Leída tal cual, la fila del empleado entraba como un concepto más cuyo código es la cédula y la
// nómina salía al doble (GEN PROMOTORA, 2025: 577.901.498 contado dos veces). La fila se reconoce
// por EVIDENCIA ARITMÉTICA, no por su forma: una cédula en la columna del código Y una cifra igual a
// la Σ de los conceptos que la siguen. Se decide por archivo: si cuadra la gran mayoría de las
// candidatas, todas son filas de empleado (la que no cuadre se avisa); si no, no se toca nada —un
// ERP con códigos de concepto largos no tiene por qué parecerse a esto—.

/** Lo que se mira de cada fila: lo que trae en la columna del código, del concepto y del valor. */
export type FilaPorEmpleadoCruda = { codigo: string | null; nombre: string | null; valor: number | null };

export type FilaDeEmpleado = {
  cedula: string;
  nombre: string;
  /** La cifra que la fila declara: el total del empleado. */
  total: number;
  /** Σ de los conceptos que la siguen hasta el próximo empleado o el total del archivo. */
  sumaConceptos: number;
  cuadra: boolean;
};

/** Diferencia tolerada entre el total del empleado y la Σ de sus conceptos (redondeo del ERP). */
const TOLERANCIA = 1;
/** Proporción de candidatas que deben cuadrar para tomar el archivo por un reporte por empleado. */
const PROPORCION_MINIMA = 0.8;

const ROTULO_TOTAL = /^\s*(sub)?totales?\b/i;
const redondear = (v: number): number => Math.round(v * 100) / 100 + 0;

/**
 * ¿Una cédula o NIT en la columna del código? Solo dígitos (con puntos o el DV tras guion) y al
 * menos seis: los códigos de concepto son cortos («01», «80», «C001»).
 */
export function pareceCedulaEnCodigo(valor: string | null): boolean {
  if (valor == null) return false;
  const t = valor.trim();
  if (!/^\d[\d.,]*(-\d)?$/.test(t)) return false;
  const digitos = t.replace(/-\d$/, "").replace(/\D/g, "");
  return digitos.length >= 6 && digitos.length <= 12;
}

const tieneLetras = (v: string | null): v is string => v != null && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v);
const esRotuloTotal = (v: string | null): boolean => v != null && ROTULO_TOTAL.test(v);

/**
 * Filas de empleado del archivo, por índice en `filas`. Vacío si el archivo no es un reporte por
 * empleado. Una candidata necesita cédula en el código, nombre con letras y cifra; su bloque son
 * los conceptos que siguen hasta la próxima candidata o un rótulo «Total…».
 */
export function detectarFilasDeEmpleado(filas: readonly FilaPorEmpleadoCruda[]): Map<number, FilaDeEmpleado> {
  const candidatas: number[] = [];
  filas.forEach((f, i) => {
    if (pareceCedulaEnCodigo(f.codigo) && tieneLetras(f.nombre) && f.valor != null) candidatas.push(i);
  });
  if (candidatas.length === 0) return new Map();

  const esCandidata = new Set(candidatas);
  const resultado = new Map<number, FilaDeEmpleado>();
  let cuadran = 0;
  for (const i of candidatas) {
    let suma = 0;
    let conceptos = 0;
    for (let j = i + 1; j < filas.length; j++) {
      const f = filas[j];
      if (esCandidata.has(j) || esRotuloTotal(f.codigo) || esRotuloTotal(f.nombre)) break;
      if (f.codigo == null || f.valor == null) continue;
      suma += f.valor;
      conceptos++;
    }
    const total = filas[i].valor as number;
    const sumaConceptos = redondear(suma);
    const cuadra = conceptos > 0 && Math.abs(redondear(total) - sumaConceptos) <= TOLERANCIA;
    if (cuadra) cuadran++;
    resultado.set(i, {
      cedula: (filas[i].codigo as string).trim(),
      nombre: (filas[i].nombre as string).trim(),
      total: redondear(total),
      sumaConceptos,
      cuadra,
    });
  }
  return cuadran > 0 && cuadran / candidatas.length >= PROPORCION_MINIMA ? resultado : new Map();
}
