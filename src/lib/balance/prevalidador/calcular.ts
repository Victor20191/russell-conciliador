// Cálculo del PREVALIDADOR de homologación. PURO: sin BD, sin `server-only`, sin
// formateo. Los loaders RSC le pasan las mismas filas de `balance_prueba_detalle`
// que ya usan para `reconstruirBalance`, y él devuelve el view-model del informe.
//
// QUÉ COMPARA (y por qué no es una tautología): las dos cifras salen de las MISMAS
// filas del detalle, pero agregadas por COLUMNAS DISTINTAS.
//
//   lado Russell → agrupa por prefijo de `cuenta6Russell` (la cuenta estándar que
//                  el auditor le asignó a la cuenta al homologar)
//   lado cliente → agrupa por prefijo de `cuenta8` (el código original del PUC del
//                  cliente, tal como venía en su archivo)
//
// Si la homologación respetó la equivalencia natural, los dos lados coinciden. Si
// una 6105 del cliente terminó homologada a la 4175 de Russell, el prefijo 41 acusa
// la diferencia. Ese es todo el valor del informe.
//
// NO propone, NO sugiere y NO corrige nada: solo agrega, resta y avisa.

import { claseNatura, limpiarCodigo } from "@/lib/balance/calcular";
import {
  type BaseCalculo,
  type FilaCatalogoPrevalidador,
  type OverridePrevalidador,
  normalizarPrefijo,
  ordenModulo,
} from "./catalogo";

/** Subconjunto de `FilaDetallePersistida` que necesita el prevalidador. */
export type FilaPrevalidador = {
  cuenta8: string;
  nombreCuenta: string;
  cuenta6Russell: string | null;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

/** Un lado (Russell o cliente) de una fila del informe. */
export type LadoPrevalidador = {
  /** Prefijo con el que se agregó. */
  prefijo: string;
  /** Distingue una cuenta realmente presente con valor $0 de una cuenta ausente. */
  encontrada: boolean;
  /** Cuántas filas del detalle entraron en la suma. */
  cuentas: number;
  /** Saldo agregado, ya en convención de PRESENTACIÓN (ver `factorPresentacion`). */
  saldoFinal: number;
};

/**
 * Cuenta agrupadora excluida del cálculo porque coexiste con descendientes. Mantener
 * ambas inflaría los dos lados al agregar por prefijo.
 */
export type AnidamientoPrevalidador = {
  cuenta8: string;
  nombreCuenta: string;
  cuenta6Russell: string | null;
  /** Cuántas cuentas más largas del mismo balance la tienen como prefijo. */
  descendientes: number;
};

export type ResumenSinHomologar = {
  cuentas: number;
  /** Σ del monto de las cuentas sin homologar, en magnitud. */
  monto: number;
};

/**
 * Prefijo del PUC del CLIENTE presente en este balance, con lo que agrupa. Alimenta
 * el selector de «cuenta del cliente»: en vez de escribir el código a mano, el
 * usuario elige de lo que el balance realmente tiene, viendo el saldo de cada
 * opción. Los saldos van en BRUTO (firmados, sin factor de presentación): quien
 * pinta aplica el factor de la fila, que depende de la cuenta de Russell.
 */
export type OpcionCuentaCliente = {
  prefijo: string;
  /** 2 = grupo, 4 = cuenta. */
  nivel: 2 | 4;
  /** Cuántas filas del detalle agrupa. */
  cuentas: number;
  /** Σ saldo final (bruto). */
  saldo: number;
  /** Σ (débitos − créditos) (bruto). */
  movimiento: number;
  /** Nombre de la cuenta de mayor cuantía del grupo, para reconocerlo. */
  nombre: string;
};

export type FilaPrevalidadorVM = {
  /** id de la fila del catálogo. `0` = fila de fábrica: no admite override. */
  catalogoId: number;
  cuentaRussell: string;
  etiqueta: string | null;
  baseCalculo: BaseCalculo;
  /** Cuenta del cliente contra la que se comparó (el override, o la de Russell). */
  cuentaCliente: string;
  /** `true` si la cuenta del cliente viene de un override guardado. */
  personalizada: boolean;
  russell: LadoPrevalidador;
  cliente: LadoPrevalidador;
  /** `cliente − russell`, ya en convención de presentación. */
  diferencia: number;
  coincide: boolean;
  /** Cuentas anidadas que caen en alguno de los dos prefijos de esta fila. */
  anidamientos: string[];
};

export type ModuloPrevalidadorVM = {
  codigo: string;
  nombre: string;
  filas: FilaPrevalidadorVM[];
  totalRussell: number;
  totalCliente: number;
  diferenciaTotal: number;
  coincide: boolean;
};

/**
 * Resultado del informe. Unión discriminada a propósito: el BLOQUEO por homologación
 * incompleta es parte del contrato del cálculo, no un criterio que decida la UI.
 */
export type PrevalidadorVM =
  | { estado: "no_disponible"; mensaje: string }
  | { estado: "sin_catalogo" }
  | { estado: "bloqueado"; sinHomologar: ResumenSinHomologar }
  | {
      estado: "listo";
      modulos: ModuloPrevalidadorVM[];
      /** Agrupadoras efectivamente excluidas para impedir doble conteo. */
      anidamientos: AnidamientoPrevalidador[];
      /** Prefijos del cliente presentes en el balance, para el selector de cuenta. */
      opcionesCliente: OpcionCuentaCliente[];
      filasConDiferencia: number;
      modulosConDiferencia: number;
    };

/**
 * Redondea a los 2 decimales del `Decimal(18,2)` para que las sumas no arrastren
 * ruido. El `+ 0` normaliza el cero negativo: sin él, un saldo que se anula en una
 * cuenta de naturaleza crédito se pinta como «-0».
 */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100 + 0 || 0;
}

