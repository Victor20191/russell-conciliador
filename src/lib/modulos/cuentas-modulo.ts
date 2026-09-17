// Cuentas estándar Russell (nivel 4) asociadas a un módulo de conciliación.
// La fuente de verdad del vínculo módulo → prefijo es el catálogo del
// prevalidador (`prevalidador_cuentas` / fábrica). El consolidado del módulo
// solo ofrece las cuentas de 4 dígitos cuyo código cae bajo esos prefijos.

import {
  normalizarPrefijo,
  PREVALIDADOR_CATALOGO_FABRICA,
  type BaseCalculo,
} from "@/lib/balance/prevalidador/catalogo";
import type { ConfiguracionCedula } from "./descriptores";

export type PrefijoModulo = { moduloCodigo: string; cuentaRussell: string; activa?: boolean };
export type SubgrupoOpcion = { codigo: string; nombre: string };

/**
 * Prefijos Russell (2 o 4 dígitos) del módulo. Si el catálogo vivo no trae filas
 * para ese módulo, cae al catálogo de fábrica (mismo criterio del prevalidador).
 */
export function prefijosCuentaModulo(
  moduloCodigo: string,
  catalogo: readonly PrefijoModulo[],
): string[] {
  const codigo = (moduloCodigo ?? "").trim().toUpperCase();
  if (!codigo) return [];

  const vivos = catalogo
    .filter((f) => f.moduloCodigo === codigo && f.activa !== false)
    .map((f) => normalizarPrefijo(f.cuentaRussell))
    .filter((p) => p.length === 2 || p.length === 4);

  const fuente = vivos.length > 0
    ? vivos
    : PREVALIDADOR_CATALOGO_FABRICA
        .filter((f) => f.moduloCodigo === codigo)
        .map((f) => normalizarPrefijo(f.cuentaRussell));

  return [...new Set(fuente)].sort();
}

/** ¿La cuenta de 4 dígitos pertenece a alguno de los prefijos del módulo? */
export function cuenta4DelModulo(cuenta4: string, prefijos: readonly string[]): boolean {
  const codigo = normalizarPrefijo(cuenta4).slice(0, 4);
  if (codigo.length !== 4 || prefijos.length === 0) return false;
  return prefijos.some((prefijo) => {
    const p = normalizarPrefijo(prefijo);
    if (!p) return false;
    // Prefijo de grupo (2): todas las cuentas 14xx. Prefijo exacto (4): solo esa.
    return codigo === p || codigo.startsWith(p);
  });
}

/** Filtra el catálogo de subgrupos estándar a las cuentas del módulo. */
export function filtrarSubgruposPorModulo<T extends SubgrupoOpcion>(
  subgrupos: readonly T[],
  prefijos: readonly string[],
): T[] {
  if (prefijos.length === 0) return [];
  return subgrupos.filter((s) => cuenta4DelModulo(s.codigo, prefijos));
}

// ===== Cédula contable a 6 dígitos (`nivelCruce: 6` del descriptor) =====
// Nómina cruza contra la cuenta Russell completa (510506 «Sueldos» y 510530 «Cesantías» son
// renglones distintos, RF-NOM-05). Los módulos a 4 dígitos siguen llaveando por el subgrupo;
// estas funciones deciden la clave de cada fila del balance y qué cuentas ofrece el módulo
// para homologar, según el nivel.

export type NivelCruce = 4 | 6;

/**
 * Clave de la cédula contable de una fila del balance homologada a `cuenta6Russell`: el
 * subgrupo (4) o la cuenta completa (6). `null` si la homologación no alcanza ese nivel (una
 * fila homologada a un subgrupo de 4 dígitos no puede entrar a una cédula de 6).
 */
export function claveCruceContable(cuenta6Russell: string | null | undefined, nivel: NivelCruce): string | null {
  const digitos = normalizarPrefijo(cuenta6Russell);
  if (digitos.length < nivel) return null;
  return digitos.slice(0, nivel);
}

