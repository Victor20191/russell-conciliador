// ALCANCE del cruce por tercero — puro, sin BD.
//
// Qué cuentas se tienen en cuenta en el cruce por tercero de un cargue, en un solo lugar, para
// que el consultor vea de un vistazo sobre qué se está conciliando y decida si falta o sobra
// alguna. No decide nada: ordena por cuenta Russell lo que el cruce ya resolvió —la lista de
// cuentas del módulo (Filtros de cuentas, o la guardada al cerrar), las cuentas que el
// Consolidado asignó solo para el período, los movimientos del balance por tercero y los saldos
// del auxiliar con la cuenta del módulo que el Consolidado le asignó a su cuenta del archivo—.
//
// A diferencia de las columnas de la tabla, que solo muestran las cuentas con saldo, aquí
// aparecen TODAS las cuentas de la lista, también las que están en cero en el período.
//
// Un renglón del Consolidado asignado a VARIAS cuentas a la vez (la bolsa «(sin clasificar)» de
// un auxiliar sin columna de cuenta, típicamente) no se reparte entre ellas: esas cuentas forman
// un GRUPO que se compara junto, como la fila agrupada del cruce contable. Los grupos que
// comparten una cuenta se encadenan en uno solo.
import type { MovimientoContableTercero, SaldoModuloTercero } from "./cruce-tercero-cartera";
import { SIN_CLASIFICAR } from "../promocion";

/** Rótulo de las cuentas del archivo sin asignación cuyo saldo no trae cuenta del archivo. */
export const CUENTA_ARCHIVO_VACIA = SIN_CLASIFICAR;

export type CuentaAlcanceTercero = {
  /** Cuenta Russell de seis dígitos. */
  cuenta: string;
  nombre: string | null;
  /** Por qué entra: la lista del módulo, o el Consolidado la asignó solo para este período. */
  fuente: "modulo" | "periodo";
  /** De la lista del módulo, pero su subgrupo no está en los prefijos del prevalidador. */
  fueraDePrefijos: boolean;
  /** Cartera y CxP: origen que la cuenta le da al saldo del tercero. */
  origen: "nacional" | "exterior" | null;
  /** Balance por tercero: `total` es lo que entra al cruce; `sinTercero`, la fila propia de la cuenta sin detalle. */
  contable: { total: number; terceros: number; sinTercero: number };
  /** Auxiliar asignado SOLO a esta cuenta en el Consolidado; lo asignado junto con otras va en su grupo. */
  auxiliar: { total: number; terceros: number; sinTercero: number; cuentasArchivo: string[] };
  /** Índice en `grupos` si parte del auxiliar de la cuenta está asignada junto con otras; la diferencia se lee en el grupo. */
  grupo: number | null;
};

export type GrupoAlcanceTercero = {
  /** Cuentas del grupo, ordenadas. */
  cuentas: string[];
  /** Σ del balance de las cuentas del grupo. */
  contable: { total: number; terceros: number };
  /** Σ del auxiliar del grupo: lo asignado junto y lo asignado a cada una sola. */
  auxiliar: { total: number; terceros: number; sinTercero: number };
  /** Solo lo asignado junto (con tercero): el resto ya suma en el renglón de cada cuenta. */
  compartido: number;
  /** Renglones del Consolidado asignados a varias cuentas del grupo. */
  cuentasArchivo: string[];
};

export type CuentaArchivoSinAsignar = { cuentaArchivo: string; total: number; terceros: number };

export type AlcanceCruceTercero = {
  cuentas: CuentaAlcanceTercero[];
  grupos: GrupoAlcanceTercero[];
  /** Saldos del auxiliar sin cuentas por diseño (el módulo no asigna en el Consolidado): no se desglosan por cuenta. */
  auxiliarSinDesglose: { total: number; terceros: number; sinTercero: number } | null;
  /** Cuentas del grupo contable con saldo que no son del módulo: se informan, no se concilian. */
  fueraDelModulo: { cuenta: string; nombre: string | null; total: number; terceros: number }[];
  /** Cuentas del archivo sin una cuenta del módulo asignada en el Consolidado: no entran al cruce. */
  archivoSinAsignar: CuentaArchivoSinAsignar[];
};

