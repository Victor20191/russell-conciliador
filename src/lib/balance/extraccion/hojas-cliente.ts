// Inspección de hojas en el CLIENTE para que el staff elija cuál cargar.
//
// Cuando un Excel trae varias hojas (Balance, Retenciones, Parámetros…), el
// usuario debe elegir explícitamente la hoja del balance: la IA no asume. Este
// módulo lee el libro en el navegador —con las MISMAS opciones que la ingesta
// del servidor (`ingesta.ts`)— para listar las hojas con contenido y una vista
// previa, SIN subir el archivo. SheetJS se importa de forma diferida para no
// inflar el bundle: solo se carga al seleccionar un Excel.

// Reproducido localmente (no se importa de `ingesta.ts`, que arrastra `xlsx`
// como dependencia de servidor en su top-level).
export type CeldaCruda = string | number | boolean | null;

export type HojaPreview = {
  nombre: string;
  totalFilas: number;
  totalColumnas: number;
  muestra: CeldaCruda[][];
};

const MAX_FILAS_MUESTRA = 10;
const MAX_COLS_MUESTRA = 8;

/**
 * Lee un Excel (.xlsx/.xlsm/.xls/.xlsb) en el navegador y devuelve sus hojas CON
 * contenido (descarta las vacías) y una vista previa (primeras filas × columnas).
 * Usa las mismas opciones de lectura que el servidor para que los nombres de
 * hoja y los conteos coincidan 1:1 con lo que procesará el backend. Lanza si el
 * archivo es ilegible (el llamador lo trata como «sin hojas» y sigue el flujo
 * normal donde la IA elige).
 */
export async function leerHojasParaPreview(file: File): Promise<HojaPreview[]> {
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array", raw: true, cellDates: false });

  const hojas: HojaPreview[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    if (!ws) continue;
    const filas = XLSX.utils.sheet_to_json<CeldaCruda[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    if (filas.length === 0) continue; // hoja vacía: no se ofrece para elegir
    const totalColumnas = filas.reduce((max, f) => Math.max(max, f.length), 0);
    const muestra = filas.slice(0, MAX_FILAS_MUESTRA).map((f) => f.slice(0, MAX_COLS_MUESTRA));
    hojas.push({ nombre, totalFilas: filas.length, totalColumnas, muestra });
  }
  return hojas;
}

/** Índice de columna 0-based → letra estilo Excel (0→A, 25→Z, 26→AA). */
export function columnaLetra(indice: number): string {
  let s = "";
  let n = indice;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