/**
 * Factor de presentación de una fila: −1 para las clases de naturaleza crédito
 * (2 pasivo, 3 patrimonio, 4 ingresos, 9 orden), 1 para el resto.
 *
 * Internamente los saldos están firmados (débito +, crédito −), así que un pasivo
 * está en negativo. Se muestran en su naturaleza y en positivo, igual que hace
 * `sums` en `calcular.ts` y la pestaña «Saldos por clase» de la misma pantalla —y
 * que la propia plantilla de Russell, donde todas las cifras son positivas.
 *
 * El factor sale SIEMPRE del prefijo de Russell y se aplica IGUAL a los dos lados.
 * Derivarlo por separado en cada lado sería un error: un override que apunte a una
 * clase de naturaleza contraria daría factores opuestos y la resta se convertiría en
 * una suma.
 */
export function factorPresentacion(cuentaRussell: string): 1 | -1 {
  return claseNatura(normalizarPrefijo(cuentaRussell)) === "C" ? -1 : 1;
}

/** Monto BRUTO (firmado, sin factor de presentación) de una fila según la base. */
export function montoBase(fila: FilaPrevalidador, base: BaseCalculo): number {
  return base === "movimiento" ? fila.debitos - fila.creditos : fila.saldoFinal;
}

/** ¿La fila quedó sin homologar? (sin cuenta estándar Russell asignada). */
function sinHomologar(fila: FilaPrevalidador): boolean {
  return normalizarPrefijo(fila.cuenta6Russell) === "";
}

/**
 * Cuentas sin homologar y cuánto pesan. El monto usa el saldo final y, cuando es
 * cero (típico de cuentas de resultado en balances que no arrastran saldo inicial),
 * cae al movimiento del período para no reportar "$0" con cuentas pendientes.
 */
export function resumenSinHomologar(filas: FilaPrevalidador[]): ResumenSinHomologar {
  let cuentas = 0;
  let monto = 0;
  for (const f of filas) {
    if (!sinHomologar(f)) continue;
    cuentas += 1;
    const saldo = Math.abs(f.saldoFinal);
    monto += saldo !== 0 ? saldo : Math.abs(f.debitos - f.creditos);
  }
  return { cuentas, monto: redondear(monto) };
}

/**
 * Cuentas del detalle que son prefijo ESTRICTO de otra cuenta del MISMO balance
 * (p. ej. `1105` conviviendo con `110505`). Cuando el borrador clasifica como
 * movimiento tanto la agrupadora como sus hijas, ambas llegan al detalle y agregarlas
 * por prefijo las cuenta DOS VECES (ver `conForzarHoja` en `calcular.ts`).
 *
 * El prevalidador excluye esas agrupadoras y devuelve esta lista para dejar visible
 * qué filas no participaron en los importes.
 *
 * Mismo truco que `conForzarHoja`: un Set con todos los prefijos propios responde en
 * O(1) «¿este código es prefijo de otro más largo?».
 */