export type EntradaAlcanceTercero = {
  /** Lista de cuentas del módulo con su origen; `null` = el módulo no acota (todas las del grupo). */
  cuentasModulo: readonly { cuenta: string; origen: "nacional" | "exterior" | null }[] | null;
  /** Cuentas de seis dígitos que el Consolidado asignó solo para este período. */
  cuentasPeriodo: readonly string[];
  /** Cuentas de la lista cuyo subgrupo no está en los prefijos del prevalidador. */
  fueraDePrefijos: ReadonlySet<string>;
  nombres: ReadonlyMap<string, string>;
  /** Los MISMOS movimientos que recibe `construirCruceTerceroCartera` (ya sin las cuentas no modulares). */
  contable: readonly MovimientoContableTercero[];
  /** Los MISMOS saldos del auxiliar, con todas las cuentas del módulo asignadas a su cuenta del archivo (`cuentas6`). */
  modulo: readonly SaldoModuloTercero[];
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;
const conSaldo = (v: number): boolean => Math.abs(v) > 0.005;

type Acumulado = { total: number; sinTercero: number; porTercero: Map<string, number>; archivos: Set<string> };
const nuevo = (): Acumulado => ({ total: 0, sinTercero: 0, porTercero: new Map(), archivos: new Set() });
const sumar = (a: Acumulado, clave: string | null, valor: number) => {
  if (clave == null) {
    a.sinTercero += valor;
    return;
  }
  a.total += valor;
  a.porTercero.set(clave, (a.porTercero.get(clave) ?? 0) + valor);
};
/** Une varios acumulados (los terceros se suman por clave: uno con saldo en dos cuentas cuenta una vez). */
const fundir = (partes: readonly (Acumulado | undefined)[]): Acumulado => {
  const a = nuevo();
  for (const p of partes) {
    if (!p) continue;
    a.total += p.total;
    a.sinTercero += p.sinTercero;
    for (const [clave, valor] of p.porTercero) a.porTercero.set(clave, (a.porTercero.get(clave) ?? 0) + valor);
    for (const archivo of p.archivos) a.archivos.add(archivo);
  }
  return a;
};
const terceros = (a: Acumulado | undefined): number => (a ? [...a.porTercero.values()].filter(conSaldo).length : 0);

export function alcanceCruceTercero(input: EntradaAlcanceTercero): AlcanceCruceTercero {
  const origenDe = new Map((input.cuentasModulo ?? []).map((c) => [c.cuenta, c.origen]));
  const delPeriodo = new Set(input.cuentasPeriodo);
  // Sin lista, el módulo concilia todas las cuentas del grupo: las que trae el balance.
  const lista = input.cuentasModulo ? new Set([...origenDe.keys(), ...delPeriodo]) : null;
  const entra = (cuenta: string) => lista == null || lista.has(cuenta);

  const contable = new Map<string, Acumulado>();
  const fuera = new Map<string, Acumulado>();
  for (const m of input.contable) {
    const destino = entra(m.cuenta6) ? contable : fuera;
    const a = destino.get(m.cuenta6) ?? nuevo();
    sumar(a, m.clave, m.valor);
    destino.set(m.cuenta6, a);
  }

  const auxiliar = new Map<string, Acumulado>();
  const compartido = new Map<string, Acumulado>();
  const sinAsignar = new Map<string, Acumulado>();
  const sinDesglose = nuevo();
  for (const s of input.modulo) {
    const cuentas = [...new Set(s.cuentas6 ?? (s.cuenta6 ? [s.cuenta6] : []))].sort();
    // La misma llave con que el cruce busca el renglón del Consolidado de la cuenta del archivo.
    const archivo = s.cuentaArchivo?.trim() || SIN_CLASIFICAR;
    const delModulo = cuentas.filter(entra);
    if (s.sinCuentaDelModulo || (cuentas.length > 0 && delModulo.length === 0)) {
      const a = sinAsignar.get(archivo) ?? nuevo();
      sumar(a, s.clave, s.saldo);
      sinAsignar.set(archivo, a);
      continue;
    }
    if (delModulo.length === 0) {
      sumar(sinDesglose, s.clave, s.saldo);
      continue;
    }
    const destino = delModulo.length === 1 ? auxiliar : compartido;
    const llave = delModulo.join("+");
    const a = destino.get(llave) ?? nuevo();
    sumar(a, s.clave, s.saldo);
    a.archivos.add(archivo);
    destino.set(llave, a);
  }

  // Grupos: las cuentas unidas por una asignación compartida, encadenadas si comparten una cuenta.
  const padre = new Map<string, string>();
  const raiz = (c: string): string => {
    let r = c;
    while (padre.get(r) !== r) r = padre.get(r)!;
    padre.set(c, r);
    return r;
  };
  for (const llave of compartido.keys()) {
    const [primera, ...resto] = llave.split("+");
    for (const c of [primera, ...resto]) if (!padre.has(c)) padre.set(c, c);
    for (const c of resto) padre.set(raiz(c), raiz(primera));
  }
  const miembros = new Map<string, string[]>();
  for (const c of padre.keys()) miembros.set(raiz(c), [...(miembros.get(raiz(c)) ?? []), c]);
  const componentes = [...miembros.values()].map((cs) => cs.sort()).sort((x, y) => x[0].localeCompare(y[0]));
  const grupoDe = new Map(componentes.flatMap((cs, i) => cs.map((c) => [c, i] as const)));
  const grupos: GrupoAlcanceTercero[] = componentes.map((cs, i) => {
    const propios = [...compartido.entries()].filter(([llave]) => grupoDe.get(llave.split("+")[0]) === i).map(([, a]) => a);
    const junto = fundir(propios);
    const aux = fundir([junto, ...cs.map((c) => auxiliar.get(c))]);
    const cont = fundir(cs.map((c) => contable.get(c)));
    return {
      cuentas: cs,
      contable: { total: redondear(cont.total), terceros: terceros(cont) },
      auxiliar: { total: redondear(aux.total), terceros: terceros(aux), sinTercero: redondear(aux.sinTercero) },
      compartido: redondear(junto.total),
      cuentasArchivo: [...junto.archivos].sort(),
    };
  });

  const codigos = lista
    ? [...lista]
    : [...new Set([...contable.keys(), ...auxiliar.keys(), ...grupoDe.keys()])];
  const cuentas: CuentaAlcanceTercero[] = codigos.sort().map((cuenta) => {
    const c = contable.get(cuenta);
    const m = auxiliar.get(cuenta);
    return {
      cuenta,
      nombre: input.nombres.get(cuenta) ?? null,
      fuente: delPeriodo.has(cuenta) && !origenDe.has(cuenta) ? "periodo" : "modulo",
      fueraDePrefijos: !delPeriodo.has(cuenta) && input.fueraDePrefijos.has(cuenta),
      origen: origenDe.get(cuenta) ?? null,
      contable: { total: redondear(c?.total ?? 0), terceros: terceros(c), sinTercero: redondear(c?.sinTercero ?? 0) },
      auxiliar: {
        total: redondear(m?.total ?? 0),
        terceros: terceros(m),
        sinTercero: redondear(m?.sinTercero ?? 0),
        cuentasArchivo: [...(m?.archivos ?? [])].sort(),
      },
      grupo: grupoDe.get(cuenta) ?? null,
    };
  });

  return {
    cuentas,
    grupos,
    auxiliarSinDesglose: conSaldo(sinDesglose.total) || conSaldo(sinDesglose.sinTercero) || sinDesglose.porTercero.size > 0
      ? { total: redondear(sinDesglose.total), terceros: terceros(sinDesglose), sinTercero: redondear(sinDesglose.sinTercero) }
      : null,
    fueraDelModulo: [...fuera.entries()]
      .map(([cuenta, a]) => ({ cuenta, nombre: input.nombres.get(cuenta) ?? null, total: redondear(a.total + a.sinTercero), terceros: terceros(a) }))
      .filter((f) => conSaldo(f.total) || f.terceros > 0)
      .sort((x, y) => x.cuenta.localeCompare(y.cuenta)),
    archivoSinAsignar: [...sinAsignar.entries()]
      .map(([cuentaArchivo, a]) => ({ cuentaArchivo, total: redondear(a.total + a.sinTercero), terceros: terceros(a) }))
      .filter((f) => conSaldo(f.total) || f.terceros > 0)
      .sort((x, y) => x.cuentaArchivo.localeCompare(y.cuentaArchivo)),
  };
}
