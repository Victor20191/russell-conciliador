import "server-only";

/**
 * Cruce contable de un cargue de módulo, resuelto contra la BD.
 *
 * Es el MISMO cálculo que pinta la pestaña «Cruce contable» de
 * `/modulos/[codigo]/[id]` y el que verifica la Server Action al CERRAR la
 * conciliación: una sola implementación para que la precondición del cierre
 * («cuadra o todas las diferencias tienen marca») se evalúe sobre exactamente lo
 * que vio el usuario. La página aporta los insumos que ya cargó; la acción los
 * carga con `cargarInsumosCruceModulo`.
 */
import prisma from "@/lib/prisma";
import { fmtDateTime } from "@/lib/format";
import { descriptorModulo, bloqueoCrucePorVerificacionesCriticasModulo, nivelCruceModulo } from "@/lib/modulos/descriptores";
import { claveCruceContable, cuenta4DelModulo, filtrarSubgruposPorModulo, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { construirCruceContable, type HijoContableCruce, type ResumenCruceContable } from "@/lib/modulos/cruce-contable";
import { anotarCruceConMarcas, type FilaCruceMarcada, type MarcaCruce, type ResumenMarcas } from "@/lib/modulos/marcas-cruce";
import { calcularValorContableModulo } from "@/lib/modulos/valor-contable";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";
import {
  baseBalanceParaRango,
  cuentasAgrupadorasExcluidas,
  seleccionarBalanceCruceModulo,
  validarCompuertaPrevalidador,
  validarRangoBalanceModulo,
  type RangoCargue,
} from "@/lib/modulos/compuerta-cruce";
import { construirConfigMapeoCliente } from "@/lib/balance/mapeo-cliente-config";
import { construirConsolidadoNomina } from "@/lib/modulos/nomina/consolidado-nomina";
import { esClaseNomina, sugerirReparto, type ClaseNomina } from "@/lib/modulos/nomina/homologacion";
import {
  construirControlDeducciones,
  construirVistaSubcuenta,
  entradasCruceFormalNomina,
  type BaseContableNomina,
  type RepartoConcepto,
  type ResultadoCruceNomina,
} from "@/lib/modulos/nomina/cruce-nomina";

export type InsumosCruceModulo = {
  encabezado: {
    id: number;
    clienteId: number;
    nombreCliente: string;
    moduloCodigo: string;
    periodo: string;
    /** Nómina: mes inicial del rango del cargue (D7); null = un mes. */
    periodoDesde?: string | null;
    verificaciones: unknown;
    /** `datos` solo hace falta en Nómina (agrupador, cuenta del archivo, subcuenta). */
    detalles: { clasificador: string | null; valor: number; datos?: Record<string, unknown> }[];
  };
  /**
   * `cuenta6` solo importa en los módulos que cruzan a 6 dígitos (`nivelCruce: 6`); las demás
   * columnas (agrupador, grupo, subcuenta, cuenta del cliente) solo las usa Nómina.
   */
  consolidacionRows: {
    clasificador: string;
    cuenta4: string;
    cuenta6?: string | null;
    agrupador?: string | null;
    descripcion?: string | null;
    grupo?: string | null;
    subcuentaPuc?: string | null;
    cuentaCliente?: string | null;
  }[];
  subgrupos: { codigo: string; nombre: string }[];
  /**
   * Cuentas estándar de 6 dígitos (nombre de cada renglón de una cédula a ese nivel).
   * Opcional: los módulos a 4 dígitos no la necesitan; a 6, sin ella los renglones salen sin nombre.
   */
  cuentasEstandar?: { codigo: string; nombre: string }[];
  catalogoPrevalidador: Awaited<ReturnType<typeof getCatalogoPrevalidador>>;
};

export type BalanceFuenteCruce = {
  id: number;
  version: string;
  periodo: string;
  periodoInicio: string;
  periodoFin: string;
  esOficial: boolean;
  estaCongelado: boolean;
};

export type ResultadoCruceModulo = {
  balanceEmparejado: BalanceFuenteCruce | null;
  bloqueo: string | null;
  cruceContable: ResumenCruceContable | null;
  /** Cuentas del cliente que aportan a cada fila del cruce (el desglose al expandir). */
  detalleContablePorCuenta: Record<string, HijoContableCruce[]>;
  sinMapeoContable: { total: number; filas: number } | null;
  sinReglaContableFilas: number;
  marcas: MarcaCruce[];
  filasMarcadas: FilaCruceMarcada[];
  resumenMarcas: ResumenMarcas | null;
  /**
   * Del saldo contable de las cuentas de 4 dígitos, lo que está en cuentas Russell de seis que
   * el módulo no concilia (en Cartera, 130515 de trabajadores). Informativo: una cédula a 4
   * lo incluye porque compara por subgrupo (el cruce por tercero no lo concilia); una cédula
   * a 6 (Nómina) lo deja fuera de sus renglones y solo lo informa.
   */
  fueraDelModulo: { total: number; filas: number; porCuenta: Record<string, number> } | null;
  /** Solo Nómina: rango, base contable, vista por subcuenta, control de deducciones y repartos. */
  nomina: ResultadoCruceNomina | null;
};

export type { ResultadoCruceNomina, RepartoPendienteVm } from "@/lib/modulos/nomina/cruce-nomina";

export async function cargarInsumosCruceModulo(encabezadoId: number): Promise<InsumosCruceModulo | null> {
  const encabezado = await prisma.moduloDatoEncabezado.findUnique({
    where: { id: encabezadoId },
    select: {
      id: true,
      clienteId: true,
      nombreCliente: true,
      moduloCodigo: true,
      periodo: true,
      periodoDesde: true,
      verificaciones: true,
    },
  });
  if (!encabezado) return null;
  const descriptor = descriptorModulo(encabezado.moduloCodigo);
  // El JSON de cada fila solo hace falta en Nómina (agrupador, cuenta del archivo): en
  // Cartera/CxP son cientos de miles de filas y no se lee.
  const conDatos = descriptor?.nomina != null;
  const [detalles, consolidacionRows, subgrupos, cuentasEstandar, catalogoPrevalidador] = await Promise.all([
    prisma.moduloDatoDetalle.findMany({ where: { encabezadoId }, select: { clasificador: true, valor: true, datos: conDatos }, orderBy: { filaNum: "asc" } }),
    prisma.consolidacionModuloCliente.findMany({
      where: { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo },
      select: { clasificador: true, cuenta4: true, cuenta6: true, agrupador: true, descripcion: true, grupo: true, subcuentaPuc: true, cuentaCliente: true },
    }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true }, orderBy: { codigo: "asc" } }),
    nivelCruceModulo(descriptor) === 6 ? cargarCuentasEstandarCruce(descriptor?.crucePorTercero.cuentasRussell6) : Promise.resolve([]),
    getCatalogoPrevalidador(),
  ]);
  return {
    encabezado: {
      ...encabezado,
      detalles: detalles.map((d) => ({ clasificador: d.clasificador, valor: Number(d.valor), ...(conDatos ? { datos: (d.datos ?? {}) as Record<string, unknown> } : {}) })),
    },
    consolidacionRows,
    subgrupos,
    cuentasEstandar,
    catalogoPrevalidador,
  };
}

