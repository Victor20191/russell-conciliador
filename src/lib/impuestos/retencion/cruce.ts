import { nivelDiferencia, type NivelDiferencia } from "@/lib/balance/umbrales-alertas";
import { claveCuentasMapeo, cuentasDeMapeo, esTerceroDian, pareceNombreDian, renglonesDeFila, type FilaMapeoDian, type TerceroDian } from "../mapeo-dian";
import { impuestoPorClave, RETENCION, type ClaveImpuesto, type ImpuestoDian } from "../impuestos-dian";
import type { EleccionBalanceVista } from "@/lib/modulos/compuerta-cruce";
import type { PeriodoRevision } from "./periodos-revision";

/**
 * Cruce contable de una revisión de Impuestos · DIAN (puro). Lo de abajo describe Retención en la
 * fuente; IVA usa el mismo cálculo con su descriptor (`impuestos-dian.ts`): secciones del 300
 * (generado, descontable, retención de IVA y, al final, ingresos), el lado contable con el signo de la
 * naturaleza del plan Russell (crédito → −saldo, débito → +saldo), los ingresos por el saldo de la
 * cuenta (sin terceros, sin DIAN ni saldo inicial), filas de varias cuentas (el renglón 40) y el signo
 * «−» del mapeo restando en el subtotal (42 y 80), no en lo declarado. IVA no tiene total general.
 *
 * Por cada cuenta Russell del mapeo, lo DECLARADO (la suma de sus conceptos en los 350 vigentes
 * hasta el corte, cada uno con su signo: el 133 resta) contra la CONTABILIDAD (el saldo final al
 * corte de las cuentas del cliente homologadas a ella, en positivo porque son pasivos). En las
 * cuentas marcadas, el saldo de los terceros DIAN (los pagos registrados en la misma cuenta) se
 * muestra tachado y no suma. Los conceptos que comparten cuenta van en una sola fila; uno sin
 * cuenta (el 129) va en su propia fila y solo afecta lo declarado. Subtotales: 130 (renta),
 * 134 (IVA), 135 (timbre) y 136 (total).
 *
 * Con «Restar terceros con saldo inicial» cada tercero no DIAN suma su saldo final menos su saldo
 * inicial (lo del año). Solo aplica si el balance empieza el 1 de enero del año revisado: en otro
 * balance el saldo inicial trae retenciones del mismo año y restarlo quitaría lo declarado.
 */

/** «renta», «iva» y «timbre» en Retención; «generado», «descontable», «reteiva» e «ingresos» en IVA. */
export type GrupoCruce = string;

export const ETIQUETA_GRUPO: Readonly<Record<"renta" | "iva" | "timbre", string>> = {
  renta: "Retenciones a título de renta (130)",
  iva: "Retenciones a título de IVA (134)",
  timbre: "Retención de timbre nacional (135)",
};

export function grupoDeSeccion(seccion: string): "renta" | "iva" | "timbre" {
  const s = seccion.toLowerCase();
  if (s.includes("iva")) return "iva";
  if (s.includes("timbre")) return "timbre";
  return "renta";
}

/** Una fila del detalle por tercero del balance del corte (ya deduplicada). */
export type FilaTerceroContable = {
  cuentaCliente: string;
  nombreCuenta: string;
  cuentaRussell: string;
  nit: string | null;
  nombreTercero: string | null;
  saldoInicial: number;
  saldoFinal: number;
};

export type TerceroCruce = {
  nit: string | null;
  nombre: string | null;
  /** Saldo final presentado en positivo (pasivo). */
  saldo: number;
  saldoInicial: number;
  esDian: boolean;
  /** Tachado: es la DIAN y la cuenta la resta; no suma al lado contable. */
  restado: boolean;
  /** Sin NIT pero con nombre de la DIAN: se avisa, no se resta solo. */
  posibleDian: boolean;
  /** Saldo inicial que se le restó (0 si no se le restó). Las copias congeladas antiguas no lo traen. */
  saldoInicialRestado?: number;
};

/** Una cuenta del cliente. `porCuenta`: se tomó el saldo de la cuenta (ingresos de IVA), sin terceros. */
export type CuentaClienteCruce = { cuenta: string; nombre: string; saldo: number; terceros: TerceroCruce[]; porCuenta?: boolean };

