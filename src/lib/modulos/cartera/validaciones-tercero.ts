// VALIDACIONES DEL AUXILIAR POR TERCERO (Cartera y CxP) — puras, sin BD.
//
// Se recalculan al leer, desde el detalle promovido y el cruce por tercero; no se guardan y
// ninguna bloquea: son lo que el auditor tiene que mirar antes de cerrar.
//  - Edades vs total: el archivo trae las dos cosas y no coinciden (RF-CXP-11). Cuando manda
//    la columna (CxP) las edades deberían explicarla; cuando mandan las edades (Cartera) es la
//    columna la que se desvía. En ambos casos faltan baldes o alguien sumó mal.
//  - Documento repetido entre terceros: el MISMO documento por el MISMO valor bajo dos
//    terceros distintos. El número solo no basta: en CxP es la factura del proveedor, y dos
//    proveedores emiten su factura 25 sin que nada esté mal.
//  - Posible colisión de clave: dos identificaciones distintas del archivo que terminan en la
//    misma clave con nombres distintos (un NIT de 9 y una cédula de 10 cuyo último dígito
//    resulta ser un DV válido), o una cédula de 10 cuyo núcleo existe como otro tercero.
//  - Saldo contrario a la naturaleza en la contabilidad del tercero, por encima del umbral de
//    `/config/parametros`: un proveedor con saldo débito en 2205, un anticipo con saldo
//    crédito en 1330.
//  - Fecha de corte y días: la fecha a la que el archivo calculó sus días vencidos cuando no es
//    la del cargue, los documentos cuyos días no corresponden al corte, los que están en un
//    balde de edad que no es el suyo y los vencimientos imposibles.
import { claveNit } from "@/lib/nit";
import { CLAVE_SALDO_REPORTADO, CLAVE_SUMA_EDADES, leerEdades } from "./detalle-cartera";
import { esRotuloEdad, type RotuloEdad } from "./edades";
import { deducirFechaCorte, diasEntre, fechaISO, type CorteDeducido } from "./fecha-corte";
import { claveSinNit } from "./tercero-cartera";
import { nombreComparable, type ResumenCruceTerceroCartera } from "./cruce-tercero-cartera";

/** Filas que se listan por validación; el conteo sí es completo. */
const MAX_FILAS = 200;
/** Holgura en días entre lo que dice el archivo y lo que da el corte (el ERP puede contar el día). */
const TOLERANCIA_DIAS = 1;

export type FilaValidacionTercero = {
  filaNum: number;
  valor: number;
  imputable: boolean;
  nitCanonico: string | null;
  datos: Record<string, unknown>;
};

export type DiferenciaEdades = {
  filaNum: number;
  tercero: string;
  documento: string | null;
  total: number;
  sumaEdades: number;
  diferencia: number;
};

export type DocumentoRepetido = {
  documento: string;
  valor: number;
  terceros: { clave: string; nombre: string | null; filas: number[] }[];
};

export type PosibleColision = {
  /** Clave con la que se cruzan (o núcleo compartido). */
  clave: string;
  /** Las identificaciones del archivo que caen en ella, con su nombre. */
  identificaciones: { documento: string; nombre: string | null }[];
};

export type SaldoContrarioTercero = { clave: string; nombre: string | null; cuenta: string; valor: number };

export type DiferenciaDias = {
  filaNum: number;
  tercero: string;
  documento: string | null;
  vencimiento: string;
  diasArchivo: number;
  diasAlCorte: number;
};

export type EdadFueraDeRango = {
  filaNum: number;
  tercero: string;
  documento: string | null;
  rango: string;
  diasAlCorte: number;
};

export type VencimientoAtipico = { filaNum: number; tercero: string; documento: string | null; vencimiento: string };

type Lista<T> = { cantidad: number; filas: T[] };