/**
 * ¿La cuenta Russell (del nivel del cruce) pertenece al módulo? A 4 dígitos manda el prefijo
 * del prevalidador; a 6, además, la lista explícita de cuentas del descriptor
 * (`crucePorTercero.cuentasRussell6`) cuando la hay: Nómina concilia 510506 pero no 510548.
 */
export function cuentaDelModulo(
  cuenta: string,
  nivel: NivelCruce,
  prefijos: readonly string[],
  cuentasRussell6?: readonly string[] | null,
): boolean {
  const codigo = normalizarPrefijo(cuenta);
  if (codigo.length !== nivel) return false;
  if (!cuenta4DelModulo(codigo.slice(0, 4), prefijos)) return false;
  if (nivel === 6 && cuentasRussell6?.length) return cuentasRussell6.includes(codigo);
  return true;
}

/**
 * Cuentas estándar de 6 dígitos que el módulo ofrece para homologar (el datalist del
 * consolidado y la validación de la Server Action), en el orden del plan.
 */
export function filtrarCuentasEstandarPorModulo<T extends SubgrupoOpcion>(
  cuentas: readonly T[],
  prefijos: readonly string[],
  cuentasRussell6?: readonly string[] | null,
): T[] {
  return cuentas.filter((c) => cuentaDelModulo(c.codigo, 6, prefijos, cuentasRussell6));
}

// ===== Cédula contable resuelta: nivel, prefijos y ampliaciones del descriptor =====
// La cédula ya no depende solo del prevalidador: el descriptor puede sumar cuentas de 6 fuera de
// sus prefijos (Nómina 25xx, Ingresos 422005), abrir un subgrupo a 6 en una cédula a 4 (Activos
// fijos 1592) y cruzar un segundo valor del archivo contra una cuenta relacionada (la depreciación
// contra su 1592xx). Todo el que llavea la cédula (servidor, página, export, acciones, cierre)
// pasa por `cedulaModulo` + `claveCedula` para que la clave de una fila sea la misma en todos.

export type CedulaModulo = {
  nivel: NivelCruce;
  /** Prefijos del prevalidador (2 o 4 dígitos). */
  prefijos: readonly string[];
  /** Lista explícita de cuentas de 6 (`cedula.cuentas6` o `crucePorTercero.cuentasRussell6`); null = sin acotar. */
  lista6: ReadonlySet<string> | null;
  /** Cuenta de 6 adicional → su base de cálculo. */
  adicionales: ReadonlyMap<string, BaseCalculo>;
  /** Subgrupo abierto a 6 → naturaleza de presentación de sus cuentas. */
  abiertos: ReadonlyMap<string, "D" | "C">;
  /** Subgrupo del activo → cuenta de 6 donde cruza el valor relacionado. */
  relacionPorSubgrupo: ReadonlyMap<string, string>;
  /** Rol del archivo con el valor relacionado (`depreciacion`), o null. */
  rolRelacionado: string | null;
  /**
   * Cuentas Russell que el usuario asignó SOLO para un período (fuera de la cédula) → la base
   * del módulo. Claves del nivel de la cédula (6 díg., o subgrupos de 4 en las cédulas a 4).
   * Vacío en la cédula del descriptor; la amplía `cedulaDelPeriodo`.
   */
  delPeriodo: ReadonlyMap<string, BaseCalculo>;
};

/** Lo que `cedulaModulo` lee del descriptor (tipado estructural para no acoplar las pruebas). */
export type DescriptorCedula = {
  nivelCruce?: 4 | 6;
  cedula?: ConfiguracionCedula;
  crucePorTercero: { cuentasRussell6?: readonly string[] };
};

const seisDigitos = (v: string | null | undefined): string => {
  const d = normalizarPrefijo(v);
  return d.length >= 6 ? d.slice(0, 6) : "";
};

