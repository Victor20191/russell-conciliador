// CONTROLES SEGÚN EL TIPO DE FORMATO (Cartera y CxP) — puros, sin BD.
//
// Cada tipo de archivo se valida distinto (`tipo-formato.ts`):
//  - por documento          → Σ de los documentos de cada cliente contra el total del cliente;
//  - por edades             → Σ de las edades contra el total de cada fila;
//  - por documento y edades → los dos.
// Si el archivo no trae con qué comparar, el control queda «no validado» y lo dice: no se da por
// bueno lo que no se pudo revisar. Ninguno bloquea. Se calculan igual en el borrador (en vivo) y
// en el dato cargado (con el detalle, donde las cabeceras y los totales por cliente se conservan).
import { CLAVE_SALDO_REPORTADO, CLAVE_SUMA_EDADES, filaCarteraDesdeDetalle, leerEdades } from "./detalle-cartera";
import {
  compararSaldosTercero,
  materializarSaldosTercero,
  type FilaControlTercero,
  type NivelCartera,
} from "./saldos-tercero";
import {
  tipoConDocumento,
  tipoConEdades,
  TIPOS_FORMATO_CARTERA,
  type FormatoArchivoCartera,
  type TipoFormatoCartera,
} from "./tipo-formato";

/** Filas que se listan por control; los conteos sí son completos. */
const MAX_FILAS = 200;

export type EstadoControlFormato = "cuadra" | "descuadre" | "no_validado";

export type DiferenciaEdadesFila = {
  filaNum: number;
  tercero: string;
  documento: string | null;
  total: number;
  sumaEdades: number;
  diferencia: number;
};

export type ControlDocumentosCliente = {
  estado: EstadoControlFormato;
  motivo: string | null;
  /** Clientes con total declarado y detalle, comparados. */
  comparados: number;
  /** Clientes que no cuadran (o con total y sin documentos). */
  diferencias: { cantidad: number; filas: FilaControlTercero[] };
  /** Clientes con documentos a los que el archivo no les imprimió total: solo se informa. */
  sinTotal: number;
  totales: { declarado: number; calculado: number; diferencia: number };
};

export type ControlEdadesTotal = {
  estado: EstadoControlFormato;
  motivo: string | null;
  /** Filas que traen a la vez edades y total. */
  comparadas: number;
  diferencias: { cantidad: number; filas: DiferenciaEdadesFila[] };
};

export type ControlesFormatoCartera = {
  /** Tipos de los archivos del cargue, sin repetir, en el orden del catálogo. */
  tipos: TipoFormatoCartera[];
  /** true si algún tipo se dedujo (versión o cargue anterior a la declaración). */
  deducido: boolean;
  /** null = el tipo no lo pide. */
  documentosVsCliente: ControlDocumentosCliente | null;
  edadesVsTotal: ControlEdadesTotal | null;
  /** Diferencias a revisar (los «no validado» no cuentan como alerta). */
  alertas: number;
};

export type FilaControlFormato = {
  filaNum: number;
  valor: number;
  /** ¿La fila suma al total del período? Las cabeceras y los totales por cliente no. */
  imputable: boolean;
  datos: Record<string, unknown>;
  nivel?: string | null;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

const numero = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const texto = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s || null;
};

/**
 * La fila trae total y edades y no coinciden (fuera de la holgura: un peso o el 0,1 %). null si
 * cuadra o si le falta una de las dos cifras: un documento por vencer sin balde no es diferencia.
 */
export function diferenciaEdadesDeFila(fila: { filaNum: number; datos: Record<string, unknown>; nitCanonico?: string | null }): DiferenciaEdadesFila | null {
  const total = numero(fila.datos[CLAVE_SALDO_REPORTADO]);
  const suma = numero(fila.datos[CLAVE_SUMA_EDADES]);
  if (total == null || total === 0 || suma == null || suma === 0) return null;
  const diferencia = redondear(total - suma);
  if (Math.abs(diferencia) <= Math.max(1, Math.abs(total) * 0.001)) return null;
  return {
    filaNum: fila.filaNum,
    tercero: texto(fila.datos.nombre) ?? fila.nitCanonico ?? texto(fila.datos.nit) ?? "—",
    documento: texto(fila.datos.documento),
    total,
    sumaEdades: suma,
    diferencia,
  };
}

/** ¿La fila trae las dos cifras que compara el control de edades? */
const comparableEdades = (datos: Record<string, unknown>): boolean => {
  const total = numero(datos[CLAVE_SALDO_REPORTADO]);
  const suma = numero(datos[CLAVE_SUMA_EDADES]);
  return total != null && total !== 0 && suma != null && suma !== 0;
};

/** Nivel de las filas de un cargue: el que traen guardado; si no dicen nada, tercero. */
export function nivelDeFilas(filas: readonly Pick<FilaControlFormato, "nivel" | "imputable">[]): NivelCartera {
  const imputable = filas.find((f) => f.imputable && (f.nivel === "tercero" || f.nivel === "documento"));
  return imputable?.nivel === "documento" ? "documento" : "tercero";
}

