import { agruparJerarquia, type CuentaEstandar, type NodoBalance, type NombresJerarquia } from "./calcular";
import { filasEfectivasTercero } from "./staging-tercero";
import { coincideFiltroNumerico, type FiltrosColumnasDetalle } from "./filtros-detalle";
import type { ComparacionCuentaTerceros, TerceroVisor } from "./visor-terceros";
import { claveIdentidadTercero, identidadParaVisor, estadoIdentidadTercero, type IdentidadTercero, type EstadoIdentidadTercero } from "./identidad-tercero";

export type ValidacionTerceros = "todas" | "ok" | "alerta" | "incompleta";
export type FiltrosColumnasTerceros = Omit<FiltrosColumnasDetalle, "validacion"> & { validacion: ValidacionTerceros };
export type NodoVisorTerceros = Omit<NodoBalance, "hijos"> & {
  tipo: "cuenta" | "tercero" | "movimiento";
  hijos: NodoVisorTerceros[];
  comparacion?: Omit<ComparacionCuentaTerceros, "terceros">;
  diferencias: number;
  incompletas: number;
  movimientos?: number;
  esFilaPropia?: boolean;
  mapeoInconsistente?: boolean;
  identidadTercero?: IdentidadTercero;
};

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const variacion = (anterior: number, saldo: number) => anterior === 0 ? null : Math.round((saldo - anterior) / Math.abs(anterior) * 1000) / 10;

/** Una fila por NIT dentro de la cuenta; sin NIT, por nombre. La fila propia
 * solo participa cuando no existe detalle real, igual que en el cruce oficial. */
export function agruparMovimientosTercero(fila: ComparacionCuentaTerceros) {
  const efectivas = filasEfectivasTercero(fila.terceros.map((t) => ({ ...t, cuenta8: fila.cuenta8 })));
  const grupos = new Map<string, TerceroVisor[]>();
  for (const t of efectivas) {
    const clave = t.esFilaPropia ? "propia" : claveIdentidadTercero(identidadParaVisor(t));
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(t);
    else grupos.set(clave, [t]);
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([clave, movimientos]) => {
    const homologaciones = new Set(movimientos.map((t) => t.cuenta6Russell));
    const identidades = movimientos.map(identidadParaVisor);
    const identidad = { ...identidades.find((i) => i.nombre) ?? identidades[0] };
    const nombres = new Set(identidades.flatMap((i) => i.nombre ? [normalizar(i.nombre).replace(/[^a-z0-9]/g, "")] : []));
    if (nombres.size > 1) {
      identidad.nombre = null;
      identidad.observaciones = [...identidad.observaciones, "Hay varios nombres para la misma identificación en este archivo."];
    }
    return {
      clave, movimientos, identidad,
      nit: identidad.numeroDocumento,
      nombre: movimientos[0].esFilaPropia ? "Sin desagregar por tercero" : identidad.nombre ?? (identidad.numeroDocumento ? "Nombre no disponible" : "Sin tercero reportado"),
      propia: movimientos[0].esFilaPropia,
      mapeo: homologaciones.size === 1 ? movimientos[0].cuenta6Russell : null,
      inconsistente: homologaciones.size > 1,
      anterior: movimientos.reduce((s, t) => s + t.saldoInicial, 0),
      debito: movimientos.reduce((s, t) => s + t.debitos, 0),
      credito: movimientos.reduce((s, t) => s + t.creditos, 0),
      saldo: movimientos.reduce((s, t) => s + t.saldoFinal, 0),
    };
  });
}

/** Reutiliza la jerarquía Russell del balance. Los importes de cuenta y de sus
 * agrupadoras son los oficiales; añadir terceros NO vuelve a sumarlos al padre.
 * Las cuentas exclusivas del tercero siguen visibles, con importe oficial cero
 * y alerta de incompletas, sin contaminar los totales del balance. */
