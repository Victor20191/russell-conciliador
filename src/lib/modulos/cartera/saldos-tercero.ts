// Materialización del SALDO POR TERCERO de un cargue de cartera — pura, sin BD.
//
// Es un DERIVADO del detalle, no una segunda fuente: se reconstruye entero desde las filas
// promovidas. Existe por dos razones concretas:
//
//  1. El cruce por NIT y la pestaña de terceros necesitan el saldo agregado por tercero, y
//     reagregarlo abriendo el JSON de cada fila en cada render no escala (un archivo real
//     de SAP trae 26.279 filas y 4.424 terceros).
//  2. Un período puede componerse de dos archivos —el resumen por edades y el detalle por
//     documento—. Aquí conviven como filas de distinto `origen` y compararlos por tercero
//     pasa a ser un JOIN, que es justamente el control que pidió la firma.
//
// Los tres orígenes:
//   `imputable` — el nivel que SUMA (una fila por tercero de un reporte por tercero).
//   `agregado`  — Σ de los documentos de un tercero, cuando el nivel que suma es documento.
//   `declarado` — lo que el propio archivo dice que vale el tercero: la cabecera de un
//                 reporte jerárquico, o un archivo cargado como control. Nunca suma.
//
// Contrastar `declarado` contra `imputable`/`agregado` certifica la lectura: en los
// archivos reales de SAP y SIESA cuadra al centavo.
import { claveSinNit, normalizarTerceroCartera, type OrigenCartera } from "./tercero-cartera";

export type NivelCartera = "tercero" | "documento";
export type OrigenSaldo = "imputable" | "agregado" | "declarado";

/** Una fila del detalle, tal como queda tras el transform y la promoción. */
export type FilaCarteraDetalle = {
  filaNum: number;
  valor: number;
  /** `true` si la fila SUMA al total del período. */
  imputable: boolean;
  nivel: NivelCartera;
  /** Saldo que la fila DECLARA para todo su tercero (cabecera de un reporte jerárquico). */
  saldoDeclarado?: number | null;
  cuentaCliente?: string | null;
  origenCartera?: OrigenCartera | null;
  /** Importe por balde, con los rótulos literales del ERP. */
  edades?: Record<string, number> | null;
  /** Lo que declaraba la columna de total, si difiere de la Σ de los baldes. */
  saldoReportado?: number | null;
  sumaEdades?: number | null;
  /** Días vencidos de la fila, para quedarse con el máximo del tercero. */
  diasVencidos?: number | null;
  nit?: unknown;
  dv?: unknown;
  nombre?: unknown;
  sucursal?: unknown;
};