export function detectarAnidamientos(filas: FilaPrevalidador[]): AnidamientoPrevalidador[] {
  const prefijos = new Set<string>();
  const codigos: string[] = [];
  for (const f of filas) {
    const c = limpiarCodigo(f.cuenta8);
    codigos.push(c);
    for (let i = 1; i < c.length; i++) prefijos.add(c.slice(0, i));
  }
  // Los códigos que aparecen como prefijo de otro son los anidados.
  const descendientes = new Map<string, number>();
  for (const c of codigos) if (c.length > 0 && prefijos.has(c)) descendientes.set(c, 0);
  if (descendientes.size === 0) return [];
  // Segundo barrido O(n·L) para contar descendientes sin comparar código contra código.
  for (const c of codigos) {
    for (let i = 1; i < c.length; i++) {
      const p = c.slice(0, i);
      const actual = descendientes.get(p);
      if (actual !== undefined) descendientes.set(p, actual + 1);
    }
  }
  const porCodigo = new Map<string, FilaPrevalidador>();
  for (const f of filas) {
    const c = limpiarCodigo(f.cuenta8);
    if (descendientes.has(c) && !porCodigo.has(c)) porCodigo.set(c, f);
  }
  return [...descendientes.entries()]
    .map(([cuenta8, n]) => ({
      cuenta8,
      nombreCuenta: porCodigo.get(cuenta8)?.nombreCuenta ?? "",
      cuenta6Russell: normalizarPrefijo(porCodigo.get(cuenta8)?.cuenta6Russell) || null,
      descendientes: n,
    }))
    .sort((a, b) => a.cuenta8.localeCompare(b.cuenta8));
}

/**
 * Acumulador por prefijo: se guardan AMBAS bases porque cada fila del catálogo elige
 * la suya. `nombre` es el de la cuenta de mayor cuantía del grupo, para rotular el
 * prefijo en el selector sin inventar nada.
 */
type Bucket = { saldo: number; movimiento: number; cuentas: number; nombre: string; mayor: number };

const bucketVacio = (): Bucket => ({ saldo: 0, movimiento: 0, cuentas: 0, nombre: "", mayor: -1 });

function acumular(mapa: Map<string, Bucket>, clave: string, fila: FilaPrevalidador): void {
  let b = mapa.get(clave);
  if (!b) {
    b = bucketVacio();
    mapa.set(clave, b);
  }
  b.saldo += fila.saldoFinal;
  b.movimiento += fila.debitos - fila.creditos;
  b.cuentas += 1;
  const cuantia = Math.abs(fila.saldoFinal) || Math.abs(fila.debitos - fila.creditos);
  if (cuantia > b.mayor) {
    b.mayor = cuantia;
    b.nombre = fila.nombreCuenta;
  }
}

/** Índices por longitud de prefijo: `indice.get(2)!.get("13")`. */
type IndicePrefijos = Map<number, Map<string, Bucket>>;

/**
 * Indexa las filas por prefijo, una pasada por longitud requerida (en la práctica 2
 * y 4). Cada longitud tiene su PROPIO mapa: si se compartiera, una cuenta más corta
 * que la longitud pedida (`"13"` recortada a 4 sigue siendo `"13"`) caería en la
 * misma clave para varias longitudes y se sumaría dos veces.
 *
 * Con mapas separados, `"13"` queda en `indice[2]["13"]` y en `indice[4]["13"]`, y
 * nunca dentro de `indice[4]["1330"]`: una cuenta solo cuenta en un prefijo cuando
 * coincide en TODOS sus caracteres.
 */
function indexarPorPrefijo(
  filas: FilaPrevalidador[],
  longitudes: number[],
): { russell: IndicePrefijos; cliente: IndicePrefijos } {
  const russell: IndicePrefijos = new Map(longitudes.map((L) => [L, new Map<string, Bucket>()]));
  const cliente: IndicePrefijos = new Map(longitudes.map((L) => [L, new Map<string, Bucket>()]));
  for (const f of filas) {
    const codCliente = limpiarCodigo(f.cuenta8);
    const codRussell = normalizarPrefijo(f.cuenta6Russell);
    for (const L of longitudes) {
      if (codCliente.length > 0) acumular(cliente.get(L)!, codCliente.slice(0, L), f);
      if (codRussell.length > 0) acumular(russell.get(L)!, codRussell.slice(0, L), f);
    }
  }
  return { russell, cliente };
}

function leerLado(
  indice: IndicePrefijos,
  prefijo: string,
  base: BaseCalculo,
  factor: 1 | -1,
): LadoPrevalidador {
  const b = indice.get(prefijo.length)?.get(prefijo);
  if (!b) return { prefijo, encontrada: false, cuentas: 0, saldoFinal: 0 };
  const bruto = base === "movimiento" ? b.movimiento : b.saldo;
  return { prefijo, encontrada: true, cuentas: b.cuentas, saldoFinal: redondear(factor * bruto) };
}

