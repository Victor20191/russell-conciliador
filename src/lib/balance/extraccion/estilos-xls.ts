// ESTILOS de un libro Excel 97-2003 (.xls, BIFF8) celda por celda — puro, sin BD.
//
// SheetJS libre lee los valores de un .xls pero no su formato: a lo sumo el relleno, y pierde el
// índice XF de cada celda (ver la nota de `extraerCeldasNegritaBiffXls` en `ingesta.ts`). La
// muestra de un patrón aprendido de un cargue copia el original con su formato (5/Oct/2026,
// decisión del usuario: «fondos, letras, tamaños, título del reporte… todo igual»), así que aquí se
// recorre el stream `/Workbook` y se resuelve, para cada celda, su XF: fuente (nombre, tamaño,
// negrita, cursiva, subrayado, tachado, color), relleno, bordes y alineación, con los colores de la
// paleta del libro (registro PALETTE) o la de fábrica.
//
// Solo lectura de registros; nunca interpreta fórmulas ni valores (eso lo hace SheetJS).

/** Un borde: estilo con el nombre de OOXML/ExcelJS y color RRGGBB (sin color = automático). */
export type BordeXls = { estilo: string; color?: string };

export type EstiloCeldaXls = {
  fuente: {
    nombre?: string;
    tamano?: number;
    negrita?: boolean;
    cursiva?: boolean;
    subrayado?: "single" | "double" | "singleAccounting" | "doubleAccounting";
    tachado?: boolean;
    /** RRGGBB; ausente = automático. */
    color?: string;
  };
  /** Patrón con el nombre de OOXML/ExcelJS; ausente = sin relleno. */
  relleno?: { patron: string; color?: string; fondo?: string };
  bordes?: { left?: BordeXls; right?: BordeXls; top?: BordeXls; bottom?: BordeXls };
  alineacion?: { horizontal?: string; vertical?: string; ajustar?: boolean; rotacion?: number; sangria?: number };
};

export type EstilosXls = {
  /** Por hoja (orden de SheetNames): fila 0-based → columna 0-based → índice XF. */
  hojas: Array<Map<number, Map<number, number>>>;
  /** Estilo resuelto de cada XF del libro. */
  xf: EstiloCeldaXls[];
};

// Registros de celda con (fila, columna, XF) al inicio. Incluye BLANK (0x0201): una celda vacía
// con formato —la franja gris de un encabezado— también se copia.
const REGISTROS_CELDA_XF = new Set([0x0006, 0x00d6, 0x00fd, 0x0201, 0x0203, 0x0204, 0x0205, 0x027e]);