export function cedulaModulo(descriptor: DescriptorCedula | null | undefined, prefijos: readonly string[]): CedulaModulo {
  const cfg = descriptor?.cedula;
  const lista = cfg?.cuentas6 ?? descriptor?.crucePorTercero.cuentasRussell6;
  return {
    nivel: descriptor?.nivelCruce === 6 ? 6 : 4,
    prefijos,
    lista6: lista?.length ? new Set(lista) : null,
    adicionales: new Map((cfg?.cuentasAdicionales ?? []).map((a) => [normalizarPrefijo(a.cuenta), a.baseCalculo])),
    abiertos: new Map((cfg?.subgruposAbiertos ?? []).map((s) => [normalizarPrefijo(s.subgrupo), s.naturaleza])),
    relacionPorSubgrupo: new Map((cfg?.valorRelacionado?.pares ?? []).map((p) => [normalizarPrefijo(p.subgrupo), normalizarPrefijo(p.cuenta6)])),
    rolRelacionado: cfg?.valorRelacionado?.rol ?? null,
    delPeriodo: new Map(),
  };
}

/**
 * ¿Puede `codigo` entrar como cuenta DEL PERÍODO? Tiene la longitud de la cédula, la cédula no la
 * concilia ya y no es de un subgrupo abierto (la 1592xx de Activos fijos se deriva del activo).
 */
export function esCuentaExtraPosible(cedula: CedulaModulo, codigo: string): boolean {
  const c = normalizarPrefijo(codigo);
  if (c.length !== cedula.nivel) return false;
  if (cedula.abiertos.has(c.slice(0, 4))) return false;
  return !cuentaAsignableBase(cedula, c);
}

/**
 * La cédula de UN período: la del módulo más las cuentas que el usuario asignó solo para ese
 * cliente y período, con la base del módulo. Lo que la cédula ya concilia no se duplica.
 */
export function cedulaDelPeriodo(cedula: CedulaModulo, extras: readonly string[], base: BaseCalculo): CedulaModulo {
  const delPeriodo = new Map(cedula.delPeriodo);
  for (const codigo of extras) {
    const c = normalizarPrefijo(codigo);
    if (esCuentaExtraPosible(cedula, c)) delPeriodo.set(c, base);
  }
  return { ...cedula, delPeriodo };
}

/** Las cuentas del período (ya validadas), en orden. */
export function cuentasDelPeriodo(cedula: CedulaModulo): string[] {
  return [...cedula.delPeriodo.keys()].sort();
}

/** Base de una cuenta del período por su código de 6 o, en las cédulas a 4, por su subgrupo. */
export function baseDelPeriodo(cedula: CedulaModulo, cuenta6: string, sub4: string): BaseCalculo | undefined {
  return cedula.delPeriodo.get(cuenta6) ?? (cedula.nivel === 4 ? cedula.delPeriodo.get(sub4) : undefined);
}

/**
 * Cuentas de 6 que la cédula concilia por lista (`cedula.cuentas6` o `cuentasRussell6`) más las
 * adicionales. Nómina lo usa para decidir si un concepto cruza (gasto 51/52/72/73 y pasivos 25xx).
 */
export function cuentasCedula6(descriptor: DescriptorCedula | null | undefined, delPeriodo: readonly string[] = []): string[] {
  const lista = descriptor?.cedula?.cuentas6 ?? descriptor?.crucePorTercero.cuentasRussell6 ?? [];
  const adicionales = (descriptor?.cedula?.cuentasAdicionales ?? []).map((a) => normalizarPrefijo(a.cuenta));
  const extras = delPeriodo.map((c) => normalizarPrefijo(c)).filter((c) => c.length === 6);
  return [...new Set([...lista, ...adicionales, ...extras])];
}

/** ¿La cédula mezcla claves de 4 y de 6 dígitos? (módulo a 4 con cuentas de 6). */
export function cedulaMixta(cedula: CedulaModulo): boolean {
  return cedula.nivel === 4 && (cedula.adicionales.size > 0 || cedula.abiertos.size > 0);
}