/**
 * Prefijos de grupo (2) y cuenta (4) presentes en el balance del cliente, ordenados
 * por código. Se descartan los que no agrupan nada. Un código más corto que el nivel
 * (p. ej. una cuenta `13` en el índice de 4) no se ofrece como opción de ese nivel:
 * ya está en el de 2 y duplicarlo confundiría.
 */
function opcionesDeCliente(cliente: IndicePrefijos): OpcionCuentaCliente[] {
  const opciones: OpcionCuentaCliente[] = [];
  for (const nivel of [2, 4] as const) {
    for (const [prefijo, b] of cliente.get(nivel) ?? []) {
      if (b.cuentas === 0 || prefijo.length !== nivel) continue;
      opciones.push({
        prefijo,
        nivel,
        cuentas: b.cuentas,
        saldo: redondear(b.saldo),
        movimiento: redondear(b.movimiento),
        nombre: b.nombre,
      });
    }
  }
  return opciones.sort((a, b) => a.prefijo.localeCompare(b.prefijo));
}

/**
 * Construye el informe del prevalidador.
 *
 * @param filas     detalle del balance (una fila por cuenta imputable del cliente)
 * @param catalogo  filas del catálogo módulo → cuenta Russell
 * @param overrides cuentas propias del cliente, por fila del catálogo
 */
