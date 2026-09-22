// Homologación de CONCEPTOS de nómina a la cuenta Russell de 6 dígitos (RF-NOM-06…12).
//
// Un concepto del archivo («001 SALARIO BASICO», centro de costo «GYA») tiene que llegar a una
// cuenta Russell del gasto de personal (510506) para cruzar contra el balance. Hay cinco vías,
// en este orden, y cada una deja rastro (`via`) para que el auditor sepa de dónde salió:
//
//  1. `archivo`         la fila trae la cuenta contable del cliente (rol `cuenta`, o la columna
//                       de la clase del agrupador en Buk) y esa cuenta ya está homologada en el
//                       balance (`cuentas_cliente`, RF-NOM-10) o su estructura PUC la resuelve.
//  2. `memoria_exacta`  la memoria del cliente tiene el par (concepto, agrupador).
//  3. `memoria_clase`   la memoria tiene el concepto sin agrupador y una REGLA DE CLASE del
//                       agrupador (GYA → 51, MOD → 72): la cuenta base se transpone a esa clase.
//  3b. `memoria_clase`  la memoria tiene el concepto solo en OTROS agrupadores (el catálogo
//                       del ERP viene por área y el archivo trae el centro): con regla de clase
//                       se toma la cuenta de esa clase; con una sola cuenta distinta se usa.
//  3c. `memoria_centros` renglón SIN centro (el cargue no se separó por centro de costo) cuyo
//                       concepto no tiene cuenta Russell guardada sin centro pero sí en los
//                       centros: se PROPONE lo asignado ahí; no cruza hasta que se guarde.
//  4. `multi`           la memoria tiene el concepto con varias cuentas y no hay regla: la
//                       porción de cada lado la decide el auditor (reparto, RF-NOM-12).
//  5. `sugerido_nombre` sin memoria: el grupo RF-NOM-02 que sugiere el nombre + la clase del
//                       agrupador (o 51 por defecto) dan una cuenta A CONFIRMAR.
//
// Y `sin_cuenta` cuando nada aplica. Los conceptos cuya cuenta del cliente es de pasivo/activo/
// ingreso (libranzas 2370, retención 2365, préstamos 1365, intereses 4210) no cruzan contra el
// gasto: quedan con `destino: "control"` para el bloque «Control de deducciones» (D1); los de
// una clase de gasto ajena al módulo (61 asistencial) quedan con `destino: "fuera"`.
//
// Puro: sin BD. Las pruebas viven en `homologacion.test.ts`.

import { GRUPOS_CONCEPTO_NOMINA, grupoConcepto, grupoPorSubcuentaPuc, sugerirGrupoConcepto } from "./grupos-concepto";

/** Clases del gasto/costo de personal que concilia el módulo (D1). */
export const CLASES_NOMINA = ["51", "52", "72", "73"] as const;
export type ClaseNomina = (typeof CLASES_NOMINA)[number];

export function esClaseNomina(v: unknown): v is ClaseNomina {
  return typeof v === "string" && (CLASES_NOMINA as readonly string[]).includes(v);
}

/** Solo dígitos de una cuenta (del cliente o Russell), sin truncar. */
export function digitosCuenta(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Código de concepto CANÓNICO: sin espacios sobrantes y, cuando es numérico, sin ceros a la
 * izquierda. El catálogo SIIGO imprime « 01 », el módulo «001» y el papel del auditor «1»: son
 * el mismo concepto y tienen que llavear igual en la memoria y en el cruce. Los códigos con
 * letras («A01», «HED») se conservan tal cual (solo se recortan espacios).
 */
export function codigoConceptoCanonico(v: unknown): string {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/^\d+$/.test(t)) return String(Number.parseInt(t, 10));
  if (/^\d+\.0+$/.test(t)) return String(Number.parseInt(t, 10)); // «1.0» de un xlsx numérico
  return t;
}

/**
 * Subcuenta PUC (dígitos 5-6) de la cuenta del cliente: `51050601` → «06», `520518` → «18»,
 * `0005060000` (SIIGO, clase «00») → «06». `null` si no alcanza los 6 dígitos.
 */
export function subcuentaPucDe(cuentaCliente: unknown): string | null {
  const d = digitosCuenta(cuentaCliente);
  return d.length >= 6 ? d.slice(4, 6) : null;
}