export function construirArbolVisorTerceros(
  comparaciones: ComparacionCuentaTerceros[],
  estandar: CuentaEstandar[],
  nombres: NombresJerarquia,
): NodoVisorTerceros[] {
  const porCuenta = new Map(comparaciones.map((f) => [f.cuenta8, f]));
  const base = agruparJerarquia(comparaciones.map((f) => ({
    cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta,
    cuenta6Russell: f.enBalance ? f.cuenta6RussellBalance : f.cuenta6RussellTercero,
    saldoInicial: f.saldoInicialBalance, debitos: f.debitosBalance,
    creditos: f.creditosBalance, saldoFinal: f.saldoFinalBalance,
  })), estandar, new Map(estandar.map((s) => [s.code, s.name ?? s.code])), nombres);

  const completar = (n: NodoBalance): NodoVisorTerceros => {
    if (n.nivel !== 8) {
      const hijos = n.hijos.map(completar);
      return { ...n, tipo: "cuenta", hijos, diferencias: hijos.reduce((s, h) => s + h.diferencias, 0), incompletas: hijos.reduce((s, h) => s + h.incompletas, 0) };
    }
    const fila = porCuenta.get(n.code)!;
    const { terceros, ...comparacion } = fila;
    const hijos = agruparMovimientosTercero(fila).map((g): NodoVisorTerceros => {
      const key = `${n.key}/tercero/${encodeURIComponent(g.clave)}`;
      const diferencia = g.inconsistente || (fila.enBalance && g.mapeo !== fila.cuenta6RussellBalance);
      return {
        ...n, key, tipo: "tercero", code: g.nit || "Sin documento", name: g.nombre,
        identidadTercero: g.propia ? undefined : g.identidad,
        prevBalance: g.anterior, debe: g.debito, haber: g.credito, balance: g.saldo,
        variation: variacion(g.anterior, g.saldo), std: g.mapeo, mapped: g.mapeo != null,
        diferencias: diferencia ? 1 : 0, incompletas: 0,
        movimientos: g.movimientos.length, esFilaPropia: g.propia, mapeoInconsistente: g.inconsistente,
        hijos: g.movimientos.length <= 1 ? [] : g.movimientos.map((m, i) => ({
          ...n, key: `${key}/movimiento/${i}`, tipo: "movimiento", code: String(i + 1), name: g.nombre,
          prevBalance: m.saldoInicial, debe: m.debitos, haber: m.creditos, balance: m.saldoFinal,
          variation: variacion(m.saldoInicial, m.saldoFinal), std: m.cuenta6Russell, mapped: m.cuenta6Russell != null,
          diferencias: fila.enBalance && m.cuenta6Russell !== fila.cuenta6RussellBalance ? 1 : 0,
          incompletas: 0, hijos: [],
        })),
      };
    });
    return { ...n, tipo: "cuenta", comparacion, hijos, esFilaPropia: terceros.length > 0 && terceros.every((t) => t.esFilaPropia), diferencias: fila.tieneDiferencia ? 1 : 0, incompletas: fila.incompleto ? 1 : 0 };
  };
  return base.map(completar);
}

export function clavesDesplegablesTerceros(nodos: NodoVisorTerceros[]): string[] {
  return nodos.flatMap((n) => n.hijos.length ? [n.key, ...clavesDesplegablesTerceros(n.hijos)] : []);
}

/** Mantiene los ancestros y sus totales originales. La búsqueda de una cuenta
 * incluye su detalle; una búsqueda por tercero conserva solo ese tercero y su
 * ruta. Los filtros de importes usan el mismo parser del balance. */
export function filtrarArbolVisorTerceros(nodos: NodoVisorTerceros[], opciones: {
  q: string; clase: "todo" | "balance" | "er"; nivel: number;
  soloDiferencias: boolean; columnas: FiltrosColumnasTerceros;
  ocultarSinMovimiento?: boolean;
  identidad?: EstadoIdentidadTercero | "todas";
}): NodoVisorTerceros[] {
  const { columnas: f } = opciones;
  const textos = [opciones.q, f.codigo, f.cuenta, f.mapeo].map(normalizar);
  const caminar = (rama: NodoVisorTerceros[], heredados: boolean[]): NodoVisorTerceros[] => rama.flatMap((n) => {
    if (opciones.nivel && (n.tipo !== "cuenta" || n.nivel > opciones.nivel)) return [];
    if (opciones.soloDiferencias && n.tipo === "cuenta" && n.diferencias === 0) return [];
    const mapeo = n.mapeoInconsistente ? "inconsistente" : n.std ? `russell mapeado ${n.std}` : n.nivel >= 6 ? "sin mapeo" : "";
    const valores = [`${n.code} ${n.name} ${mapeo}`, n.code, n.name, mapeo].map(normalizar);
    const cumpleTextos = textos.map((q, i) => !q || heredados[i] || (i === 1 ? valores[i].startsWith(q) : valores[i].includes(q)));
    const hijos = caminar(n.hijos, cumpleTextos);
    // Un saldo final cero puede tener movimientos. Solo ocultar cuando las cuatro
    // columnas sean cero y tampoco haya movimientos hijos; no recalcular padres.
    if (opciones.ocultarSinMovimiento && n.tipo !== "cuenta" && !hijos.length && n.prevBalance === 0 && n.debe === 0 && n.haber === 0 && n.balance === 0) return [];
    if (opciones.identidad && opciones.identidad !== "todas" && !hijos.length && (!n.identidadTercero || estadoIdentidadTercero(n.identidadTercero) !== opciones.identidad)) return [];
    const estado = f.validacion === "todas" || (f.validacion === "incompleta" ? n.incompletas > 0 : f.validacion === "alerta" ? n.diferencias > 0 : n.diferencias === 0);
    const cumple = cumpleTextos.every(Boolean) && estado
      && coincideFiltroNumerico(n.prevBalance, f.saldoAnterior)
      && coincideFiltroNumerico(n.debe, f.debito)
      && coincideFiltroNumerico(n.haber, f.credito)
      && coincideFiltroNumerico(n.balance, f.saldo)
      && coincideFiltroNumerico(n.variation, f.variacion);
    return cumple || hijos.length ? [{ ...n, hijos }] : [];
  });
  const base = nodos.filter((n) => opciones.clase === "todo" || (opciones.clase === "balance" ? "123" : "4567").includes(n.clase));
  return caminar(base, textos.map(() => false));
}
