// FECHA DE CORTE de un auxiliar por tercero y los días de vencimiento — puro, sin BD.
//
// Por defecto el corte es el fin del período del cargue; quien carga puede fijar otro cuando el
// cliente generó el reporte otro día. Los archivos no dicen a qué fecha calcularon los días
// vencidos, pero se deduce: vencimiento + días = corte. Si esa fecha no es la del cargue, los
// días y las edades del archivo están corridos (LAMINAIRE los calculó a mediados de enero) y
// hay que decirlo.

const DIA_MS = 86_400_000;
/** Día cero de los números de serie de Excel (con el bisiesto fantasma de 1900 ya descontado). */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

function fechaValida(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1) return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1) return null;
  return fecha.toISOString().slice(0, 10);
}

/** Fecha ISO (AAAA-MM-DD) de una celda: ISO, «dd/mm/aaaa» o número de serie de Excel (también escrito como texto). */
export function fechaISO(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    if (valor < 20_000 || valor > 80_000) return null;
    return new Date(EPOCA_EXCEL + Math.round(valor) * DIA_MS).toISOString().slice(0, 10);
  }
  const texto = String(valor ?? "").trim();
  // El serial también llega como TEXTO cuando la celda se guardó tal cual («46018»).
  if (/^\d{5}$/.test(texto)) return fechaISO(Number(texto));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(texto);
  if (local) return fechaValida(Number(local[3]), Number(local[2]), Number(local[1]));
  return null;
}

/** Último día del período «AAAA-MM». */
export function finDePeriodo(periodo: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo.trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10);
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

export type CorteDeducido = {
  fecha: string;
  /** Filas cuyo vencimiento + días da esa fecha. */
  coincidencias: number;
  /** Filas que traen vencimiento y días distintos de cero. */
  filasConDias: number;
};

/**
 * Fecha a la que el archivo calculó sus días vencidos: la más frecuente de vencimiento + días.
 * Las filas con 0 días no cuentan —varios ERP ponen 0 a todo lo que no ha vencido— y solo se
 * deduce con evidencia: al menos 3 filas y la mitad de las que traen días.
 */
export function deducirFechaCorte(filas: readonly { vencimiento: unknown; diasVencidos: unknown }[]): CorteDeducido | null {
  const conteo = new Map<string, number>();
  let filasConDias = 0;
  for (const f of filas) {
    const vencimiento = fechaISO(f.vencimiento);
    const dias = f.diasVencidos;
    if (!vencimiento || typeof dias !== "number" || !Number.isInteger(dias) || dias === 0) continue;
    filasConDias += 1;
    const corte = sumarDias(vencimiento, dias);
    conteo.set(corte, (conteo.get(corte) ?? 0) + 1);
  }
  let mejor: [string, number] | null = null;
  for (const par of conteo) {
    if (!mejor || par[1] > mejor[1] || (par[1] === mejor[1] && par[0] < mejor[0])) mejor = par;
  }
  if (!mejor || mejor[1] < 3 || mejor[1] * 2 < filasConDias) return null;
  return { fecha: mejor[0], coincidencias: mejor[1], filasConDias };
}