/**
 * Clave de la cédula para una homologación (`cuenta6Russell` del balance, o `cuenta_6`/`cuenta_4`
 * de la consolidación del módulo), o `null` si no entra a la cédula al nivel que le toca:
 *  - una cuenta adicional es su propia clave, esté o no bajo los prefijos;
 *  - a 6, la cuenta completa (la lista la aplica el llamador: lo de fuera se informa aparte);
 *  - a 4, el subgrupo, salvo que esté abierto: ahí manda la cuenta de 6 y sin ella no hay clave.
 * No decide si la cuenta es del módulo (eso lo hacen `subgruposCedula`/`cuentaAsignableCedula`):
 * una asignación legada fuera del módulo conserva su clave, como antes. Una cuenta de 6 del
 * período es su propia clave, como las adicionales.
 */
export function claveCedula(cedula: CedulaModulo, cuenta6: string | null | undefined, cuenta4?: string | null): string | null {
  const c6 = seisDigitos(cuenta6);
  if (c6 && (cedula.adicionales.has(c6) || cedula.delPeriodo.has(c6))) return c6;
  const sub = c6 ? c6.slice(0, 4) : normalizarPrefijo(cuenta4).slice(0, 4) || normalizarPrefijo(cuenta6).slice(0, 4);
  if (sub.length !== 4) return null;
  if (cedula.nivel === 6 || cedula.abiertos.has(sub)) return c6 || null;
  return normalizarPrefijo(cuenta4).slice(0, 4) || sub;
}

/** ¿La cuenta de 6 queda fuera de la lista explícita del módulo? (se informa «fuera del módulo»). */
export function fueraDeListaCedula(cedula: CedulaModulo, cuenta6: string | null | undefined): boolean {
  const c6 = seisDigitos(cuenta6);
  if (!cedula.lista6 || !c6) return false;
  return !cedula.lista6.has(c6) && !cedula.adicionales.has(c6) && !cedula.delPeriodo.has(c6);
}

/**
 * ¿Es `codigo` una cuenta que el usuario puede asignarle a un clasificador? Las cuentas de un
 * subgrupo abierto NO: en Activos fijos la 1592xx se deriva por la relación con el activo.
 */
export function cuentaAsignableCedula(cedula: CedulaModulo, codigo: string): boolean {
  const c = normalizarPrefijo(codigo);
  if (cedula.delPeriodo.has(c)) return true;
  return cuentaAsignableBase(cedula, c);
}

/** Lo que la cédula del descriptor admite, sin las cuentas del período. */
function cuentaAsignableBase(cedula: CedulaModulo, c: string): boolean {
  if (c.length === 6 && cedula.adicionales.has(c)) return true;
  if (c.length !== cedula.nivel) return false;
  const sub = c.slice(0, 4);
  if (!cuenta4DelModulo(sub, cedula.prefijos)) return false;
  if (cedula.nivel === 4) return !cedula.abiertos.has(sub);
  return !cedula.lista6 || cedula.lista6.has(c);
}

/** Longitudes de cuenta que la cédula admite al asignar (4, 6 o ambas). */
export function longitudesCedula(cedula: CedulaModulo): ReadonlySet<number> {
  return new Set(cedula.nivel === 6 ? [6] : cedula.adicionales.size > 0 ? [4, 6] : [4]);
}

/**
 * Subgrupos de 4 cuyas cuentas homologadas pueden entrar a la cédula: los de los prefijos más los
 * de las cuentas adicionales (2510 en Nómina, 4220 en Ingresos).
 */
export function subgruposCedula(cedula: CedulaModulo, subgrupos: readonly SubgrupoOpcion[]): Set<string> {
  const codigos = new Set(filtrarSubgruposPorModulo(subgrupos, cedula.prefijos).map((s) => s.codigo));
  for (const c of cedula.adicionales.keys()) codigos.add(c.slice(0, 4));
  for (const c of cedula.delPeriodo.keys()) codigos.add(c.slice(0, 4));
  return codigos;
}

/**
 * Cuentas de 6 cuyos nombres necesita la cédula: `null` = todo el plan (un subgrupo abierto o una
 * cédula a 6 sin lista), `[]` = ninguna (cédula a 4 sin ampliaciones).
 */