const u8 = (b: Uint8Array, o: number) => b[o] ?? 0;
const u16 = (b: Uint8Array, o: number) => u8(b, o) | (u8(b, o + 1) << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;
const hex = (r: number, g: number, b: number) => [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

/** Paleta de fábrica de BIFF8 (índices 8 a 63); 0-7 son los colores EGA fijos. */
const PALETA_FABRICA = [
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
  "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
  "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF",
  "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
  "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696",
  "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
];
const EGA = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF"];

const BORDES = ["", "thin", "medium", "dashed", "dotted", "thick", "double", "hair", "mediumDashed", "dashDot", "mediumDashDot", "dashDotDot", "mediumDashDotDot", "slantDashDot"];
const PATRONES = ["", "solid", "mediumGray", "darkGray", "lightGray", "darkHorizontal", "darkVertical", "darkDown", "darkUp", "darkGrid", "darkTrellis", "lightHorizontal", "lightVertical", "lightDown", "lightUp", "lightGrid", "lightTrellis", "gray125", "gray0625"];
const HORIZONTAL = [undefined, "left", "center", "right", "fill", "justify", "centerContinuous", "distributed"];
const VERTICAL = ["top", "middle", undefined, "justify", "distributed"]; // 2 = abajo, el de siempre
const SUBRAYADO: Record<number, EstiloCeldaXls["fuente"]["subrayado"]> = { 1: "single", 2: "double", 0x21: "singleAccounting", 0x22: "doubleAccounting" };

type FuenteCruda = { nombre?: string; tamano: number; negrita: boolean; cursiva: boolean; tachado: boolean; subrayado?: EstiloCeldaXls["fuente"]["subrayado"]; icv: number };

/** ShortXLUnicodeString: cch (1 byte), fHighByte (bit 0) y los caracteres. */
function cadenaCorta(b: Uint8Array, o: number, fin: number): string | undefined {
  if (o + 2 > fin) return undefined;
  const cch = u8(b, o);
  const ancho = (u8(b, o + 1) & 1) === 1 ? 2 : 1;
  let s = "";
  for (let i = 0; i < cch; i++) {
    const p = o + 2 + i * ancho;
    if (p + ancho > fin) break;
    s += String.fromCharCode(ancho === 2 ? u16(b, p) : u8(b, p));
  }
  return s || undefined;
}

/**
 * Estilos de las celdas de un stream BIFF8 ya desempaquetado (`/Workbook` o `/Book`). Exportada
 * para probar la decodificación con registros sintéticos.
 */
export function extraerEstilosBiffXls(workbook: Uint8Array): EstilosXls {
  const fuentes: Array<FuenteCruda | null> = [];
  const xfCrudos: Uint8Array[] = [];
  const paleta = [...PALETA_FABRICA];
  const indiceHojaPorOffset = new Map<number, number>();
  const hojas: EstilosXls["hojas"] = [];
  let siguienteHoja = 0;
  let hojaActual: number | null = null;

  const marcar = (fila: number, columna: number, xf: number) => {
    if (hojaActual == null) return;
    const porFila = hojas[hojaActual] ?? (hojas[hojaActual] = new Map());
    const columnas = porFila.get(fila) ?? new Map<number, number>();
    columnas.set(columna, xf);
    porFila.set(fila, columnas);
  };

  for (let offset = 0; offset + 4 <= workbook.length;) {
    const tipo = u16(workbook, offset);
    const largo = u16(workbook, offset + 2);
    const inicio = offset + 4;
    const fin = inicio + largo;
    if (fin > workbook.length) break;

    if (tipo === 0x0085 && largo >= 8) {
      indiceHojaPorOffset.set(u32(workbook, inicio), indiceHojaPorOffset.size);
    } else if (tipo === 0x0031 && largo >= 14) {
      // FONT: el índice 4 está reservado (el quinto registro es la fuente 5).
      if (fuentes.length === 4) fuentes.push(null);
      const grbit = u16(workbook, inicio + 2);
      fuentes.push({
        tamano: u16(workbook, inicio) / 20,
        cursiva: (grbit & 0x02) !== 0,
        tachado: (grbit & 0x08) !== 0,
        icv: u16(workbook, inicio + 4),
        negrita: u16(workbook, inicio + 6) >= 700,
        subrayado: SUBRAYADO[u8(workbook, inicio + 10)],
        nombre: cadenaCorta(workbook, inicio + 14, fin),
      });
    } else if (tipo === 0x0092 && largo >= 2) {
      // PALETTE: reemplaza los colores 8.. del libro.
      const cantidad = u16(workbook, inicio);
      for (let i = 0; i < cantidad && inicio + 2 + i * 4 + 3 <= fin; i++) {
        const p = inicio + 2 + i * 4;
        paleta[i] = hex(u8(workbook, p), u8(workbook, p + 1), u8(workbook, p + 2));
      }
    } else if (tipo === 0x00e0 && largo >= 20) {
      xfCrudos.push(workbook.slice(inicio, inicio + 20));
    } else if ((tipo === 0x0009 || tipo === 0x0209 || tipo === 0x0409 || tipo === 0x0809) && largo >= 4 && u16(workbook, inicio + 2) === 0x0010) {
      hojaActual = indiceHojaPorOffset.get(offset) ?? siguienteHoja;
      siguienteHoja = Math.max(siguienteHoja, hojaActual + 1);
    } else if (tipo === 0x000a) {
      hojaActual = null;
    } else if (hojaActual != null && REGISTROS_CELDA_XF.has(tipo) && largo >= 6) {
      marcar(u16(workbook, inicio), u16(workbook, inicio + 2), u16(workbook, inicio + 4));
    } else if (hojaActual != null && tipo === 0x00bd && largo >= 10) {
      // MULRK: fila, primera columna, pares (XF + RK), última columna.
      const fila = u16(workbook, inicio);
      const primera = u16(workbook, inicio + 2);
      const ultima = u16(workbook, fin - 2);
      for (let c = primera; c <= ultima; c++) {
        const p = inicio + 4 + (c - primera) * 6;
        if (p + 2 > fin - 2) break;
        marcar(fila, c, u16(workbook, p));
      }
    } else if (hojaActual != null && tipo === 0x00be && largo >= 8) {
      // MULBLANK: fila, primera columna, lista de XF, última columna.
      const fila = u16(workbook, inicio);
      const primera = u16(workbook, inicio + 2);
      const ultima = u16(workbook, fin - 2);
      for (let c = primera; c <= ultima; c++) {
        const p = inicio + 4 + (c - primera) * 2;
        if (p + 2 > fin - 2) break;
        marcar(fila, c, u16(workbook, p));
      }
    }
    offset = fin;
  }

  /** Índice de color BIFF → RRGGBB. 64/65/0x7FFF son los automáticos del sistema. */
  const color = (icv: number): string | undefined => {
    if (icv < 8) return EGA[icv];
    if (icv < 64) return paleta[icv - 8];
    return undefined;
  };

  const xf = xfCrudos.map((d): EstiloCeldaXls => {
    const f = fuentes[u16(d, 0)] ?? null;
    const fuente: EstiloCeldaXls["fuente"] = f
      ? {
        ...(f.nombre ? { nombre: f.nombre } : {}),
        ...(f.tamano > 0 ? { tamano: f.tamano } : {}),
        ...(f.negrita ? { negrita: true } : {}),
        ...(f.cursiva ? { cursiva: true } : {}),
        ...(f.tachado ? { tachado: true } : {}),
        ...(f.subrayado ? { subrayado: f.subrayado } : {}),
        ...(color(f.icv) && f.icv !== 0x7fff ? { color: color(f.icv) } : {}),
      }
      : {};
    const alin = u8(d, 6);
    const horizontal = HORIZONTAL[alin & 0x07];
    const vertical = VERTICAL[(alin >> 4) & 0x07];
    const ajustar = (alin & 0x08) !== 0;
    const rotacion = u8(d, 7);
    const sangria = u8(d, 8) & 0x0f;
    const alineacion = horizontal || vertical || ajustar || rotacion || sangria
      ? {
        ...(horizontal ? { horizontal } : {}),
        ...(vertical ? { vertical } : {}),
        ...(ajustar ? { ajustar } : {}),
        ...(rotacion ? { rotacion } : {}),
        ...(sangria ? { sangria } : {}),
      }
      : undefined;
    const b1 = u32(d, 10);
    const b2 = u32(d, 14);
    const lado = (estilo: number, icv: number): BordeXls | undefined => {
      const nombre = BORDES[estilo];
      if (!nombre) return undefined;
      const c = color(icv);
      return c ? { estilo: nombre, color: c } : { estilo: nombre };
    };
    const left = lado(b1 & 0x0f, (b1 >>> 16) & 0x7f);
    const right = lado((b1 >>> 4) & 0x0f, (b1 >>> 23) & 0x7f);
    const top = lado((b1 >>> 8) & 0x0f, b2 & 0x7f);
    const bottom = lado((b1 >>> 12) & 0x0f, (b2 >>> 7) & 0x7f);
    const bordes = left || right || top || bottom
      ? { ...(left ? { left } : {}), ...(right ? { right } : {}), ...(top ? { top } : {}), ...(bottom ? { bottom } : {}) }
      : undefined;
    const patron = PATRONES[(b2 >>> 26) & 0x3f];
    const colores = u16(d, 18);
    const fore = color(colores & 0x7f);
    const back = color((colores >>> 7) & 0x7f);
    const relleno = patron
      ? { patron, ...(fore ? { color: fore } : {}), ...(back && patron !== "solid" ? { fondo: back } : {}) }
      : undefined;
    return {
      fuente,
      ...(relleno ? { relleno } : {}),
      ...(bordes ? { bordes } : {}),
      ...(alineacion ? { alineacion } : {}),
    };
  });

  return { hojas, xf };
}

/** Estilos de un .xls desde sus bytes (contenedor CFB). `null` si el libro no se puede recorrer. */
export async function leerEstilosXls(bytes: Uint8Array): Promise<EstilosXls | null> {
  try {
    const XLSX = await import("xlsx");
    const cfb = XLSX.CFB.read(bytes, { type: "array" });
    const entrada = XLSX.CFB.find(cfb, "/Workbook") ?? XLSX.CFB.find(cfb, "/Book");
    const contenido = entrada?.content;
    return contenido ? extraerEstilosBiffXls(new Uint8Array(contenido)) : null;
  } catch {
    return null;
  }
}