export type ConceptoCruce = { concepto: string; etiqueta: string; renglones: number[]; signo: "+" | "-"; declarado: number };

export type MarcaCruceRetencion = {
  numero: number;
  nota: string;
  referenciaAnexo: string | null;
  /** Diferencia de la fila cuando se marcó. */
  diferencia: number;
  marcadoPor: string | null;
  marcadoEn: string;
};

export type FilaCruce = {
  /** Llave estable de la fila (la de la marca): la cuenta Russell, varias unidas con «+», o `sin_cuenta:<concepto>`. */
  clave: string;
  grupo: GrupoCruce;
  /** La cuenta Russell de la fila; con varias, unidas con «+» (el renglón 40 del 300). */
  cuentaRussell: string | null;
  /** Las cuentas Russell de la fila, una por una. Las copias antiguas no lo traen. */
  cuentasRussell?: string[];
  /** −1 si la fila resta en el subtotal de su sección (42 y 80 del 300). Las copias antiguas no lo traen. */
  signoSubtotal?: 1 | -1;
  nombreCuenta: string | null;
  conceptos: ConceptoCruce[];
  declarado: number;
  contable: number;
  diferencia: number;
  nivel: NivelDiferencia;
  requiereMarca: boolean;
  restaDian: boolean;
  /** Σ saldo de los terceros DIAN tachados (lo que se restó). */
  dianRestado: number;
  cuentasCliente: CuentaClienteCruce[];
  saldoInicial: { terceros: number; monto: number; restado?: boolean } | null;
  posiblesDian: string[];
  marca: (MarcaCruceRetencion & { vigente: boolean }) | null;
};

export type SubtotalCruce = { declarado: number; contable: number; diferencia: number };

/** El saldo inicial de los terceros no DIAN en todo el cruce. Un tercero puede estar en varias cuentas. */
export type ResumenSaldoInicial = { terceros: number; cuentas: number; monto: number; restado: boolean };

export type ResultadoCruce = {
  /** El impuesto del cruce. Las copias antiguas no lo traen: son de Retención en la fuente. */
  impuesto?: ClaveImpuesto;
  grupos: { grupo: GrupoCruce; etiqueta: string; filas: FilaCruce[]; subtotal: SubtotalCruce }[];
  total: SubtotalCruce;
  /** Lo que el botón ofrece y resta: null sin saldos iniciales o sin balance desde enero. Las copias antiguas no lo traen. */
  saldoInicial?: ResumenSaldoInicial | null;
  /** Cuentas del cliente homologadas a una cuenta Russell de 2365/2367 que no está en el mapeo (p. ej. 236599, pagos). */
  fueraDelMapeo: { cuentaRussell: string; cuentas: string[]; saldo: number }[];
  /** Cuentas del cliente en 2365/2367 homologadas fuera de esos grupos: el cruce no las lee. Las copias antiguas no lo traen. */
  fueraDeRetencion?: CuentaFueraDeRetencion[];
  /** Filas que exigen marca y no la tienen (o la tienen desactualizada). */
  pendientesMarca: number;
  /** Marca de lo restado como saldo inicial (se pone en Novedades; guarda el total). Las copias antiguas no la traen. */
  marcaSaldoInicial?: (MarcaCruceRetencion & { vigente: boolean }) | null;
};

/** Llave de la marca de lo restado como saldo inicial (dimensión `control`, una por revisión). */
export const CLAVE_MARCA_SALDO_INICIAL = "saldo_inicial";

/** Un tercero en una cuenta del cliente al que se le restó el saldo inicial, con los signos del cruce (pasivo en positivo). */
export type FilaSaldoInicialRestado = {
  nit: string | null;
  nombre: string | null;
  cuentaCliente: string;
  nombreCuenta: string;
  cuentaRussell: string | null;
  saldoInicial: number;
  saldoFinal: number;
  restado: number;
};

/** Lo restado como saldo inicial, para analizarlo y documentarlo en Novedades. */
export type DetalleSaldoInicialRestado = {
  filas: FilaSaldoInicialRestado[];
  terceros: number;
  cuentas: number;
  total: number;
  marca: (MarcaCruceRetencion & { vigente: boolean }) | null;
};