/**
 * Clase (2 primeros dígitos) de la cuenta del cliente. «00» (SIIGO deja la clase a cargo del
 * centro de costo) → `null`: la cuenta Russell queda indeterminada entre 51/52/72 hasta que
 * haya regla de clase o reparto, aunque la subcuenta sí se conozca.
 */
export function claseDeCuentaCliente(cuentaCliente: unknown): string | null {
  const d = digitosCuenta(cuentaCliente);
  if (d.length < 2) return null;
  const clase = d.slice(0, 2);
  return clase === "00" ? null : clase;
}

/** Comodines que algunos ERP imprimen en vez de cuenta (8888, 999, 111, 222): no son cuentas. */
export function esCuentaComodin(cuentaCliente: unknown): boolean {
  const d = digitosCuenta(cuentaCliente);
  return d.length > 0 && /^(\d)\1+$/.test(d);
}

// ===== Transposición entre clases =====
// 5105 y 5205 comparten subcuenta Russell; 7205 numera por posición: 06→05, 30→10, 36→15,
// 39→20, 68→25, 69→30, 70→35, 95→40; 73 tiene una sola cuenta (730505).
const SUFIJO_51_A_72: Readonly<Record<string, string>> = {
  "06": "05", "30": "10", "36": "15", "39": "20", "68": "25", "69": "30", "70": "35", "95": "40",
};
const SUFIJO_72_A_51: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SUFIJO_51_A_72).map(([a, b]) => [b, a]),
);

/** Sufijo (dígitos 5-6) de una cuenta Russell 5105xx/5205xx equivalente a `cuenta6`, o null. */
function sufijo51De(cuenta6: string): string | null {
  const grupo = cuenta6.slice(0, 4);
  const suf = cuenta6.slice(4, 6);
  if (grupo === "5105" || grupo === "5205") return suf;
  if (grupo === "7205") return SUFIJO_72_A_51[suf] ?? null;
  if (grupo === "7305") return "06"; // MOI = sueldos de la mano de obra indirecta
  return null;
}

/**
 * La cuenta Russell de 6 dígitos equivalente en otra clase: `transponerClase("510506", "72")`
 * → «720505»; `("720510", "51")` → «510530»; `(*, "73")` → «730505». `null` si la cuenta no es
 * del gasto de personal o la clase no la tiene (7205 no tiene «comisiones» aparte: cae en 05).
 */
export function transponerClase(cuenta6: string, clase: ClaseNomina): string | null {
  const c = digitosCuenta(cuenta6);
  if (c.length !== 6) return null;
  const suf = sufijo51De(c);
  if (!suf) return null;
  if (clase === "51") return `5105${suf}`;
  if (clase === "52") return `5205${suf}`;
  if (clase === "72") {
    const s72 = SUFIJO_51_A_72[suf];
    return s72 ? `7205${s72}` : null;
  }
  return "730505";
}

/**
 * ¿La cuenta Russell de 6 dígitos NO es de una clase de gasto de personal? Son los pasivos que la
 * cédula de Nómina concilia (251010, 251505, 252005, 252505): no se transponen entre clases.
 */
export function sinClaseDeGasto(cuenta6: string): boolean {
  const c = digitosCuenta(cuenta6);
  return c.length === 6 && !esClaseNomina(c.slice(0, 2));
}

/** Clase Russell de una cuenta Russell de 6 dígitos (51/52/72/73), o null. */
export function claseDeCuentaRussell(cuenta6: string | null | undefined): ClaseNomina | null {
  const c = digitosCuenta(cuenta6).slice(0, 2);
  return esClaseNomina(c) ? c : null;
}

/**
 * Cuenta Russell por defecto de un grupo RF-NOM-02 en una clase: `cuentaPorGrupo("cesantias",
 * "72")` → «720510». `null` si el grupo no existe.
 */
export function cuentaPorGrupo(grupoId: string, clase: ClaseNomina): string | null {
  const g = grupoConcepto(grupoId);
  if (!g) return null;
  return transponerClase(`5105${g.sufijoRussell}`, clase);
}