/** Lo que el cruce de Nómina necesita además de los insumos comunes. */
async function cargarInsumosNomina(clienteId: number, moduloCodigo: string, periodo: string): Promise<{ reglasClase: Map<string, ClaseNomina>; mapeoCliente: Map<string, string>; repartos: RepartoConcepto[] }> {
  const [reglas, cuentas, repartosRows] = await Promise.all([
    prisma.claseAgrupadorModulo.findMany({ where: { clienteId, moduloCodigo }, select: { agrupador: true, clase: true } }),
    prisma.clientAccount.findMany({
      where: { clienteId, cuenta6Russell: { not: null } },
      select: { code: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoEn: true },
    }),
    prisma.repartoCruceModulo.findMany({ where: { clienteId, moduloCodigo, periodo }, select: { clasificador: true, cuentaRussell: true, valor: true } }),
  ]);
  const repartos = new Map<string, Record<string, number>>();
  for (const r of repartosRows) {
    const v = repartos.get(r.clasificador) ?? {};
    v[r.cuentaRussell] = Number(r.valor);
    repartos.set(r.clasificador, v);
  }
  return {
    reglasClase: new Map(reglas.filter((r) => esClaseNomina(r.clase)).map((r) => [r.agrupador, r.clase as ClaseNomina])),
    mapeoCliente: new Map([...construirConfigMapeoCliente(cuentas).entries()].map(([k, v]) => [k, v.std])),
    repartos: [...repartos.entries()].map(([clasificador, valores]) => ({ clasificador, valores })),
  };
}