/** Una cuenta del cliente en 2365/2367 que quedó fuera de retención, con el saldo en positivo como el resto del cruce. */
export type CuentaFueraDeRetencion = { cuenta: string; nombre: string | null; cuentaRussell: string | null; nombreRussell: string | null; saldo: number };

/** Fila del balance de una cuenta del cliente en 2365/2367; `cuentaRussell` en null si no está homologada. */
export type FilaFueraDeRetencion = { cuentaCliente: string; nombreCuenta: string | null; cuentaRussell: string | null; saldoFinal: number };

/** Una cuenta del cliente leída del balance por cuenta (sin terceros): los ingresos del 300. */
export type FilaCuentaContable = { cuentaCliente: string; nombreCuenta: string; cuentaRussell: string; saldoInicial: number; saldoFinal: number };

export type EntradaCruce = {
  /** Sin impuesto es Retención en la fuente. */
  impuesto?: ClaveImpuesto;
  /** Naturaleza de las cuentas Russell (D | C), para los impuestos que siguen el signo del plan (IVA). */
  naturalezas?: ReadonlyMap<string, "D" | "C">;
  /** Las cuentas que se leen por cuenta, sin terceros (los ingresos de IVA). */
  filasContablesCuenta?: readonly FilaCuentaContable[];
  periodos: readonly PeriodoRevision[];
  mapeo: readonly FilaMapeoDian[];
  /** Cuentas Russell que NO restan el tercero DIAN. */
  sinRestaDian: ReadonlySet<string>;
  tercerosDian: readonly Pick<TerceroDian, "nit">[];
  nombresRussell: ReadonlyMap<string, string>;
  filasContables: readonly FilaTerceroContable[];
  /** Filas de las cuentas del cliente en 2365/2367, para avisar las homologadas fuera de retención. */
  filasFueraDeRetencion?: readonly FilaFueraDeRetencion[];
  /** Nombre de las cuentas Russell donde quedaron homologadas. */
  nombresFueraDeRetencion?: ReadonlyMap<string, string>;
  /** El balance del corte empieza el 1 de enero del año revisado (si no, no se mide el arrastre). */
  inicioEnero: boolean;
  /** Restar el saldo inicial de los NITs que lo traen (el servidor lo pide siempre); sin `inicioEnero` no resta nada. */
  restarSaldoInicial: boolean;
  umbral: number;
  marcas: readonly (MarcaCruceRetencion & { clave: string })[];
};

const centavos = (n: number) => Math.round(n * 100);
const sumar = (valores: readonly number[]) => valores.reduce((s, v) => s + centavos(v), 0) / 100;

/**
 * Las cuentas del cliente en 2365/2367 homologadas a una cuenta Russell de otro grupo, o sin homologar:
 * el cruce lee por cuenta Russell, así que su saldo no llega a él. Una cuenta en cero no se avisa, porque
 * no le falta nada al cruce. Es informativo: no impide cerrar.
 */