export function cuentas6ACargarCedula(cedula: CedulaModulo): readonly string[] | null {
  if (cedula.abiertos.size > 0) return null;
  const delPeriodo6 = [...cedula.delPeriodo.keys()].filter((c) => c.length === 6);
  if (cedula.nivel === 6) return cedula.lista6 ? [...new Set([...cedula.lista6, ...cedula.adicionales.keys(), ...delPeriodo6])] : null;
  return [...new Set([...cedula.adicionales.keys(), ...delPeriodo6])];
}

/**
 * Cuentas que el Consolidado ofrece para asignar (el datalist y la validación de la acción): a 6,
 * las cuentas del plan de la lista; a 4, los subgrupos no abiertos; en ambos, las adicionales. Las
 * cuentas del período NO se listan aquí: son de ese período y la pantalla las muestra aparte.
 */
export function opcionesCedula<T extends SubgrupoOpcion>(cedula: CedulaModulo, subgrupos: readonly T[], cuentasEstandar: readonly T[]): T[] {
  const base = cedula.nivel === 6
    ? cuentasEstandar.filter((c) => cuentaAsignableBase(cedula, normalizarPrefijo(c.codigo)))
    : subgrupos.filter((s) => cuentaAsignableBase(cedula, normalizarPrefijo(s.codigo)));
  const vistos = new Set(base.map((c) => c.codigo));
  const extra = cuentasEstandar.filter((c) => cedula.adicionales.has(c.codigo) && !vistos.has(c.codigo));
  return [...base, ...extra].sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
}

/**
 * Llave de ORDEN de una clave de la cédula: la cuenta relacionada va justo debajo de su activo
 * (159205 tras 1516), el resto por código.
 */
export function ordenClaveCedula(cedula: CedulaModulo, clave: string): string {
  const primera = clave.split("+")[0] ?? clave;
  for (const [sub, c6] of cedula.relacionPorSubgrupo) if (c6 === primera) return `${sub}~${primera}`;
  return primera;
}

/**
 * Entradas del lado módulo por el VALOR RELACIONADO del archivo (depreciación): por clasificador,
 * suma en valor absoluto del rol hacia la cuenta de 6 relacionada con cada subgrupo asignado. Un
 * clasificador con depreciación cuyas cuentas no tienen relación (terrenos 1504) queda sin cuenta:
 * sale en el aviso «sin cuenta Russell» con el sufijo del rol, en vez de perderse.
 */
export function entradasValorRelacionado(
  cedula: CedulaModulo,
  detalles: readonly { clasificador: string | null; datos?: Record<string, unknown> | null }[],
  cuentasPorClasificador: ReadonlyMap<string, readonly string[]>,
  etiquetaRol: string,
): { clasificador: string; total: number; cuentas4: string[] }[] {
  const rol = cedula.rolRelacionado;
  if (!rol) return [];
  const suma = new Map<string, number>();
  for (const d of detalles) {
    const v = aNumero(d.datos?.[rol]);
    if (v == null || v === 0) continue;
    const clasificador = d.clasificador?.trim() || "(sin clasificar)";
    suma.set(clasificador, (suma.get(clasificador) ?? 0) + v);
  }
  const salida: { clasificador: string; total: number; cuentas4: string[] }[] = [];
  for (const [clasificador, bruto] of suma) {
    const total = Math.round(Math.abs(bruto) * 100) / 100;
    if (total === 0) continue;
    const cuentas = [...new Set((cuentasPorClasificador.get(clasificador) ?? [])
      .map((c) => cedula.relacionPorSubgrupo.get(c))
      .filter((c): c is string => !!c))].sort();
    salida.push({ clasificador: `${clasificador} · ${etiquetaRol}`, total, cuentas4: cuentas });
  }
  return salida.sort((a, b) => a.clasificador.localeCompare(b.clasificador));
}

// El transform guarda los roles monetarios como número; un texto solo cuenta si es un número limpio.
function aNumero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}