/**
 * Cuenta Russell derivada de la ESTRUCTURA PUC de la cuenta del cliente cuando el balance aún
 * no la homologó: clase 51/52/72/73 + subcuenta PUC → grupo → cuenta Russell. `52050601` →
 * 520506; `72051501` (horas extras en producción) → 720505; `61050506` (INCODOL) → null (61 no
 * es clase del módulo). Es una derivación, no la memoria del balance: el llamador la marca así.
 */
export function cuentaRussellPorEstructura(cuentaCliente: unknown): string | null {
  const clase = claseDeCuentaCliente(cuentaCliente);
  const sub = subcuentaPucDe(cuentaCliente);
  if (!clase || !sub || !esClaseNomina(clase)) return null;
  const grupo = grupoPorSubcuentaPuc(sub) ?? "otros";
  return cuentaPorGrupo(grupo, clase);
}

// ===== Reglas de clase por agrupador =====

/**
 * Clase que sugiere el VALOR del agrupador del archivo: «51/52/72/73» literales (DAN), «GYA»,
 * «ADMON», «GA», «CA» → 51; «GV», «CV», «VENTAS» → 52; «MOD», «CP», «PRODUCCIÓN», «PLANTA» → 72;
 * «MOI» → 73. `null` si no se reconoce (Kakaraka 1/5/10/20). Sugerencia: la confirma el auditor.
 */