export type SaldoTercero = {
  loteId: string;
  nivel: NivelCartera;
  origen: OrigenSaldo;
  cuentaCliente: string;
  origenCartera: string;
  claveTercero: string;
  nitOriginal: string | null;
  dv: string | null;
  sucursal: string | null;
  nombre: string | null;
  saldo: number;
  saldoReportado: number | null;
  sumaEdades: number | null;
  edades: Record<string, number> | null;
  documentos: number;
  diasMax: number | null;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/** Suma dos mapas de baldes conservando los rótulos del ERP. */
function sumarEdades(
  acumulado: Record<string, number> | null,
  nuevas: Record<string, number> | null | undefined,
): Record<string, number> | null {
  if (!nuevas) return acumulado;
  const salida = { ...(acumulado ?? {}) };
  for (const [etiqueta, valor] of Object.entries(nuevas)) {
    salida[etiqueta] = redondear((salida[etiqueta] ?? 0) + valor);
  }
  return salida;
}

/**
 * Clave e identidad del tercero de una fila. Una fila sin identificador numérico no se
 * descarta: se agrupa por su NOMBRE con el prefijo `~`, para que «CONSUMIDOR FINAL» o
 * «Genérico» aparezcan en la conciliación y se puedan emparejar a mano.
 */
function identidadDe(fila: FilaCarteraDetalle) {
  const t = normalizarTerceroCartera({ nit: fila.nit, dv: fila.dv, nombre: fila.nombre, sucursal: fila.sucursal });
  const clave = t.claveCanonica ?? claveSinNit(t.nombre);
  return { clave, tercero: t };
}

type Acumulador = SaldoTercero & { _diasMax: number | null };

export type ResultadoMaterializacion = {
  saldos: SaldoTercero[];
  /**
   * Lo que NO se pudo atribuir a ningún tercero: filas sin identificador ni nombre. Debe
   * ser cero. Se devuelve —en vez de descartarse— porque una materialización que pierde
   * plata en silencio es exactamente el defecto que este módulo existe para evitar: si el
   * archivo trae el identificador en una columna compartida y todavía no se sabe leer, el
   * cargue tiene que avisarlo, no mostrar un total más bajo.
   */
  sinAtribuir: { filas: number; monto: number };
};

/**
 * Agrega las filas de UN archivo en saldos por tercero. `loteId` identifica el archivo,
 * porque un período puede componerse de varios y el control los compara entre sí.
 *
 * `nivelImputable` es el nivel declarado del cargue: las filas de ESE nivel producen
 * `imputable` (si el nivel es tercero) o `agregado` (si es documento); las cabeceras y las
 * filas del otro nivel producen `declarado`.
 */
export function materializarSaldosTercero(
  filas: readonly FilaCarteraDetalle[],
  opciones: { loteId: string; nivelImputable: NivelCartera },
): ResultadoMaterializacion {
  const { loteId, nivelImputable } = opciones;
  const acumuladores = new Map<string, Acumulador>();
  const sinAtribuir = { filas: 0, monto: 0 };

  const acumular = (
    fila: FilaCarteraDetalle,
    origen: OrigenSaldo,
    monto: number,
    cuentaDocumentos: number,
  ) => {
    const { clave, tercero } = identidadDe(fila);
    if (!clave) {
      // Ni identificador ni nombre. Solo se contabiliza como pérdida lo que IMPUTA: una
      // fila de control sin tercero no altera ningún total.
      if (origen !== "declarado") {
        sinAtribuir.filas += 1;
        sinAtribuir.monto = redondear(sinAtribuir.monto + monto);
      }
      return;
    }
    const cuentaCliente = (fila.cuentaCliente ?? "").trim();
    const origenCartera = fila.origenCartera ?? "";
    const llave = `${fila.nivel}${origen}${cuentaCliente}${origenCartera}${clave}`;

    let acc = acumuladores.get(llave);
    if (!acc) {
      acc = {
        loteId,
        nivel: fila.nivel,
        origen,
        cuentaCliente,
        origenCartera,
        claveTercero: clave,
        nitOriginal: tercero.original,
        dv: tercero.dv,
        sucursal: tercero.sucursal,
        nombre: tercero.nombre,
        saldo: 0,
        saldoReportado: null,
        sumaEdades: null,
        edades: null,
        documentos: 0,
        diasMax: null,
        _diasMax: null,
      };
      acumuladores.set(llave, acc);
    }
    acc.saldo = redondear(acc.saldo + monto);
    acc.documentos += cuentaDocumentos;
    // El primer nombre no vacío manda: los reportes jerárquicos lo traen en la cabecera y
    // lo dejan en blanco en los documentos.
    if (!acc.nombre && tercero.nombre) acc.nombre = tercero.nombre;
    if (!acc.dv && tercero.dv) acc.dv = tercero.dv;
    if (!acc.sucursal && tercero.sucursal) acc.sucursal = tercero.sucursal;
    acc.edades = sumarEdades(acc.edades, fila.edades);
    if (fila.sumaEdades != null) acc.sumaEdades = redondear((acc.sumaEdades ?? 0) + fila.sumaEdades);
    if (fila.saldoReportado != null) acc.saldoReportado = redondear((acc.saldoReportado ?? 0) + fila.saldoReportado);
    if (fila.diasVencidos != null && Number.isFinite(fila.diasVencidos)) {
      acc._diasMax = Math.max(acc._diasMax ?? Number.NEGATIVE_INFINITY, fila.diasVencidos);
    }
  };

  for (const fila of filas) {
    // La cabecera de un tercero declara el saldo de todo su bloque: nunca imputa, pero es
    // la contraparte del control.
    if (fila.saldoDeclarado != null) {
      acumular({ ...fila, nivel: "tercero" }, "declarado", fila.saldoDeclarado, 0);
      // Una cabecera no imputa. Un DOCUMENTO que además trae el saldo de su proveedor (SIIGO lo
      // imprime en la primera fila del bloque) sí: declara el bloque y suma lo suyo.
      if (!fila.imputable) continue;
    }
    if (!fila.imputable) {
      // Filas del nivel de CONTROL (el archivo que no suma en este período).
      if (fila.nivel !== nivelImputable && fila.valor !== 0) acumular(fila, "declarado", fila.valor, 0);
      continue;
    }
    const origen: OrigenSaldo = fila.nivel === "documento" ? "agregado" : "imputable";
    acumular(fila, origen, fila.valor, fila.nivel === "documento" ? 1 : 0);
  }

  const saldos = [...acumuladores.values()]
    .map(({ _diasMax, ...resto }) => ({ ...resto, diasMax: _diasMax === null ? null : _diasMax }))
    .sort((a, b) =>
      a.origen.localeCompare(b.origen)
      || a.cuentaCliente.localeCompare(b.cuentaCliente)
      || a.claveTercero.localeCompare(b.claveTercero));
  return { saldos, sinAtribuir };
}

export type EstadoControlTercero = "cuadra" | "descuadre" | "solo_declarado" | "solo_calculado";

export type FilaControlTercero = {
  claveTercero: string;
  nombre: string | null;
  declarado: number;
  calculado: number;
  diferencia: number;
  estado: EstadoControlTercero;
};

export type ResumenControlTercero = {
  filas: FilaControlTercero[];
  totales: { declarado: number; calculado: number; diferencia: number };
  /** Cuántos terceros NO cuadran (incluye los que solo están en un lado). */
  conDiferencia: number;
};

/** Tolerancia del control: un peso, como el resto de los controles del motor. */
const TOLERANCIA = 1;

/**
 * Compara, tercero por tercero, lo que el archivo DECLARA contra lo que se calculó de su
 * detalle. Es el control que responde «¿leí bien este archivo?» y, cuando el período trae
 * dos archivos, «¿coinciden el resumen por edades y el detalle por documento?».
 */
export function compararSaldosTercero(saldos: readonly SaldoTercero[]): ResumenControlTercero {
  const declarados = new Map<string, { monto: number; nombre: string | null }>();
  const calculados = new Map<string, { monto: number; nombre: string | null }>();

  for (const s of saldos) {
    const destino = s.origen === "declarado" ? declarados : calculados;
    const previo = destino.get(s.claveTercero);
    destino.set(s.claveTercero, {
      monto: redondear((previo?.monto ?? 0) + s.saldo),
      nombre: previo?.nombre ?? s.nombre,
    });
  }

  const claves = [...new Set([...declarados.keys(), ...calculados.keys()])].sort();
  const filas: FilaControlTercero[] = claves.map((clave) => {
    const d = declarados.get(clave);
    const c = calculados.get(clave);
    const declarado = d?.monto ?? 0;
    const calculado = c?.monto ?? 0;
    const diferencia = redondear(declarado - calculado);
    const estado: EstadoControlTercero = !d
      ? "solo_calculado"
      : !c
        ? "solo_declarado"
        : Math.abs(diferencia) <= TOLERANCIA
          ? "cuadra"
          : "descuadre";
    return { claveTercero: clave, nombre: d?.nombre ?? c?.nombre ?? null, declarado, calculado, diferencia, estado };
  });

  const totales = filas.reduce(
    (acc, f) => ({
      declarado: redondear(acc.declarado + f.declarado),
      calculado: redondear(acc.calculado + f.calculado),
      diferencia: 0,
    }),
    { declarado: 0, calculado: 0, diferencia: 0 },
  );
  totales.diferencia = redondear(totales.declarado - totales.calculado);

  return { filas, totales, conDiferencia: filas.filter((f) => f.estado !== "cuadra").length };
}