export function construirPrevalidador(
  filas: FilaPrevalidador[],
  catalogo: FilaCatalogoPrevalidador[],
  overrides: OverridePrevalidador[],
): PrevalidadorVM {
  // 1) Catálogo utilizable.
  const activas = catalogo
    .filter((c) => c.activa && normalizarPrefijo(c.cuentaRussell) !== "")
    .map((c) => ({ ...c, cuentaRussell: normalizarPrefijo(c.cuentaRussell) }));
  if (activas.length === 0) return { estado: "sin_catalogo" };

  // 2) Excluir agrupadoras que conviven con descendientes. Esas filas representan el
  //    mismo importe resumido que luego reaparece en sus hijos y no pueden participar
  //    en ninguna de las dos caras sin inflar el resultado. La lista se conserva en
  //    el VM para explicar exactamente qué se excluyó.
  const anidamientos = detectarAnidamientos(filas);
  const codigosExcluidos = new Set(anidamientos.map((a) => a.cuenta8));
  const filasCalculables = filas.filter((f) => !codigosExcluidos.has(limpiarCodigo(f.cuenta8)));

  // 3) Compuerta: con cuentas sin homologar los lados no son comparables (su saldo
  //    falta en el lado Russell y sí está en el del cliente), así que toda diferencia
  //    sería falsa. Se bloquea el informe en vez de mostrar números engañosos.
  //    Una agrupadora excluida no bloquea: tampoco aporta importe al informe.
  const pendientes = resumenSinHomologar(filasCalculables);
  if (pendientes.cuentas > 0) return { estado: "bloqueado", sinHomologar: pendientes };

  // 4) Cuenta del cliente vigente por fila (override guardado, o la misma de Russell).
  const porCatalogoId = new Map<number, string>();
  for (const o of overrides) {
    const cuenta = normalizarPrefijo(o.cuentaCliente);
    if (cuenta !== "") porCatalogoId.set(o.catalogoId, cuenta);
  }
  const resueltas = activas.map((c) => {
    const override = c.id > 0 ? porCatalogoId.get(c.id) : undefined;
    const cuentaCliente = override && override !== c.cuentaRussell ? override : c.cuentaRussell;
    return { ...c, cuentaCliente, personalizada: cuentaCliente !== c.cuentaRussell };
  });

  // Dos prefijos del CLIENTE que se contienen dentro del mismo módulo harían que
  // una misma fila participara dos veces en el total (p. ej. `22` y `2205`). La
  // Server Action y la BD impiden crear el caso, pero el cálculo vuelve a fallar
  // cerrado para proteger datos legados o escrituras externas.
  for (let i = 0; i < resueltas.length; i += 1) {
    const actual = resueltas[i];
    for (let j = i + 1; j < resueltas.length; j += 1) {
      const otra = resueltas[j];
      if (actual.moduloCodigo !== otra.moduloCodigo) continue;
      if (
        actual.cuentaCliente.startsWith(otra.cuentaCliente) ||
        otra.cuentaCliente.startsWith(actual.cuentaCliente)
      ) {
        return {
          estado: "no_disponible",
          mensaje: `Las cuentas cliente ${actual.cuentaCliente} y ${otra.cuentaCliente} se solapan dentro de ${actual.moduloNombre}.`,
        };
      }
    }
  }

  // 5) Índices por prefijo. Además de las longitudes que el catálogo pide, se
  //    indexan siempre grupo (2) y cuenta (4): son los niveles que ofrece el
  //    selector de cuenta del cliente.
  const longitudes = [
    ...new Set([2, 4, ...resueltas.flatMap((c) => [c.cuentaRussell.length, c.cuentaCliente.length])]),
  ].sort((a, b) => a - b);
  const { russell, cliente } = indexarPorPrefijo(filasCalculables, longitudes);

  // 6) Filas del informe, con los datos de agrupación al lado (no dentro) para que
  //    el view-model que sale no cargue campos que la vista no necesita.
  type FilaAgrupable = { modulo: { codigo: string; nombre: string }; orden: number; vm: FilaPrevalidadorVM };
  const filasVM: FilaAgrupable[] = resueltas.map((c) => {
    const factor = factorPresentacion(c.cuentaRussell);
    const ladoRussell = leerLado(russell, c.cuentaRussell, c.baseCalculo, factor);
    const ladoCliente = leerLado(cliente, c.cuentaCliente, c.baseCalculo, factor);
    const diferencia = redondear(ladoCliente.saldoFinal - ladoRussell.saldoFinal);
    return {
      modulo: { codigo: c.moduloCodigo, nombre: c.moduloNombre },
      orden: c.orden,
      vm: {
        catalogoId: c.id,
        cuentaRussell: c.cuentaRussell,
        etiqueta: c.etiqueta,
        baseCalculo: c.baseCalculo,
        cuentaCliente: c.cuentaCliente,
        personalizada: c.personalizada,
        russell: ladoRussell,
        cliente: ladoCliente,
        diferencia,
        // Ambos lados deben existir. Dos ausencias o una cuenta ausente con valor
        // aparente $0 nunca equivalen a una comprobación satisfactoria.
        coincide: ladoRussell.encontrada && ladoCliente.encontrada && diferencia === 0,
        anidamientos: anidamientos
          .filter(
            (a) =>
              a.cuenta8.startsWith(c.cuentaCliente) ||
              (a.cuenta6Russell != null && a.cuenta6Russell.startsWith(c.cuentaRussell)),
          )
          .map((a) => a.cuenta8),
      },
    };
  });

  // 7) Agrupación por módulo y totales. El total por módulo es la suma de sus filas:
  //    una cifra que no existe en ningún balance (puede mezclar activo y pasivo) pero
  //    que Russell pidió expresamente porque es lo que va a conciliar.
  const porModulo = new Map<string, FilaAgrupable[]>();
  for (const f of filasVM) {
    const acc = porModulo.get(f.modulo.codigo);
    if (acc) acc.push(f);
    else porModulo.set(f.modulo.codigo, [f]);
  }
  const modulos: ModuloPrevalidadorVM[] = [...porModulo.entries()]
    .map(([codigo, fs]) => {
      const ordenadas = [...fs].sort(
        (a, b) => a.orden - b.orden || a.vm.cuentaRussell.localeCompare(b.vm.cuentaRussell),
      );
      const filasModulo = ordenadas.map((f) => f.vm);
      const totalRussell = redondear(filasModulo.reduce((s, f) => s + f.russell.saldoFinal, 0));
      const totalCliente = redondear(filasModulo.reduce((s, f) => s + f.cliente.saldoFinal, 0));
      const diferenciaTotal = redondear(totalCliente - totalRussell);
      return {
        codigo,
        nombre: ordenadas[0].modulo.nombre,
        filas: filasModulo,
        totalRussell,
        totalCliente,
        diferenciaTotal,
        coincide:
          filasModulo.every((f) => f.russell.encontrada && f.cliente.encontrada) &&
          diferenciaTotal === 0,
      };
    })
    .sort((a, b) => ordenModulo(a.codigo) - ordenModulo(b.codigo) || a.nombre.localeCompare(b.nombre));

  // 8) Prefijos del cliente que existen de verdad en este balance, para que elegir
  //    la cuenta sea escoger de una lista con saldos y no escribir un código a ciegas.
  const opcionesCliente = opcionesDeCliente(cliente);

  return {
    estado: "listo",
    modulos,
    anidamientos,
    opcionesCliente,
    filasConDiferencia: modulos.reduce((s, m) => s + m.filas.filter((f) => !f.coincide).length, 0),
    modulosConDiferencia: modulos.filter((m) => !m.coincide).length,
  };
}