export function sugerirClaseAgrupador(agrupador: unknown): ClaseNomina | null {
  const t = String(agrupador ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
  if (!t) return null;
  const d = t.replace(/\D/g, "");
  if (/^\d+$/.test(t) && esClaseNomina(d.slice(0, 2)) && d.length >= 2 && d.length <= 8) return d.slice(0, 2) as ClaseNomina;
  if (/^(MOI|MANO DE OBRA INDIRECTA|INDIRECT)/.test(t)) return "73";
  if (/^(MOD|MANO DE OBRA DIRECTA|CP|COSTO|PRODUCCION|PLANTA|OPERAT|OPERACION|DIRECT)/.test(t) || /PRODUCCION|PLANTA/.test(t)) return "72";
  if (/^(GV|CV|VENTA|COMERCIAL|MERCADEO)/.test(t) || /VENTA|COMERCIAL/.test(t)) return "52";
  if (/^(GYA|GA|CA|ADMON|ADMIN|GASTO)/.test(t) || /ADMINISTRA|ADMON/.test(t)) return "51";
  return null;
}

// ===== Resolución =====

export type ViaHomologacion = "archivo" | "memoria_exacta" | "memoria_clase" | "memoria_centros" | "multi" | "sugerido_nombre" | "sin_cuenta";

/** Fila de la memoria del cliente (`consolidacion_modulo_cliente` del módulo NOM). */
export type FilaHomologacion = {
  clasificador: string;
  /** '' = aplica a cualquier agrupador. */
  agrupador?: string | null;
  /** Cuenta Russell de 6 dígitos; '' o null cuando la memoria solo tiene la cuenta del cliente. */
  cuenta6?: string | null;
  cuentaCliente?: string | null;
  grupo?: string | null;
  subcuentaPuc?: string | null;
};

export type EntradaConcepto = {
  /** Código del concepto (se canoniza aquí). */
  clasificador: string;
  /** Centro de costo / grupo del archivo ('' si no trae). */
  agrupador?: string | null;
  /** Nombre del concepto (para la sugerencia por nombre). */
  nombre?: string | null;
  /** Cuenta contable del cliente que trae la fila (rol `cuenta`). */
  cuentaArchivo?: string | null;
  /** Buk: una columna por clase (Administrativo / Ventas / MOD / MOI) con la cuenta del cliente. */
  cuentasPorClaseArchivo?: Partial<Record<ClaseNomina, string | null | undefined>>;
};

export type ContextoHomologacion = {
  memoria: readonly FilaHomologacion[];
  /** agrupador → clase (tabla `clase_agrupador_modulo`). */
  reglasClase?: ReadonlyMap<string, ClaseNomina>;
  /** `cuentas_cliente`: cuenta del cliente (exacta o grupo de 6) → cuenta Russell de 6. */
  mapeoCliente?: ReadonlyMap<string, string>;
  /** Cuentas Russell del módulo (D1). */
  cuentasRussell6: readonly string[];
};

export type ResolucionConcepto = {
  /** Cuentas Russell candidatas (una, varias en `multi`, ninguna en `sin_cuenta`/control). */
  cuentas: string[];
  via: ViaHomologacion;
  /**
   * `gasto` cruza contra la cédula (51/52/72/73 y los pasivos 25xx que Nómina concilia);
   * `control` va al bloque de deducciones (los demás pasivos, activos e ingresos); `fuera` es
   * gasto/costo de una clase que el módulo no concilia (61 asistencial).
   */
  destino: "gasto" | "control" | "fuera" | null;
  clase: ClaseNomina | null;
  grupo: string | null;
  subcuentaPuc: string | null;
  cuentaCliente: string | null;
  /** Explicación corta para la UI. */
  motivo: string;
};

function claveMemoria(clasificador: string, agrupador: string): string {
  return `${codigoConceptoCanonico(clasificador)}|${agrupador.trim().toUpperCase()}`;
}

/** Índice de la memoria por (concepto, agrupador) → filas. */
export function indexarMemoria(memoria: readonly FilaHomologacion[]): Map<string, FilaHomologacion[]> {
  const m = new Map<string, FilaHomologacion[]>();
  for (const f of memoria) {
    const k = claveMemoria(f.clasificador, f.agrupador ?? "");
    m.set(k, [...(m.get(k) ?? []), f]);
    // Todas las filas del concepto, con cualquier agrupador (vía 3b: memoria de otros centros).
    const todas = claveMemoria(f.clasificador, "*");
    m.set(todas, [...(m.get(todas) ?? []), f]);
  }
  return m;
}

/**
 * Cuenta Russell de una cuenta del cliente: memoria del balance primero (exacta, luego el grupo
 * de 6), estructura PUC después. `null` si es comodín o no resuelve.
 */
export function resolverCuentaClienteARussell(
  cuentaCliente: unknown,
  mapeoCliente: ReadonlyMap<string, string> | undefined,
): { cuenta6: string; origen: "balance" | "estructura" } | null {
  const d = digitosCuenta(cuentaCliente);
  if (d.length < 6 || esCuentaComodin(d)) return null;
  const memoria = mapeoCliente?.get(d) ?? mapeoCliente?.get(d.slice(0, 6));
  if (memoria && digitosCuenta(memoria).length === 6) return { cuenta6: digitosCuenta(memoria), origen: "balance" };
  const estructura = cuentaRussellPorEstructura(d);
  return estructura ? { cuenta6: estructura, origen: "estructura" } : null;
}

/** ¿La cuenta del cliente es del gasto/costo (clase 5/6/7)? Si no, es de control (D1). */
export function destinoDeCuentaCliente(cuentaCliente: unknown): "gasto" | "control" | null {
  const d = digitosCuenta(cuentaCliente);
  if (d.length < 2) return null;
  const clase1 = d[0];
  if (clase1 === "0") return "gasto"; // SIIGO «00»: la clase la pone el centro de costo, pero es gasto
  return clase1 === "5" || clase1 === "6" || clase1 === "7" ? "gasto" : "control";
}

export function resolverCuentaConcepto(entrada: EntradaConcepto, ctx: ContextoHomologacion, indice?: Map<string, FilaHomologacion[]>): ResolucionConcepto {
  const idx = indice ?? indexarMemoria(ctx.memoria);
  const agrupador = String(entrada.agrupador ?? "").trim();
  const clasificador = codigoConceptoCanonico(entrada.clasificador);
  const claseRegla = agrupador ? ctx.reglasClase?.get(agrupador) ?? ctx.reglasClase?.get(agrupador.toUpperCase()) ?? null : null;
  const delModulo = (c: string) => ctx.cuentasRussell6.includes(c);
  const base = (over: Partial<ResolucionConcepto>): ResolucionConcepto => ({
    cuentas: [],
    via: "sin_cuenta",
    destino: null,
    clase: claseRegla,
    grupo: null,
    subcuentaPuc: null,
    cuentaCliente: null,
    motivo: "",
    ...over,
  });

  // 1) Cuenta del archivo (RF-NOM-10). En Buk, la columna de la clase del agrupador.
  const cuentaArchivo = entrada.cuentaArchivo ?? (claseRegla ? entrada.cuentasPorClaseArchivo?.[claseRegla] : null) ?? null;
  if (cuentaArchivo && !esCuentaComodin(cuentaArchivo) && digitosCuenta(cuentaArchivo).length >= 6) {
    const d = digitosCuenta(cuentaArchivo);
    const sub = subcuentaPucDe(d);
    const grupo = grupoPorSubcuentaPuc(sub) ?? sugerirGrupoConcepto(entrada.nombre);
    const destino = destinoDeCuentaCliente(d);
    const r = resolverCuentaClienteARussell(d, ctx.mapeoCliente);
    // Un pasivo que la cédula SÍ concilia (cesantías 251010, homologada en el balance) cruza como
    // cualquier cuenta del módulo; el resto de pasivos va al control de deducciones.
    if (destino === "control" && !(r && delModulo(r.cuenta6))) {
      return base({ via: "archivo", destino, cuentaCliente: d, subcuentaPuc: sub, grupo, motivo: `La cuenta ${d} del archivo no es de gasto: va al control de deducciones.` });
    }
    if (r && delModulo(r.cuenta6)) {
      return base({
        cuentas: [r.cuenta6],
        via: "archivo",
        destino: "gasto",
        clase: claseDeCuentaRussell(r.cuenta6),
        grupo,
        subcuentaPuc: sub,
        cuentaCliente: d,
        motivo: r.origen === "balance" ? `Cuenta ${d} del archivo, homologada en el balance a ${r.cuenta6}.` : `Cuenta ${d} del archivo, derivada por su estructura PUC a ${r.cuenta6}.`,
      });
    }
    // Clase «00» (SIIGO) o cuenta sin homologar: se sigue con la memoria, guardando la subcuenta.
    const memoriaCon00 = resolverDesdeMemoria(clasificador, agrupador, claseRegla, idx, ctx, entrada.nombre, base);
    if (memoriaCon00.via !== "sin_cuenta") return { ...memoriaCon00, cuentaCliente: d, subcuentaPuc: memoriaCon00.subcuentaPuc ?? sub, grupo: memoriaCon00.grupo ?? grupo };
    const clase = claseRegla ?? claseDeCuentaCliente(d);
    if (grupo && esClaseNomina(clase)) {
      const cuenta = cuentaPorGrupo(grupo, clase);
      if (cuenta && delModulo(cuenta)) {
        return base({ cuentas: [cuenta], via: "sugerido_nombre", destino: "gasto", clase, grupo, subcuentaPuc: sub, cuentaCliente: d, motivo: `Cuenta ${d} del archivo sin homologar: sugerida por grupo «${grupo}» en la clase ${clase}.` });
      }
    }
    const claseArchivo = claseDeCuentaCliente(d);
    if (claseArchivo && !esClaseNomina(claseArchivo)) {
      return base({ via: "archivo", destino: "fuera", grupo, subcuentaPuc: sub, cuentaCliente: d, motivo: `La cuenta ${d} del archivo es de la clase ${claseArchivo}, que Nómina no concilia (solo 51/52/72/73).` });
    }
    return base({ via: "sin_cuenta", destino: "gasto", grupo, subcuentaPuc: sub, cuentaCliente: d, motivo: `La cuenta ${d} del archivo no está homologada en el balance ni su clase se conoce.` });
  }

  return resolverDesdeMemoria(clasificador, agrupador, claseRegla, idx, ctx, entrada.nombre, base);
}

function resolverDesdeMemoria(
  clasificador: string,
  agrupador: string,
  claseRegla: ClaseNomina | null,
  idx: Map<string, FilaHomologacion[]>,
  ctx: ContextoHomologacion,
  nombre: string | null | undefined,
  base: (o: Partial<ResolucionConcepto>) => ResolucionConcepto,
): ResolucionConcepto {
  const delModulo = (c: string) => ctx.cuentasRussell6.includes(c);
  const cuentasDe = (filas: FilaHomologacion[]) => [...new Set(filas.map((f) => digitosCuenta(f.cuenta6)).filter((c) => c.length === 6))];
  // Lo descriptivo (grupo, subcuenta PUC, cuenta del cliente) sale de las filas del renglón y, si
  // ahí falta, de la fila BASE del concepto (agrupador vacío = todos los centros). Una cuenta asignada
  // «solo para el período» a un centro no trae esos datos: sin el respaldo, el concepto quedaba sin
  // subcuenta y fuera de la vista por subcuenta (Kakaraka, concepto 8 → 519505 en la subcuenta 18).
  const filasBase = idx.get(claveMemoria(clasificador, "")) ?? [];
  const metaDe = (filas: FilaHomologacion[], respaldo: FilaHomologacion[] = []) => ({
    grupo: filas.find((f) => f.grupo)?.grupo ?? respaldo.find((f) => f.grupo)?.grupo ?? null,
    subcuentaPuc: filas.find((f) => f.subcuentaPuc)?.subcuentaPuc ?? respaldo.find((f) => f.subcuentaPuc)?.subcuentaPuc ?? null,
    cuentaCliente: filas.find((f) => f.cuentaCliente)?.cuentaCliente ?? respaldo.find((f) => f.cuentaCliente)?.cuentaCliente ?? null,
  });
  const esControl = (filas: FilaHomologacion[]) => filas.length > 0 && cuentasDe(filas).length === 0 && filas.every((f) => destinoDeCuentaCliente(f.cuentaCliente) === "control");
  // Memoria sin Russell cuya cuenta del cliente es gasto de una clase ajena al módulo (61…).
  const claseFuera = (filas: FilaHomologacion[]): string | null => {
    if (filas.length === 0 || cuentasDe(filas).length > 0) return null;
    const clases = filas.map((f) => claseDeCuentaCliente(f.cuentaCliente)).filter((c): c is string => !!c);
    if (clases.length !== filas.length || clases.some((c) => esClaseNomina(c) || destinoDeCuentaCliente(c) !== "gasto")) return null;
    return clases[0];
  };

  // 2) Memoria exacta (concepto, agrupador).
  const exacta = agrupador ? idx.get(claveMemoria(clasificador, agrupador)) ?? [] : [];
  if (exacta.length > 0) {
    const cuentas = cuentasDe(exacta);
    const meta = metaDe(exacta, filasBase);
    if (esControl(exacta)) return base({ via: "memoria_exacta", destino: "control", ...meta, motivo: `Memoria del cliente para «${agrupador}»: cuenta ${meta.cuentaCliente} de control.` });
    const fueraExacta = claseFuera(exacta);
    if (fueraExacta) return base({ via: "memoria_exacta", destino: "fuera", ...meta, motivo: `Memoria del cliente para «${agrupador}»: cuenta ${meta.cuentaCliente} de la clase ${fueraExacta}, que Nómina no concilia.` });
    if (cuentas.length > 0) {
      return base({ cuentas, via: cuentas.length > 1 ? "multi" : "memoria_exacta", destino: "gasto", clase: cuentas.length === 1 ? claseDeCuentaRussell(cuentas[0]) : claseRegla, ...meta, motivo: cuentas.length > 1 ? `Memoria del cliente para «${agrupador}» con ${cuentas.length} cuentas: la porción de cada una la define el auditor.` : `Memoria del cliente para «${agrupador}».` });
    }
  }

  // 3c) Renglón SIN centro cuyo concepto no tiene cuenta Russell guardada sin centro (a lo sumo
  //     la fila del catálogo con la cuenta del cliente) pero sí en los centros: se PROPONE lo que
  //     el auditor asignó ahí —memoria y «Solo {período}»—, porque un cargue sin separar por centro
  //     no encuentra el par (concepto, centro) (Kakaraka: 1 → 510506/520506/720505 en los centros
  //     1, 5, 10 y 20). Gana a la fila del catálogo, que sin cuenta Russell solo listaría las clases
  //     posibles o la marcaría de control. No cruza hasta que se guarde.
  if (!agrupador && cuentasDe(filasBase).length === 0) {
    const enCentros = (idx.get(claveMemoria(clasificador, "*")) ?? []).filter((f) => (f.agrupador ?? "").trim() !== "");
    const cuentas = cuentasDe(enCentros).filter(delModulo);
    if (cuentas.length > 0) {
      const centros = [...new Set(enCentros.filter((f) => cuentas.includes(digitosCuenta(f.cuenta6))).map((f) => String(f.agrupador).trim()))]
        .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
      return base({
        cuentas,
        via: "memoria_centros",
        destino: "gasto",
        clase: cuentas.length === 1 ? claseDeCuentaRussell(cuentas[0]) : null,
        ...metaDe(filasBase, enCentros),
        motivo: `Lo que asignaste a este concepto en ${centros.length === 1 ? "el centro" : "los centros"} ${centros.join(", ")}. Guárdalo para usarlo sin centro${cuentas.length > 1 ? "; la porción de cada cuenta se reparte en el cruce" : ""}.`,
      });
    }
  }

  // 3/4) Memoria base (concepto sin agrupador).
  if (filasBase.length > 0) {
    const meta = metaDe(filasBase);
    if (esControl(filasBase)) return base({ via: "memoria_exacta", destino: "control", ...meta, motivo: `Memoria del cliente: cuenta ${meta.cuentaCliente} de control.` });
    const fueraBase = claseFuera(filasBase);
    if (fueraBase) return base({ via: "memoria_exacta", destino: "fuera", ...meta, motivo: `Memoria del cliente: cuenta ${meta.cuentaCliente} de la clase ${fueraBase}, que Nómina no concilia.` });
    const cuentas = cuentasDe(filasBase);
    if (claseRegla) {
      // Los pasivos de la cédula (251010…) no tienen clase de gasto: se conservan tal cual.
      const transpuestas = [...new Set(cuentas.map((c) => (sinClaseDeGasto(c) ? c : transponerClase(c, claseRegla))).filter((c): c is string => !!c && delModulo(c)))];
      if (transpuestas.length === 0 && meta.grupo) {
        const porGrupo = cuentaPorGrupo(meta.grupo, claseRegla);
        if (porGrupo && delModulo(porGrupo)) transpuestas.push(porGrupo);
      }
      if (transpuestas.length > 0) {
        return base({ cuentas: transpuestas, via: transpuestas.length > 1 ? "multi" : "memoria_clase", destino: "gasto", clase: claseRegla, ...meta, motivo: `Memoria del cliente llevada a la clase ${claseRegla} de «${agrupador}».` });
      }
    }
    if (cuentas.length === 1) return base({ cuentas, via: "memoria_exacta", destino: "gasto", clase: claseDeCuentaRussell(cuentas[0]), ...meta, motivo: "Memoria del cliente." });
    if (cuentas.length > 1) return base({ cuentas, via: "multi", destino: "gasto", clase: claseRegla, ...meta, motivo: `Memoria del cliente con ${cuentas.length} cuentas: la porción de cada una la define el auditor (o una regla de clase para «${agrupador || "el agrupador"}»).` });
    // Memoria solo con la cuenta del cliente (clase «00»): grupo + clase conocida.
    const grupo = meta.grupo ?? grupoPorSubcuentaPuc(meta.subcuentaPuc) ?? sugerirGrupoConcepto(nombre);
    if (grupo && claseRegla) {
      const cuenta = cuentaPorGrupo(grupo, claseRegla);
      if (cuenta && delModulo(cuenta)) return base({ cuentas: [cuenta], via: "memoria_clase", destino: "gasto", clase: claseRegla, ...meta, grupo, motivo: `Grupo «${grupo}» de la memoria en la clase ${claseRegla} de «${agrupador}».` });
    }
    if (grupo) {
      const candidatas = CLASES_NOMINA.map((cl) => cuentaPorGrupo(grupo, cl)).filter((c): c is string => !!c && delModulo(c));
      return base({ cuentas: [...new Set(candidatas)], via: "multi", destino: "gasto", ...meta, grupo, motivo: `La cuenta ${meta.cuentaCliente ?? "del cliente"} no fija la clase: la porción por clase la define el auditor cuadrando contra el balance.` });
    }
  }

  // 3b) Memoria del concepto en OTROS centros (el catálogo del ERP viene por área —ADMON,
  //     PRODUCCIÓN— y el archivo trae el centro de costo): con regla de clase se toma la cuenta
  //     de esa clase; con una sola cuenta distinta se usa; con varias, reparto.
  const otras = (idx.get(claveMemoria(clasificador, "*")) ?? []).filter((f) => (f.agrupador ?? "").trim() !== "");
  if (otras.length > 0 && cuentasDe(otras).length > 0) {
    const meta = metaDe(otras);
    const cuentas = cuentasDe(otras).filter(delModulo);
    if (claseRegla) {
      const fijas = cuentas.filter(sinClaseDeGasto);
      const deClase = cuentas.filter((c) => claseDeCuentaRussell(c) === claseRegla);
      const deGasto = deClase.length > 0 ? deClase : cuentas.map((c) => transponerClase(c, claseRegla)).filter((c): c is string => !!c && delModulo(c));
      const transpuestas = [...new Set([...deGasto, ...fijas])];
      if (transpuestas.length > 0) {
        return base({ cuentas: transpuestas, via: transpuestas.length > 1 ? "multi" : "memoria_clase", destino: "gasto", clase: claseRegla, ...meta, motivo: `Memoria del cliente en otros centros llevada a la clase ${claseRegla} de «${agrupador || "el agrupador"}».` });
      }
    }
    if (cuentas.length === 1) return base({ cuentas, via: "memoria_clase", destino: "gasto", clase: claseDeCuentaRussell(cuentas[0]), ...meta, motivo: `Memoria del cliente en otros centros (${[...new Set(otras.map((f) => f.agrupador))].join(", ")}).` });
    if (cuentas.length > 1) return base({ cuentas: [...new Set(cuentas)], via: "multi", destino: "gasto", clase: claseRegla, ...meta, motivo: `Memoria del cliente en otros centros con ${new Set(cuentas).size} cuentas: fija la clase de «${agrupador || "el agrupador"}» o reparte en el cruce.` });
  }

  // 5) Sugerencia por nombre.
  const grupo = sugerirGrupoConcepto(nombre);
  if (grupo) {
    const clase = claseRegla ?? "51";
    const cuenta = cuentaPorGrupo(grupo, clase);
    if (cuenta && delModulo(cuenta)) {
      return base({ cuentas: [cuenta], via: "sugerido_nombre", destino: "gasto", clase, grupo, motivo: `Sugerida por el nombre («${grupoConcepto(grupo)?.etiqueta ?? grupo}») en la clase ${clase}${claseRegla ? "" : " por defecto"}. Confírmala.` });
    }
  }
  return base({ via: "sin_cuenta", motivo: "Sin memoria ni cuenta en el archivo: asigna la cuenta a mano." });
}

// ===== Reparto (RF-NOM-12 / D4) =====

/**
 * Reparto PROPORCIONAL de `total` entre las cuentas candidatas según el movimiento del balance
 * en cada una (D4: «la porción por clase se sugiere cuadrando contra el balance»). Redondea a
 * pesos y deja el residuo en la cuenta de mayor movimiento para que la Σ sea exacta. Si el
 * balance no tiene movimiento en ninguna, reparte por partes iguales.
 */
export function sugerirReparto(total: number, movimientoPorCuenta: Readonly<Record<string, number>>): Record<string, number> {
  const cuentas = Object.keys(movimientoPorCuenta);
  if (cuentas.length === 0) return {};
  const pesos = cuentas.map((c) => Math.max(0, Math.abs(movimientoPorCuenta[c] ?? 0)));
  const suma = pesos.reduce((a, b) => a + b, 0);
  const proporciones = suma > 0 ? pesos.map((p) => p / suma) : cuentas.map(() => 1 / cuentas.length);
  const reparto: Record<string, number> = {};
  let asignado = 0;
  cuentas.forEach((c, i) => {
    reparto[c] = Math.round(total * proporciones[i]);
    asignado += reparto[c];
  });
  const mayor = cuentas.reduce((m, c, i) => (pesos[i] > pesos[cuentas.indexOf(m)] ? c : m), cuentas[0]);
  reparto[mayor] = Math.round((reparto[mayor] + (total - asignado)) * 100) / 100;
  return reparto;
}

/** Grupos del catálogo que son aportes patronales/provisiones (para el aviso D2). */
export function gruposAportePatronal(): string[] {
  return GRUPOS_CONCEPTO_NOMINA.filter((g) => g.aportePatronal).map((g) => g.id);
}