export type ValidacionesTercero = {
  edadesVsTotal: Lista<DiferenciaEdades>;
  documentosRepetidos: { cantidad: number; grupos: DocumentoRepetido[] };
  posiblesColisiones: PosibleColision[];
  saldosContrarios: Lista<SaldoContrarioTercero>;
  /** Fecha de corte del cargue y, cuando es otra, la fecha a la que el archivo calculó sus días. */
  corte: { fecha: string | null; deducido: CorteDeducido | null };
  diasVsCorte: Lista<DiferenciaDias>;
  edadVsCorte: Lista<EdadFueraDeRango>;
  vencimientosAtipicos: Lista<VencimientoAtipico>;
  /** Alertas en total, para el contador de la pestaña. */
  total: number;
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

const nuevaLista = <T>(): Lista<T> => ({ cantidad: 0, filas: [] });
function agregar<T>(lista: Lista<T>, item: T): void {
  lista.cantidad += 1;
  if (lista.filas.length < MAX_FILAS) lista.filas.push(item);
}

/** Naturaleza propia de una cuenta por su clase PUC: activos, gastos y costos débito; pasivos, patrimonio e ingresos crédito. */
export function naturalezaDeCuenta(cuenta: string): "D" | "C" | null {
  const clase = cuenta.trim()[0];
  if (clase === "1" || clase === "5" || clase === "6" || clase === "7") return "D";
  if (clase === "2" || clase === "3" || clase === "4") return "C";
  return null;
}

/** ¿Alguna de las identificaciones lleva un nombre distinto del de las demás? */
function nombresDistintos(identificaciones: readonly { nombre: string | null }[]): boolean {
  const nombres = new Set(identificaciones.map((i) => nombreComparable(i.nombre)).filter((n): n is string => n != null));
  return nombres.size > 1;
}

/**
 * ¿Un documento con `dias` al corte está fuera del balde en que lo puso el archivo? Lo corriente
 * no puede estar vencido; un rango vencido tiene que contener sus días. Un rango que empieza en
 * 0 («0 - 30») admite también lo que aún no vence: varios ERP ponen ahí lo corriente.
 */
function fueraDelBalde(rotulo: RotuloEdad, dias: number): boolean {
  if (rotulo.clase === "corriente") return dias > TOLERANCIA_DIAS;
  if (rotulo.clase !== "vencido" || rotulo.desde == null) return false;
  if (rotulo.desde > 0 && dias < rotulo.desde - TOLERANCIA_DIAS) return true;
  return rotulo.hasta != null && dias > rotulo.hasta + TOLERANCIA_DIAS;
}

export function validarAuxiliarTercero(input: {
  filas: readonly FilaValidacionTercero[];
  cruce: ResumenCruceTerceroCartera | null;
  /** Naturaleza del módulo: con ella llegan firmados los valores del cruce. */
  naturaleza?: "D" | "C";
  /** Umbral de saldos contrarios de `/config/parametros`. */
  umbralNaturaleza: number;
  /** Fecha de corte del cargue (AAAA-MM-DD); sin ella no se evalúan los días. */
  fechaCorte?: string | null;
}): ValidacionesTercero {
  const imputables = input.filas.filter((f) => f.imputable);
  const terceroDe = (f: FilaValidacionTercero) => texto(f.datos.nombre) ?? f.nitCanonico ?? texto(f.datos.nit) ?? "—";

  // ===== Edades vs total =====
  const edades = nuevaLista<DiferenciaEdades>();
  for (const f of imputables) {
    const total = numero(f.datos[CLAVE_SALDO_REPORTADO]);
    const suma = numero(f.datos[CLAVE_SUMA_EDADES]);
    // Solo cuando vienen las dos: un documento por vencer sin balde no es una diferencia.
    if (total == null || total === 0 || suma == null || suma === 0) continue;
    const diferencia = redondear(total - suma);
    if (Math.abs(diferencia) <= Math.max(1, Math.abs(total) * 0.001)) continue;
    agregar(edades, { filaNum: f.filaNum, tercero: terceroDe(f), documento: texto(f.datos.documento), total, sumaEdades: suma, diferencia });
  }

  // ===== Documento repetido entre terceros =====
  const porDocumento = new Map<string, { documento: string; valor: number; terceros: Map<string, { clave: string; nombre: string | null; filas: number[] }> }>();
  for (const f of imputables) {
    const documento = texto(f.datos.documento);
    // Un número de documento lleva dígitos: «IMPSALDO» o «SALDO INICIAL» son rótulos del ERP.
    if (!documento || !/\d/.test(documento) || documento.replace(/[^A-Za-z0-9]/g, "").length < 3 || f.valor === 0) continue;
    const clave = f.nitCanonico ?? claveSinNit(texto(f.datos.nombre));
    if (!clave) continue;
    const tipo = texto(f.datos.tipoDocumento);
    const valor = redondear(f.valor);
    const llave = `${(tipo ?? "").toUpperCase()}|${documento.toUpperCase().replace(/\s+/g, "")}|${valor}`;
    const grupo = porDocumento.get(llave) ?? { documento: tipo ? `${tipo} ${documento}` : documento, valor, terceros: new Map() };
    const tercero = grupo.terceros.get(clave) ?? { clave, nombre: texto(f.datos.nombre), filas: [] };
    tercero.filas.push(f.filaNum);
    grupo.terceros.set(clave, tercero);
    porDocumento.set(llave, grupo);
  }
  const repetidos = [...porDocumento.values()]
    .filter((g) => g.terceros.size >= 2)
    .map((g) => ({ documento: g.documento, valor: g.valor, terceros: [...g.terceros.values()] }))
    .sort((a, b) => b.terceros.length - a.terceros.length || Math.abs(b.valor) - Math.abs(a.valor) || a.documento.localeCompare(b.documento));

  // ===== Posible colisión de clave =====
  // Identificaciones del archivo (solo dígitos) por clave, con el primer nombre que traen.
  const porClave = new Map<string, Map<string, string | null>>();
  for (const f of imputables) {
    if (!f.nitCanonico) continue;
    const documento = claveNit(String(f.datos.nit ?? "")) || f.nitCanonico;
    const documentos = porClave.get(f.nitCanonico) ?? new Map<string, string | null>();
    if (!documentos.get(documento)) documentos.set(documento, texto(f.datos.nombre));
    porClave.set(f.nitCanonico, documentos);
  }
  const colisiones: PosibleColision[] = [];
  for (const [clave, documentos] of porClave) {
    // Dos identificaciones que la clave canónica juntó.
    const identificaciones = [...documentos].map(([documento, nombre]) => ({ documento, nombre }));
    if (identificaciones.length > 1 && nombresDistintos(identificaciones)) {
      colisiones.push({ clave, identificaciones: identificaciones.sort((a, b) => b.documento.length - a.documento.length) });
      continue;
    }
    // Una cédula de 10 cuyo núcleo de 9 es otro tercero del archivo.
    if (!/^\d{10}$/.test(clave) || !porClave.has(clave.slice(0, 9))) continue;
    const delNucleo = [...porClave.get(clave.slice(0, 9))!].map(([documento, nombre]) => ({ documento, nombre }));
    const juntas = [...identificaciones, ...delNucleo];
    if (nombresDistintos(juntas)) colisiones.push({ clave: clave.slice(0, 9), identificaciones: juntas });
  }

  // ===== Saldo contrario a la naturaleza (lado contable del cruce) =====
  const contrarios: SaldoContrarioTercero[] = [];
  if (input.cruce && input.naturaleza) {
    for (const fila of input.cruce.filas) {
      for (const [cuenta, valor] of Object.entries(fila.contable.porCuenta)) {
        const natural = naturalezaDeCuenta(cuenta);
        if (!natural || valor === 0) continue;
        const contrario = natural === input.naturaleza ? valor < 0 : valor > 0;
        if (contrario && Math.abs(valor) > input.umbralNaturaleza) contrarios.push({ clave: fila.clave, nombre: fila.nombre, cuenta, valor });
      }
    }
    contrarios.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor) || a.clave.localeCompare(b.clave));
  }

  // ===== Fecha de corte y días =====
  const fechaCorte = input.fechaCorte ?? null;
  const deducido = fechaCorte
    ? deducirFechaCorte(imputables.map((f) => ({ vencimiento: f.datos.vencimiento, diasVencidos: f.datos.diasVencidos })))
    : null;
  const diasVsCorte = nuevaLista<DiferenciaDias>();
  const edadVsCorte = nuevaLista<EdadFueraDeRango>();
  const atipicos = nuevaLista<VencimientoAtipico>();
  if (fechaCorte) {
    const anioCorte = Number(fechaCorte.slice(0, 4));
    for (const f of imputables) {
      const vencimiento = fechaISO(f.datos.vencimiento);
      if (!vencimiento) continue;
      const documento = texto(f.datos.documento);
      const anio = Number(vencimiento.slice(0, 4));
      if (anio < 1990 || anio > anioCorte + 30) {
        agregar(atipicos, { filaNum: f.filaNum, tercero: terceroDe(f), documento, vencimiento });
        continue;
      }
      const diasAlCorte = diasEntre(vencimiento, fechaCorte);
      const diasArchivo = numero(f.datos.diasVencidos);
      if (diasArchivo != null && Number.isInteger(diasArchivo)) {
        // 0 días en lo que aún no vence es la forma de varios ERP de decir «corriente».
        const cuadra = Math.abs(diasArchivo - diasAlCorte) <= TOLERANCIA_DIAS || (diasArchivo === 0 && diasAlCorte <= 0);
        if (!cuadra) agregar(diasVsCorte, { filaNum: f.filaNum, tercero: terceroDe(f), documento, vencimiento, diasArchivo, diasAlCorte });
      }
      // Solo cuando el documento está en un único balde: repartido entre varios no hay un rango que exigir.
      const conImporte = Object.entries(leerEdades(f.datos) ?? {}).filter(([, v]) => v !== 0);
      if (conImporte.length === 1) {
        const rotulo = esRotuloEdad(conImporte[0][0]);
        if (rotulo && fueraDelBalde(rotulo, diasAlCorte)) {
          agregar(edadVsCorte, { filaNum: f.filaNum, tercero: terceroDe(f), documento, rango: conImporte[0][0], diasAlCorte });
        }
      }
    }
  }
  const corteDeducido = fechaCorte && deducido && deducido.fecha !== fechaCorte ? deducido : null;

  return {
    edadesVsTotal: edades,
    documentosRepetidos: { cantidad: repetidos.length, grupos: repetidos.slice(0, MAX_FILAS) },
    posiblesColisiones: colisiones,
    saldosContrarios: { cantidad: contrarios.length, filas: contrarios.slice(0, MAX_FILAS) },
    corte: { fecha: fechaCorte, deducido: corteDeducido },
    diasVsCorte,
    edadVsCorte,
    vencimientosAtipicos: atipicos,
    total: edades.cantidad + repetidos.length + colisiones.length + contrarios.length
      + (corteDeducido ? 1 : 0) + diasVsCorte.cantidad + edadVsCorte.cantidad + atipicos.cantidad,
  };
}