/**
 * Cuentas estándar de 6 dígitos que nombran los renglones de una cédula a ese nivel. Con la
 * lista del descriptor se traen solo esas; sin ella, todo el plan (se filtra por prefijo después).
 */
export async function cargarCuentasEstandarCruce(cuentasRussell6?: readonly string[] | null): Promise<{ codigo: string; nombre: string }[]> {
  const filas = await prisma.standardAccount.findMany({
    where: cuentasRussell6?.length ? { code: { in: [...cuentasRussell6] } } : {},
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });
  return filas
    .map((f) => ({ codigo: f.code.replace(/\D/g, ""), nombre: f.name }))
    .filter((f) => f.codigo.length === 6);
}

/**
 * Cruce contable completo: selección del balance del período, compuerta del
 * prevalidador, agregado contable por cuenta Russell de 4 díg., cédula y marcas.
 */
export async function construirCruceContableModulo(insumos: InsumosCruceModulo): Promise<ResultadoCruceModulo> {
  const { encabezado, consolidacionRows, subgrupos, cuentasEstandar, catalogoPrevalidador } = insumos;
  const moduloCodigo = encabezado.moduloCodigo;
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) {
    return vacio(null, `Módulo ${moduloCodigo} no reconocido.`);
  }
  // Nivel de la cédula: el subgrupo (4) o, en Nómina, la cuenta Russell completa (6). Una
  // homologación del cliente que no llegue al nivel (cuenta4 sin cuenta6 en un módulo a 6)
  // deja el clasificador «sin cuenta»: no se adivina la cuenta completa a partir del subgrupo.
  const nivel = nivelCruceModulo(descriptor);

  const cuentasPorClasificador = new Map<string, string[]>();
  for (const r of consolidacionRows) {
    const clave = nivel === 6 ? claveCruceContable(r.cuenta6, 6) : r.cuenta4;
    if (!clave) continue;
    const lista = cuentasPorClasificador.get(r.clasificador) ?? [];
    lista.push(clave);
    cuentasPorClasificador.set(r.clasificador, lista);
  }
  for (const [k, v] of cuentasPorClasificador) cuentasPorClasificador.set(k, [...new Set(v)].sort());
  const nombrePorCuenta = new Map([
    ...subgrupos.map((s) => [s.codigo, s.nombre] as const),
    ...(cuentasEstandar ?? []).map((c) => [c.codigo, c.nombre] as const),
  ]);
  const prefijosModulo = prefijosCuentaModulo(moduloCodigo, catalogoPrevalidador);
  const codigosModulo = new Set(filtrarSubgruposPorModulo(subgrupos, prefijosModulo).map((c) => c.codigo));
  const verifGuardadas = (encabezado.verificaciones ?? {}) as Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>;

  // Nómina: rango del cargue (D7), consolidado por (concepto, centro) con la homologación
  // resuelta y los repartos guardados; el lado módulo de la cédula sale de ahí.
  const rango: RangoCargue | null = descriptor.nomina ? { desde: encabezado.periodoDesde ?? encabezado.periodo, hasta: encabezado.periodo } : null;
  const insumosNomina = descriptor.nomina ? await cargarInsumosNomina(encabezado.clienteId, moduloCodigo, encabezado.periodo) : null;
  const consolidadoNomina = descriptor.nomina && insumosNomina
    ? construirConsolidadoNomina({
        detalle: encabezado.detalles.map((d) => ({ clasificador: d.clasificador, valor: d.valor, datos: d.datos ?? {} })),
        memoria: consolidacionRows.map((r) => ({ ...r, agrupador: r.agrupador ?? "", cuenta6: r.cuenta6 ?? "" })),
        reglasClase: insumosNomina.reglasClase,
        mapeoCliente: insumosNomina.mapeoCliente,
        cuentasRussell6: descriptor.crucePorTercero.cuentasRussell6 ?? [],
      })
    : null;
  const formalNomina = consolidadoNomina && insumosNomina ? entradasCruceFormalNomina(consolidadoNomina.renglones, insumosNomina.repartos) : null;
  const consolidado = consolidarPorClasificador(encabezado.detalles.map((d) => ({ clasificador: d.clasificador, valor: d.valor })));

  // Para módulos de movimiento se prioriza el balance oficial y congelado que cubra
  // exactamente el mes calendario; después, la compuerta común exige que ese balance
  // conserve una aprobación vigente del prevalidador.
  const balancesConfirmados = await prisma.balancePruebaEncabezado.findMany({
    where: { clienteId: encabezado.clienteId },
    select: { id: true, periodo: true, periodoInicio: true, periodoFin: true, version: true, esOficial: true, estaCongelado: true },
    orderBy: [{ esOficial: "desc" }, { periodoFin: "desc" }, { id: "desc" }],
  });
  const emparejado = seleccionarBalanceCruceModulo(balancesConfirmados, catalogoPrevalidador, moduloCodigo, encabezado.periodo, rango);
  const baseNomina: BaseContableNomina | null = emparejado && rango ? baseBalanceParaRango(emparejado.periodoInicio, emparejado.periodoFin, rango) : null;
  const balanceEmparejado: BalanceFuenteCruce | null = emparejado
    ? {
        id: emparejado.id,
        version: emparejado.version,
        periodo: emparejado.periodo,
        periodoInicio: emparejado.periodoInicio.toISOString().slice(0, 10),
        periodoFin: emparejado.periodoFin.toISOString().slice(0, 10),
        esOficial: emparejado.esOficial,
        estaCongelado: emparejado.estaCongelado,
      }
    : null;

  let cruceContable: ResumenCruceContable | null = null;
  let sinMapeoContable: { total: number; filas: number } | null = null;
  let sinReglaContableFilas = 0;
  const cuentasRussell6 = descriptor.crucePorTercero.cuentasRussell6?.length ? new Set(descriptor.crucePorTercero.cuentasRussell6) : null;
  const fuera = { total: 0, filas: 0, porCuenta: {} as Record<string, number> };
  let bloqueo = bloqueoCrucePorVerificacionesCriticasModulo(descriptor, verifGuardadas);
  let contextoBalance: Awaited<ReturnType<typeof cargarContextoPrevalidadorBalance>> | null = null;

  if (emparejado && !bloqueo) {
    try {
      contextoBalance = await cargarContextoPrevalidadorBalance(emparejado.id);
      bloqueo =
        validarCompuertaPrevalidador(contextoBalance, encabezado.clienteId, moduloCodigo) ??
        validarRangoBalanceModulo(contextoBalance, moduloCodigo, encabezado.periodo, rango);
    } catch {
      bloqueo = "No fue posible verificar de forma íntegra el prevalidador del balance seleccionado.";
    }
  }
  // Las marcas se leen ANTES de agregar: traen las cuentas marcadas NO MODULARES, que se
  // descuentan del lado contable al construir el cruce. Viven por (cliente, módulo,
  // período), NO por cargue.
  const marcasPeriodo = await prisma.marcaCruceModulo.findMany({
    where: { clienteId: encabezado.clienteId, moduloCodigo, periodo: encabezado.periodo, dimension: "cuenta4" },
    orderBy: { numero: "asc" },
    select: {
      cuenta4: true, numero: true, nota: true, referenciaAnexo: true, diferencia: true, comentarioId: true, marcadoPor: true, marcadoEn: true,
      adjuntos: { orderBy: { id: "asc" }, select: { id: true, nombreArchivo: true, tipoContenido: true, tamanoBytes: true } },
      noModulares: { orderBy: { cuenta8: "asc" }, select: { cuenta8: true, nombreCuenta: true, valorAlMarcar: true } },
    },
  });
  const excluidas = new Set(marcasPeriodo.flatMap((m) => m.noModulares.map((n) => n.cuenta8)));

  const detalleContablePorCuenta: Record<string, HijoContableCruce[]> = {};
  let nomina: ResultadoCruceNomina | null = null;
  if (emparejado && contextoBalance && !bloqueo) {
    const cuentasAgrupadoras = cuentasAgrupadorasExcluidas(contextoBalance.prevalidador);
    const contablePorCuenta: Record<string, number> = {};
    const noModularPorCuenta: Record<string, number> = {};
    let sinMapeoTotal = 0;
    let sinMapeoFilas = 0;
    for (const d of contextoBalance.filas) {
      const cuenta8 = d.cuenta8.replace(/\D/g, "");
      if (cuentasAgrupadoras.has(cuenta8)) continue;
      const cuenta4 = cuenta8.slice(0, 4);
      const filaContable = { debitos: d.debitos, creditos: d.creditos, saldoFinal: d.saldoFinal };
      // Cartera y CxP leen todas sus cuentas con la naturaleza del módulo, como el cruce por
      // tercero: el anticipo 2805 de Cartera resta en los dos lados (ver `valor-contable.ts`).
      if (d.cuenta6Russell) {
        const sub4 = d.cuenta6Russell.replace(/\D/g, "").slice(0, 4);
        if (!codigosModulo.has(sub4)) continue;
        const calculo = calcularValorContableModulo({ moduloCodigo, cuentaRussell: d.cuenta6Russell, fila: filaContable, catalogo: contextoBalance.catalogo, baseEfectiva: baseNomina === "saldo_acumulado" ? "saldo" : undefined, naturaleza: descriptor.crucePorTercero.naturaleza });
        if (!calculo) {
          sinReglaContableFilas += 1;
          continue;
        }
        const russell6 = d.cuenta6Russell.replace(/\D/g, "").slice(0, 6);
        const fueraDeLaLista = cuentasRussell6 != null && !cuentasRussell6.has(russell6);
        if (fueraDeLaLista) {
          fuera.total += calculo.valor;
          fuera.filas += 1;
          fuera.porCuenta[russell6] = (fuera.porCuenta[russell6] ?? 0) + calculo.valor;
        }
        // Clave del renglón: a 4 la cédula compara el subgrupo entero (lo de fuera de la lista
        // se informa aparte); a 6 cada cuenta Russell es su propio renglón y lo que el módulo
        // no concilia (510548) no entra a la cédula: solo se informa.
        const clave = nivel === 6 ? claveCruceContable(d.cuenta6Russell, 6) : sub4;
        if (!clave || (nivel === 6 && fueraDeLaLista)) continue;
        contablePorCuenta[clave] = (contablePorCuenta[clave] ?? 0) + calculo.valor;
        // Desglose de la fila: qué cuentas del cliente la componen y cuáles quedaron
        // marcadas como no modulares (su valor se descuenta del lado contable).
        const noModular = excluidas.has(cuenta8);
        (detalleContablePorCuenta[clave] ??= []).push({ cuenta8, nombre: d.nombreCuenta, valor: calculo.valor, noModular });
        if (noModular) noModularPorCuenta[clave] = (noModularPorCuenta[clave] ?? 0) + calculo.valor;
      } else if (cuenta4DelModulo(cuenta4, prefijosModulo)) {
        const calculo = calcularValorContableModulo({ moduloCodigo, cuentaRussell: cuenta4, fila: filaContable, catalogo: contextoBalance.catalogo, baseEfectiva: baseNomina === "saldo_acumulado" ? "saldo" : undefined, naturaleza: descriptor.crucePorTercero.naturaleza });
        if (!calculo) {
          sinReglaContableFilas += 1;
          continue;
        }
        sinMapeoTotal += calculo.valor;
        sinMapeoFilas += 1;
      }
    }
    for (const lista of Object.values(detalleContablePorCuenta)) lista.sort((a, b) => a.cuenta8.localeCompare(b.cuenta8));
    cruceContable = construirCruceContable({
      contablePorCuenta,
      noModularPorCuenta,
      consolidado: formalNomina
        ? formalNomina.entradas
        : consolidado.map((c) => ({ clasificador: c.clasificador, total: c.total, cuentas4: cuentasPorClasificador.get(c.clasificador) ?? [] })),
      nombrePorCuenta: (cod) => nombrePorCuenta.get(cod) ?? null,
    });
    // Nómina: vista por subcuenta PUC sumando clases, control de deducciones y repartos
    // sugeridos (proporcionales al movimiento contable de las cuentas candidatas, D4).
    if (consolidadoNomina && formalNomina && insumosNomina && baseNomina) {
      const balanceNomina = contextoBalance.filas
        .filter((d) => !cuentasAgrupadoras.has(d.cuenta8.replace(/\D/g, "")))
        .map((d) => ({ cuenta8: d.cuenta8, nombreCuenta: d.nombreCuenta, debitos: d.debitos, creditos: d.creditos, saldoFinal: d.saldoFinal }));
      nomina = {
        rango: rango!,
        base: baseNomina,
        vistaSubcuenta: construirVistaSubcuenta({ balance: balanceNomina, renglones: consolidadoNomina.renglones, prefijos: prefijosModulo, base: baseNomina }),
        control: construirControlDeducciones({ balance: balanceNomina, renglones: consolidadoNomina.renglones, base: baseNomina }),
        repartosPendientes: formalNomina.pendientesReparto.map((r) => {
          const porCuenta = Object.fromEntries(r.sugerencia.cuentas.map((c) => [c, contablePorCuenta[c] ?? 0]));
          return { clasificador: r.clasificador, codigo: r.codigo, agrupador: r.agrupador, descripcion: r.descripcion, total: r.total, cuentas: [...r.sugerencia.cuentas], sugerido: sugerirReparto(r.total, porCuenta), contablePorCuenta: porCuenta };
        }),
        repartos: insumosNomina.repartos,
        repartidos: formalNomina.repartidos,
        renglones: consolidadoNomina.renglones,
      };
    }
    if (sinMapeoFilas > 0) sinMapeoContable = { total: sinMapeoTotal, filas: sinMapeoFilas };
    if (sinReglaContableFilas > 0) {
      bloqueo = `Se omitieron ${sinReglaContableFilas} fila(s) contable(s) porque no tienen una regla activa aplicable. Configura y aprueba nuevamente el prevalidador antes de conciliar.`;
      cruceContable = null;
      sinMapeoContable = null;
    }
  }

  const marcas: MarcaCruce[] = marcasPeriodo.map((m) => ({
    dimension: "cuenta4",
    cuenta4: m.cuenta4 ?? "",
    numero: m.numero,
    nota: m.nota,
    referenciaAnexo: m.referenciaAnexo,
    diferencia: Number(m.diferencia),
    comentarioId: m.comentarioId,
    marcadoPor: m.marcadoPor,
    marcadoEn: fmtDateTime(m.marcadoEn),
    adjuntos: m.adjuntos,
    noModulares: m.noModulares.map((n) => ({ cuenta8: n.cuenta8, nombre: n.nombreCuenta, valorAlMarcar: Number(n.valorAlMarcar) })),
  }));
  const anotado = cruceContable ? anotarCruceConMarcas(cruceContable.filas, marcas) : null;

  return {
    balanceEmparejado,
    bloqueo,
    cruceContable,
    detalleContablePorCuenta,
    sinMapeoContable,
    sinReglaContableFilas,
    marcas,
    filasMarcadas: anotado?.filas ?? [],
    resumenMarcas: anotado?.resumen ?? null,
    fueraDelModulo: cruceContable && fuera.filas > 0
      ? {
          total: Math.round(fuera.total * 100) / 100,
          filas: fuera.filas,
          porCuenta: Object.fromEntries(Object.entries(fuera.porCuenta).sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => [c, Math.round(v * 100) / 100])),
        }
      : null,
    nomina: nomina ?? (consolidadoNomina && rango ? { rango, base: baseNomina, vistaSubcuenta: null, control: null, repartosPendientes: [], repartos: insumosNomina?.repartos ?? [], repartidos: 0, renglones: consolidadoNomina.renglones } : null),
  };
}

function vacio(balanceEmparejado: BalanceFuenteCruce | null, bloqueo: string | null): ResultadoCruceModulo {
  return {
    balanceEmparejado,
    bloqueo,
    cruceContable: null,
    detalleContablePorCuenta: {},
    sinMapeoContable: null,
    sinReglaContableFilas: 0,
    marcas: [],
    filasMarcadas: [],
    resumenMarcas: null,
    fueraDelModulo: null,
    nomina: null,
  };
}