/**
 * Tipo de un cargue sin formatos declarados (anteriores a la declaración): por su nivel y por si
 * alguna fila trae edades.
 */
export function tipoFormatoDeFilas(filas: readonly FilaControlFormato[], nivel: NivelCartera): TipoFormatoCartera {
  if (nivel === "tercero") return "edades";
  return filas.some((f) => f.imputable && leerEdades(f.datos) != null) ? "documento_edades" : "documento";
}

export function controlesFormatoCartera(input: {
  filas: readonly FilaControlFormato[];
  nivelImputable: NivelCartera;
  /** Formatos de los archivos del cargue; null = cargue anterior a la declaración. */
  formatos: readonly Pick<FormatoArchivoCartera, "tipo" | "declarado" | "conColumnaTotal">[] | null;
  /** Tipo con que se lee un cargue sin formatos (deducido de su spec o de sus filas). */
  tipoDeducido: TipoFormatoCartera;
}): ControlesFormatoCartera {
  const { filas, nivelImputable, formatos } = input;
  const conocidos = formatos != null && formatos.length > 0 ? formatos : null;
  const presentes = new Set(conocidos ? conocidos.map((f) => f.tipo) : [input.tipoDeducido]);
  const tipos = TIPOS_FORMATO_CARTERA.filter((t) => presentes.has(t));
  const deducido = !conocidos || conocidos.some((f) => !f.declarado);

  // ===== Σ de los documentos contra el total del cliente =====
  let documentosVsCliente: ControlDocumentosCliente | null = null;
  if (tipos.some(tipoConDocumento)) {
    const { saldos } = materializarSaldosTercero(
      filas.map((f) => filaCarteraDesdeDetalle(
        { filaNum: f.filaNum, valor: f.valor, datos: f.datos, nivel: f.nivel ?? null, imputable: f.imputable },
        nivelImputable,
      )),
      { loteId: "", nivelImputable },
    );
    const hayDeclarado = saldos.some((s) => s.origen === "declarado");
    if (hayDeclarado) {
      const control = compararSaldosTercero(saldos);
      // Un total en cero sin documentos no es una diferencia.
      const conDiferencia = control.filas.filter((f) => f.estado === "descuadre" || (f.estado === "solo_declarado" && Math.abs(f.diferencia) > 1));
      documentosVsCliente = {
        estado: conDiferencia.length > 0 ? "descuadre" : "cuadra",
        motivo: null,
        comparados: control.filas.filter((f) => f.estado === "cuadra" || f.estado === "descuadre").length,
        diferencias: {
          cantidad: conDiferencia.length,
          filas: [...conDiferencia].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).slice(0, MAX_FILAS),
        },
        sinTotal: control.filas.filter((f) => f.estado === "solo_calculado" && f.calculado !== 0).length,
        totales: control.totales,
      };
    } else if (conocidos) {
      documentosVsCliente = {
        estado: "no_validado",
        motivo: "El archivo no trae el total de cada cliente (ni un renglón por cliente, ni una fila «Total», ni una columna con su saldo).",
        comparados: 0,
        diferencias: { cantidad: 0, filas: [] },
        sinTotal: 0,
        totales: { declarado: 0, calculado: 0, diferencia: 0 },
      };
    }
  }

  // ===== Σ de las edades contra el total de la fila =====
  let edadesVsTotal: ControlEdadesTotal | null = null;
  if (tipos.some(tipoConEdades)) {
    const imputables = filas.filter((f) => f.imputable);
    const comparadas = imputables.filter((f) => comparableEdades(f.datos)).length;
    const diferencias = { cantidad: 0, filas: [] as DiferenciaEdadesFila[] };
    for (const f of imputables) {
      const d = diferenciaEdadesDeFila(f);
      if (!d) continue;
      diferencias.cantidad += 1;
      if (diferencias.filas.length < MAX_FILAS) diferencias.filas.push(d);
    }
    const conColumnaTotal = conocidos
      ? conocidos.some((f) => tipoConEdades(f.tipo) && f.conColumnaTotal)
      : comparadas > 0;
    if (!conColumnaTotal) {
      edadesVsTotal = conocidos
        ? { estado: "no_validado", motivo: "El archivo no trae una columna de total con que comparar la suma de las edades.", comparadas: 0, diferencias }
        : null;
    } else if (comparadas === 0) {
      edadesVsTotal = { estado: "no_validado", motivo: "Ninguna fila trae a la vez sus edades y su total.", comparadas: 0, diferencias };
    } else {
      edadesVsTotal = { estado: diferencias.cantidad > 0 ? "descuadre" : "cuadra", motivo: null, comparadas, diferencias };
    }
  }

  return {
    tipos,
    deducido,
    documentosVsCliente,
    edadesVsTotal,
    alertas: (documentosVsCliente?.diferencias.cantidad ?? 0) + (edadesVsTotal?.diferencias.cantidad ?? 0),
  };
}