export function cuentasFueraDeRetencion(
  filas: readonly FilaFueraDeRetencion[],
  nombres: ReadonlyMap<string, string> = new Map(),
  prefijos: readonly string[] = prefijosRetencion(),
): CuentaFueraDeRetencion[] {
  const esRetencion = (c: string) => prefijos.some((p) => c.startsWith(p));
  const porCuenta = new Map<string, { nombre: string | null; cuentaRussell: string | null; saldos: number[] }>();
  for (const f of filas) {
    if (!esRetencion(f.cuentaCliente) || (f.cuentaRussell && esRetencion(f.cuentaRussell))) continue;
    const c = porCuenta.get(f.cuentaCliente) ?? { nombre: f.nombreCuenta, cuentaRussell: f.cuentaRussell, saldos: [] };
    c.saldos.push(-f.saldoFinal);
    porCuenta.set(f.cuentaCliente, c);
  }
  return [...porCuenta.entries()]
    .map(([cuenta, c]) => ({
      cuenta,
      nombre: c.nombre,
      cuentaRussell: c.cuentaRussell,
      nombreRussell: c.cuentaRussell ? (nombres.get(c.cuentaRussell) ?? null) : null,
      saldo: sumar(c.saldos),
    }))
    .filter((c) => c.saldo !== 0)
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

/** Lo que un tercero suma al lado contable: nada si es la DIAN restada; si no, su saldo final menos el saldo inicial restado. */
export function aporteTercero(t: Pick<TerceroCruce, "saldo" | "restado" | "saldoInicialRestado">): number {
  return t.restado ? 0 : sumar([t.saldo, -(t.saldoInicialRestado ?? 0)]);
}

/** Se tacha completo: la DIAN restada, o el tercero al que restarle el saldo inicial lo deja en cero (no tuvo movimiento). */
export function terceroTachado(t: Pick<TerceroCruce, "saldo" | "restado" | "saldoInicialRestado">): boolean {
  return t.restado || (Boolean(t.saldoInicialRestado) && aporteTercero(t) === 0);
}

/** Lo declarado por concepto: Σ de sus renglones en los 350 vigentes de los meses del corte, con signo. */
export function declaradoPorConcepto(periodos: readonly PeriodoRevision[], fila: Pick<FilaMapeoDian, "renglonPj" | "renglonPn" | "signo">, signoEnSubtotal = false): number {
  const signo = fila.signo === "-" && !signoEnSubtotal ? -1 : 1;
  const renglones = renglonesDeFila(fila);
  return sumar(periodos.flatMap((p) => (p.cadena.vigente ? renglones.map((r) => signo * (p.cadena.vigente!.valores[r] ?? 0)) : [])));
}

export function cruceRetencion(e: EntradaCruce): ResultadoCruce {
  const impuesto: ImpuestoDian = impuestoPorClave(e.impuesto) ?? RETENCION;
  const signoEnSubtotal = impuesto.cruce.signoEnSubtotal;
  // El grupo de una sección del mapeo: el del descriptor; en Retención, el de siempre si la sección es otra.
  const grupoDe = (seccion: string) =>
    impuesto.cruce.grupos.find((g) => g.secciones.includes(seccion)) ??
    impuesto.cruce.grupos.find((g) => g.grupo === grupoDeSeccion(seccion)) ??
    impuesto.cruce.grupos[0];
  // Signo del lado contable: Retención, pasivo en positivo; IVA, según la naturaleza de la cuenta Russell.
  const signoDe = (cuentaRussell: string) => (impuesto.cruce.signoPorNaturaleza && e.naturalezas?.get(cuentaRussell) === "D" ? 1 : -1);
  const marcas = new Map(e.marcas.map((m) => [m.clave, m]));
  const filas = new Map<string, FilaCruce>();
  // Cada cuenta Russell del mapeo, a la fila que la reúne.
  const filaDeCuenta = new Map<string, string>();
  const restarInicial = e.restarSaldoInicial && e.inicioEnero;

  for (const m of e.mapeo) {
    if (!m.enCruce) continue;
    const grupo = grupoDe(m.seccion).grupo;
    const cuentas = cuentasDeMapeo(m);
    const clave = cuentas.length > 0 ? claveCuentasMapeo(cuentas) : `sin_cuenta:${m.concepto}`;
    let fila = filas.get(clave);
    if (!fila) {
      fila = {
        clave, grupo, cuentaRussell: cuentas.length > 0 ? clave : null, cuentasRussell: cuentas,
        nombreCuenta: cuentas.length === 1 ? (e.nombresRussell.get(cuentas[0]) ?? null) : null,
        signoSubtotal: signoEnSubtotal && m.signo === "-" ? -1 : 1,
        conceptos: [], declarado: 0, contable: 0, diferencia: 0, nivel: "cero", requiereMarca: false,
        restaDian: cuentas.some((c) => !e.sinRestaDian.has(c)), dianRestado: 0,
        cuentasCliente: [], saldoInicial: null, posiblesDian: [], marca: null,
      };
      filas.set(clave, fila);
      for (const c of cuentas) filaDeCuenta.set(c, clave);
    }
    fila.conceptos.push({ concepto: m.concepto, etiqueta: m.etiqueta, renglones: renglonesDeFila(m), signo: m.signo, declarado: declaradoPorConcepto(e.periodos, m, signoEnSubtotal) });
  }

  // Lado contable: cada cuenta del cliente con sus terceros, por fila del cruce.
  const porFila = new Map<string, Map<string, CuentaClienteCruce>>();
  const cuentasDeFila = (clave: string) => {
    const cuentas = porFila.get(clave) ?? new Map<string, CuentaClienteCruce>();
    porFila.set(clave, cuentas);
    return cuentas;
  };
  const fuera = new Map<string, { cuentas: Set<string>; saldo: number }>();
  for (const t of e.filasContables) {
    const russell = t.cuentaRussell;
    const signo = signoDe(russell);
    const claveFila = filaDeCuenta.get(russell);
    if (!claveFila) {
      const f = fuera.get(russell) ?? { cuentas: new Set<string>(), saldo: 0 };
      f.cuentas.add(t.cuentaCliente);
      f.saldo = sumar([f.saldo, signo * t.saldoFinal]);
      fuera.set(russell, f);
      continue;
    }
    const cuentas = cuentasDeFila(claveFila);
    const cuenta = cuentas.get(t.cuentaCliente) ?? { cuenta: t.cuentaCliente, nombre: t.nombreCuenta, saldo: 0, terceros: [] };
    cuentas.set(t.cuentaCliente, cuenta);
    const esDian = esTerceroDian(t.nit, e.tercerosDian);
    const restado = esDian && !e.sinRestaDian.has(russell);
    cuenta.terceros.push({
      nit: t.nit, nombre: t.nombreTercero, saldo: signo * t.saldoFinal, saldoInicial: signo * t.saldoInicial,
      esDian, restado, posibleDian: !esDian && !t.nit && pareceNombreDian(t.nombreTercero),
      saldoInicialRestado: restarInicial && !esDian && t.saldoInicial !== 0 ? signo * t.saldoInicial : 0,
    });
  }
  // Las cuentas que se leen por cuenta (ingresos de IVA): el saldo final, sin terceros ni restas.
  for (const c of e.filasContablesCuenta ?? []) {
    const claveFila = filaDeCuenta.get(c.cuentaRussell);
    if (!claveFila) continue;
    const cuentas = cuentasDeFila(claveFila);
    const previa = cuentas.get(c.cuentaCliente);
    const saldo = sumar([previa?.saldo ?? 0, signoDe(c.cuentaRussell) * c.saldoFinal]);
    cuentas.set(c.cuentaCliente, { cuenta: c.cuentaCliente, nombre: c.nombreCuenta, saldo, terceros: [], porCuenta: true });
  }

  for (const fila of filas.values()) {
    fila.declarado = sumar(fila.conceptos.map((c) => c.declarado));
    if (fila.cuentaRussell) {
      const cuentas = [...(porFila.get(fila.clave)?.values() ?? [])].sort((a, b) => a.cuenta.localeCompare(b.cuenta));
      for (const c of cuentas) {
        if (c.porCuenta) continue;
        c.terceros.sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
        c.saldo = sumar(c.terceros.map(aporteTercero));
      }
      fila.cuentasCliente = cuentas;
      const terceros = cuentas.flatMap((c) => c.terceros);
      fila.contable = sumar(cuentas.map((c) => c.saldo));
      fila.dianRestado = sumar(terceros.filter((t) => t.restado).map((t) => t.saldo));
      fila.posiblesDian = terceros.filter((t) => t.posibleDian).map((t) => t.nombre ?? "");
      if (e.inicioEnero) {
        const conInicial = terceros.filter((t) => !t.esDian && t.saldoInicial !== 0);
        if (conInicial.length) fila.saldoInicial = { terceros: conInicial.length, monto: sumar(conInicial.map((t) => t.saldoInicial)), restado: restarInicial };
      }
    }
    fila.diferencia = sumar([fila.declarado, -fila.contable]);
    fila.nivel = nivelDiferencia(fila.diferencia, { descuadre: e.umbral });
    fila.requiereMarca = fila.nivel === "alerta";
    const marca = marcas.get(fila.clave);
    if (marca) fila.marca = { ...marca, vigente: centavos(marca.diferencia) === centavos(fila.diferencia) };
  }

  // Las secciones en el orden del descriptor (en IVA, los ingresos al final).
  const grupos = impuesto.cruce.grupos
    .map(({ grupo, etiqueta }) => {
      const delGrupo = [...filas.values()].filter((f) => f.grupo === grupo);
      return { grupo, etiqueta, filas: delGrupo, subtotal: subtotal(delGrupo) };
    })
    .filter((g) => g.filas.length > 0);
  const todas = grupos.flatMap((g) => g.filas);
  return {
    ...(impuesto.clave === RETENCION.clave ? {} : { impuesto: impuesto.clave }),
    grupos,
    total: subtotal(todas),
    saldoInicial: resumenSaldoInicial(todas, restarInicial),
    fueraDelMapeo: [...fuera.entries()]
      .map(([cuentaRussell, f]) => ({ cuentaRussell, cuentas: [...f.cuentas].sort(), saldo: f.saldo }))
      .sort((a, b) => a.cuentaRussell.localeCompare(b.cuentaRussell)),
    fueraDeRetencion: cuentasFueraDeRetencion(e.filasFueraDeRetencion ?? [], e.nombresFueraDeRetencion, impuesto.cruce.prefijosCliente),
    pendientesMarca: todas.filter((f) => f.requiereMarca && !f.marca?.vigente).length,
  };
}

/** Subtotal de filas: cada una con su signo en el subtotal (en IVA, 42 y 80 restan). */
function subtotal(filas: readonly FilaCruce[]): SubtotalCruce {
  const declarado = sumar(filas.map((f) => (f.signoSubtotal ?? 1) * f.declarado));
  const contable = sumar(filas.map((f) => (f.signoSubtotal ?? 1) * f.contable));
  return { declarado, contable, diferencia: sumar([declarado, -contable]) };
}

function resumenSaldoInicial(filas: readonly FilaCruce[], restado: boolean): ResumenSaldoInicial | null {
  const registros = filas
    .filter((f) => f.saldoInicial)
    .flatMap((f) => f.cuentasCliente.flatMap((c) => c.terceros.filter((t) => !t.esDian && t.saldoInicial !== 0).map((t) => ({ cuenta: c.cuenta, tercero: t.nit ?? t.nombre ?? "", monto: t.saldoInicial }))));
  if (registros.length === 0) return null;
  return {
    terceros: new Set(registros.map((r) => r.tercero)).size,
    cuentas: new Set(registros.map((r) => r.cuenta)).size,
    monto: sumar(registros.map((r) => r.monto)),
    restado,
  };
}

/**
 * Pone en el cruce la marca de lo restado como saldo inicial (viaja con él, también a la copia
 * congelada). Vale mientras se siga restando el mismo total.
 */
export function conMarcaSaldoInicial(cruce: CruceRetencionVista, marcas: readonly (MarcaCruceRetencion & { clave: string })[]): CruceRetencionVista {
  if (cruce.estado !== "listo") return cruce;
  const m = marcas.find((x) => x.clave === CLAVE_MARCA_SALDO_INICIAL);
  const inicial = cruce.resultado.saldoInicial;
  const marca = m ? { ...m, vigente: Boolean(inicial?.restado) && centavos(m.diferencia) === centavos(inicial?.monto ?? 0) } : null;
  return { ...cruce, resultado: { ...cruce.resultado, marcaSaldoInicial: marca } };
}

/** Tercero por tercero y cuenta por cuenta, lo que se restó como saldo inicial. Null si el cruce no lo resta. */
export function detalleSaldoInicialRestado(cruce: CruceRetencionVista): DetalleSaldoInicialRestado | null {
  if (cruce.estado !== "listo" || !cruce.resultado.saldoInicial?.restado) return null;
  const { saldoInicial, marcaSaldoInicial } = cruce.resultado;
  const filas = cruce.resultado.grupos
    .flatMap((g) => g.filas)
    .flatMap((f) =>
      f.cuentasCliente.flatMap((c) =>
        c.terceros
          .filter((t) => (t.saldoInicialRestado ?? 0) !== 0)
          .map((t): FilaSaldoInicialRestado => ({
            nit: t.nit, nombre: t.nombre, cuentaCliente: c.cuenta, nombreCuenta: c.nombre, cuentaRussell: f.cuentaRussell,
            saldoInicial: t.saldoInicial, saldoFinal: t.saldo, restado: t.saldoInicialRestado ?? 0,
          })),
      ),
    )
    .sort((a, b) => (a.nombre ?? a.nit ?? "").localeCompare(b.nombre ?? b.nit ?? "") || (a.nit ?? "").localeCompare(b.nit ?? "") || a.cuentaCliente.localeCompare(b.cuentaCliente));
  return {
    filas,
    terceros: saldoInicial.terceros,
    cuentas: saldoInicial.cuentas,
    total: saldoInicial.monto,
    marca: marcaSaldoInicial ?? null,
  };
}

/** «1 tercero en 9 cuentas»: cómo se nombra el alcance del saldo inicial. */
export function alcanceSaldoInicial(s: Pick<ResumenSaldoInicial, "terceros" | "cuentas">): string {
  return `${s.terceros} ${s.terceros === 1 ? "tercero" : "terceros"} en ${s.cuentas} ${s.cuentas === 1 ? "cuenta" : "cuentas"}`;
}

/** Cómo queda el total del cruce al activar o quitar la resta del saldo inicial (lo que confirma el modal). */
export function totalAlCambiarResta(total: SubtotalCruce, s: Pick<ResumenSaldoInicial, "monto" | "restado">): SubtotalCruce {
  const contable = sumar([total.contable, s.restado ? s.monto : -s.monto]);
  return { declarado: total.declarado, contable, diferencia: sumar([total.declarado, -contable]) };
}

/** Cuentas Russell de 2365/2367 que se leen del balance (las del mapeo y las de pagos aparte). */
export function prefijosRetencion(): string[] {
  return ["2365", "2367"];
}

/** Cómo se nombra una fila del cruce: su concepto, o la cuenta Russell cuando agrupa varios. */
/**
 * ¿La fila tiene algo que mostrar? (para «Ocultar los renglones en cero»). Una fila en cero con
 * marca o con aviso se queda: hay algo que leer en ella.
 */
export function filaCruceConValores(f: Pick<FilaCruce, "declarado" | "contable" | "dianRestado" | "marca" | "saldoInicial" | "posiblesDian">): boolean {
  return f.declarado !== 0 || f.contable !== 0 || f.dianRestado !== 0 || f.marca !== null || f.saldoInicial !== null || f.posiblesDian.length > 0;
}

/** Los grupos sin sus filas en cero; el que se queda sin filas sale entero (su subtotal es cero). */
export function gruposCruceConValores(grupos: ResultadoCruce["grupos"]): ResultadoCruce["grupos"] {
  return grupos.map((g) => ({ ...g, filas: g.filas.filter(filaCruceConValores) })).filter((g) => g.filas.length > 0);
}

/**
 * Lo que se lee de una cuenta del cliente con sus terceros contraídos. El saldo inicial sigue el
 * criterio del aviso de la fila: el de la DIAN no cuenta. `oculto` son los que no viajaron a la pantalla.
 */
export function resumenCuentaCruce(c: CuentaClienteCruce, oculto?: { cantidad: number; saldoInicial: number; saldoInicialRestado?: number }) {
  return {
    terceros: c.terceros.length + (oculto?.cantidad ?? 0),
    saldoInicial: sumar([...c.terceros.filter((t) => !t.esDian).map((t) => t.saldoInicial), oculto?.saldoInicial ?? 0]),
    saldoInicialRestado: sumar([...c.terceros.map((t) => t.saldoInicialRestado ?? 0), oculto?.saldoInicialRestado ?? 0]),
    dianRestado: sumar(c.terceros.filter((t) => t.restado).map((t) => t.saldo)),
    posibleDian: c.terceros.some((t) => t.posibleDian),
  };
}

/** El impuesto de un cruce: las copias antiguas no lo traen y son de Retención. */
export function impuestoDelCruce(r: Pick<ResultadoCruce, "impuesto">): ImpuestoDian {
  return impuestoPorClave(r.impuesto) ?? RETENCION;
}

/** Las cuentas Russell de una fila, una por una (las copias antiguas solo traen `cuentaRussell`). */
export function cuentasDeFilaCruce(f: Pick<FilaCruce, "cuentaRussell" | "cuentasRussell">): string[] {
  return f.cuentasRussell ?? (f.cuentaRussell ? f.cuentaRussell.split("+") : []);
}

export function etiquetaFilaCruce(f: Pick<FilaCruce, "nombreCuenta" | "conceptos">): string {
  if (f.conceptos.length === 1) return f.conceptos[0].etiqueta;
  return f.nombreCuenta ?? f.conceptos.map((c) => c.etiqueta).join(" + ");
}

/** Renglones del 350 que forman la fila, con «−» en los que restan (p. ej. «131 · 132 · −133»). */
export function renglonesFilaCruce(f: Pick<FilaCruce, "conceptos">): string {
  return f.conceptos.flatMap((c) => c.renglones.map((r) => `${c.signo === "-" ? "−" : ""}${r}`)).join(" · ");
}

/** El balance del corte: `periodo` es su etiqueta («Enero 2026 – Agosto 2026»), la del bloqueo de cuentas. */
export type BalanceCruceRetencion = { id: number; periodo: string; descripcion: string; periodoInicio: string; periodoFin: string };

export type CruceRetencionVista =
  | {
      estado: "sin_balance" | "bloqueado";
      mensaje: string;
      balance: BalanceCruceRetencion | null;
      umbral: number;
      /** Si sirve más de un balance del corte: cómo se escogió y la lista para escoger. No va en la copia del cierre. */
      eleccionBalance?: EleccionBalanceVista | null;
    }
  | {
      estado: "listo";
      mensaje: null;
      balance: BalanceCruceRetencion;
      umbral: number;
      inicioEnero: boolean;
      resultado: ResultadoCruce;
      /** Huella del prevalidador del balance: el cierre la vuelve a leer bajo candado y exige la misma. */
      huellaBalance?: string;
      eleccionBalance?: EleccionBalanceVista | null;
    };

/** Terceros por cuenta del cliente que viajan a la pantalla (el Excel lleva todos). */
export const MAX_TERCEROS_PANTALLA = 100;

export type ResultadoCrucePantalla = ResultadoCruce & {
  /** Por `clave|cuenta del cliente`: cuántos terceros no viajaron, lo que suman, su saldo inicial (sin la DIAN) y el que se les restó. */
  tercerosOcultos: Record<string, { cantidad: number; saldo: number; saldoInicial: number; saldoInicialRestado: number }>;
};

export type CruceRetencionPantalla =
  | Extract<CruceRetencionVista, { estado: "sin_balance" | "bloqueado" }>
  | (Omit<Extract<CruceRetencionVista, { estado: "listo" }>, "resultado"> & { resultado: ResultadoCrucePantalla });

/** Recorta los terceros de cada cuenta para la pantalla, dejando el resumen de los que no viajan. */
export function cruceParaPantalla(resultado: ResultadoCruce): ResultadoCrucePantalla {
  const ocultos: ResultadoCrucePantalla["tercerosOcultos"] = {};
  const grupos = resultado.grupos.map((g) => ({
    ...g,
    filas: g.filas.map((f) => ({
      ...f,
      cuentasCliente: f.cuentasCliente.map((c) => {
        if (c.terceros.length <= MAX_TERCEROS_PANTALLA) return c;
        // Primero la DIAN y los posibles DIAN; luego los de mayor saldo (ya vienen ordenados por |saldo|).
        const visibles = [...c.terceros.filter((t) => t.esDian || t.posibleDian), ...c.terceros.filter((t) => !t.esDian && !t.posibleDian)].slice(0, MAX_TERCEROS_PANTALLA);
        const enPantalla = new Set(visibles);
        const resto = c.terceros.filter((t) => !enPantalla.has(t));
        ocultos[`${f.clave}|${c.cuenta}`] = {
          cantidad: resto.length,
          saldo: sumar(resto.map(aporteTercero)),
          saldoInicial: sumar(resto.filter((t) => !t.esDian).map((t) => t.saldoInicial)),
          saldoInicialRestado: sumar(resto.map((t) => t.saldoInicialRestado ?? 0)),
        };
        return { ...c, terceros: visibles };
      }),
    })),
  }));
  return { ...resultado, grupos, tercerosOcultos: ocultos };
}
