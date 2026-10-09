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
import { descriptorModulo, bloqueoCrucePorVerificacionesCriticasModulo, type DescriptorModulo } from "@/lib/modulos/descriptores";
import {
  cedulaModulo,
  claveCedula,
  cuentasCedula6,
  cuenta4DelModulo,
  cuentas6ACargarCedula,
  entradasValorRelacionado,
  esAdicionalCedula,
  fueraDeListaCedula,
  opcionesCedula,
  ordenClaveCedula,
  subgruposCedula,
} from "@/lib/modulos/cuentas-modulo";
import { cedulaDelCargue, type FilaAsignacionPeriodo } from "@/lib/modulos/asignacion-periodo";
import { cargarConsolidacionDelPeriodo } from "@/lib/modulos/asignacion-periodo-servidor";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { CLAVE_SIN_CUENTA, construirCruceContable, type HijoContableCruce, type ResumenCruceContable } from "@/lib/modulos/cruce-contable";
import { emparejarCedulaActivos } from "@/lib/modulos/activos/cedula-activos";
import { avisoContenidoIncompleto, contenidoDelCargue, filaEsSoloDepreciacion } from "@/lib/modulos/activos/contenido-archivo";
import { anotarCruceConMarcas, type FilaCruceMarcada, type HijoModuloSinCuenta, type MarcaCruce, type ResumenMarcas } from "@/lib/modulos/marcas-cruce";
import { calcularValorContableModulo } from "@/lib/modulos/valor-contable";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { resolverDescriptorVigente } from "@/lib/parametros/cuentas-conciliacion";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";
import {
  cuentasAgrupadorasExcluidas,
  seleccionarBalanceCruceModulo,
  avisoSeleccionBalance,
  describirBalanceCruce,
  validarCompuertaPrevalidador,
} from "@/lib/modulos/compuerta-cruce";
import { construirConfigMapeoCliente } from "@/lib/balance/mapeo-cliente-config";
import { gruposNominaDelCargue } from "@/lib/modulos/cargue-servidor";
import { agruparDetalleNomina, construirConsolidadoNominaDeGrupos, type GrupoNominaAgregado } from "@/lib/modulos/nomina/consolidado-nomina";
import { esClaseNomina, sugerirReparto, type ClaseNomina } from "@/lib/modulos/nomina/homologacion";
import {
  construirControlDeducciones,
  construirVistaSubcuenta,
  entradasCruceFormalNomina,
  pesosRepartoDeCentros,
  repartosAplicadosNomina,
  separarEntradasVisibles,
  subcuentasSoloVisibles,
  type RepartoConcepto,
  type ResultadoCruceNomina,
} from "@/lib/modulos/nomina/cruce-nomina";

export type InsumosCruceModulo = {
  /**
   * El descriptor con las cuentas que concilia el módulo en este cargue (`resolverDescriptorVigente`:
   * las de /config/prevalidador o las del cierre en firme del período). `null` = módulo no registrado.
   */
  descriptor: DescriptorModulo | null;
  encabezado: {
    id: number;
    clienteId: number;
    nombreCliente: string;
    moduloCodigo: string;
    periodo: string;
    verificaciones: unknown;
    /**
     * `datos` solo hace falta en Nómina (agrupador, cuenta del archivo, subcuenta) y en los módulos
     * con valor relacionado (la depreciación de Activos fijos). `imputable: false` no suma.
     */
    detalles: { clasificador: string | null; valor: number; datos?: Record<string, unknown>; imputable?: boolean }[];
    /**
     * Nómina: el consolidado ya agregado por (concepto, centro). Cuando viene, el detalle NO se
     * lee: un cargue de nómina son cientos de miles de filas y el GROUP BY las resume en una
     * consulta con gruposNominaDelCargue.
     */
    gruposNomina?: readonly GrupoNominaAgregado[];
  };
  /**
   * `cuenta6` solo importa en los módulos que cruzan a 6 dígitos (`nivelCruce: 6`); las demás
   * columnas (agrupador, grupo, subcuenta, cuenta del cliente) solo las usa Nómina. Es el
   * Consolidado DEL PERÍODO: la memoria del cliente con la asignación del período encima
   * (`cargarConsolidacionDelPeriodo`).
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
    soloPeriodo?: boolean;
  }[];
  /**
   * Asignación del período (`asignacion_periodo_modulo`): sus cuentas fuera de la cédula la amplían
   * solo para este cliente y período (`cedulaDelCargue`).
   */
  asignacionesPeriodo: readonly FilaAsignacionPeriodo[];
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
  /** Apertura declarada («cuenta» | «tercero»); null en cargues anteriores a ese dato. */
  aperturaBalance: string | null;
  /** Versión, apertura y fechas (`describirBalanceCruce`): «v1» solo no distingue dos aperturas del mes. */
  descripcion: string;
};

export type ResultadoCruceModulo = {
  balanceEmparejado: BalanceFuenteCruce | null;
  bloqueo: string | null;
  /** Por qué se cruza contra esta versión: el mes tiene varias oficiales o (Cartera y CxP) la oficial no trae el detalle por tercero. */
  avisoBalance: string | null;
  /**
   * Huella del prevalidador del balance emparejado (detalle, homologación, catálogo y
   * overrides) tal como se calculó el cruce. El cierre la relee bajo candado: como el
   * balance NO tiene que estar congelado, es la prueba de que no cambió entre el cruce que
   * vio el usuario y el commit. `null` si no hubo balance o la compuerta lo bloqueó antes.
   */
  huellaBalance: string | null;
  cruceContable: ResumenCruceContable | null;
  /** Cuentas del cliente que aportan a cada fila del cruce (el desglose al expandir). */
  detalleContablePorCuenta: Record<string, HijoContableCruce[]>;
  /** Clasificadores del renglón del saldo sin cuenta (`CLAVE_SIN_CUENTA`), con los no modulares. */
  detalleSinCuenta: HijoModuloSinCuenta[];
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
  /**
   * Cuentas SOLO VISIBLES (Nómina, 1/Oct/2026): mismo cálculo que la cédula —saldo final contra lo
   * que el módulo les asigna— en un resumen APARTE: no suma a los totales de `cruceContable`, no
   * lleva marcas y no pesa en el cierre. Su desglose de cuentas del cliente va en
   * `detalleContablePorCuenta` con su propia clave. `null` si no hay ninguna con saldo ni concepto.
   */
  soloVisibles: ResumenCruceContable | null;
  /**
   * Activos fijos: la cédula se presenta por el NETO y cada fila trae sus columnas de costo y
   * depreciación (`FilaCruceContable.columnas`). Lo decide tener parejas 15##→1592## configuradas.
   */
  cedulaActivos: boolean;
  /** Depreciaciones que no se pudieron emparejar porque agrupan activos de renglones distintos. */
  sinEmparejarActivos: string[];
  /** Activos fijos: el cargue solo trae costo o solo depreciación y todavía falta el otro archivo. */
  avisoContenidoActivos: string | null;
  /** Solo Nómina: vista por subcuenta, control de deducciones y repartos. */
  nomina: ResultadoCruceNomina | null;
  /** Cuentas que el usuario agregó solo para este período (fuera de la cédula del módulo). */
  cuentasPeriodo: string[];
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
      verificaciones: true,
    },
  });
  if (!encabezado) return null;
  const base = descriptorModulo(encabezado.moduloCodigo);
  const descriptor = base ? await resolverDescriptorVigente(base, { clienteId: encabezado.clienteId, periodo: encabezado.periodo }) : null;
  // El JSON de cada fila solo hace falta en Nómina (agrupador, cuenta del archivo): en
  // Cartera/CxP son cientos de miles de filas y no se lee.
  // La depreciación de Activos fijos (valor relacionado) también vive en `datos`.
  // En Nómina NO se lee el detalle: el consolidado sale de un GROUP BY (cientos de miles de
  // filas contra 81 renglones). La depreciación de Activos fijos sí necesita el JSON de la fila.
  const conDatos = descriptor?.cedula?.valorRelacionado != null;
  const [detalles, gruposNomina, consolidacion, subgrupos, catalogoPrevalidador] = await Promise.all([
    descriptor?.nomina
      ? Promise.resolve([])
      : prisma.moduloDatoDetalle.findMany({ where: { encabezadoId }, select: { clasificador: true, valor: true, datos: conDatos, imputable: true }, orderBy: { filaNum: "asc" } }),
    descriptor?.nomina ? gruposNominaDelCargue(encabezadoId) : Promise.resolve(undefined),
    cargarConsolidacionDelPeriodo(encabezado.clienteId, encabezado.moduloCodigo, encabezado.periodo),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true }, orderBy: { codigo: "asc" } }),
    getCatalogoPrevalidador(),
  ]);
  const cuentasEstandar = await cargarCuentasEstandarDeCedula(descriptor, consolidacion.filasPeriodo.map((f) => f.cuenta6));
  return {
    descriptor,
    encabezado: {
      ...encabezado,
      detalles: detalles.map((d) => ({ clasificador: d.clasificador, valor: Number(d.valor), imputable: d.imputable, ...(conDatos ? { datos: (d.datos ?? {}) as Record<string, unknown> } : {}) })),
      gruposNomina,
    },
    consolidacionRows: consolidacion.filas,
    asignacionesPeriodo: consolidacion.filasPeriodo,
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
 * Cuentas de 6 que nombran los renglones de 6 de la cédula del módulo: su lista, sus adicionales
 * o, con un subgrupo abierto, todo el plan. Una cédula solo de 4 no carga nada. Qué se carga no
 * depende de los prefijos, así que se resuelve sin el catálogo. `delPeriodo` suma las cuentas de 6
 * que el usuario asignó solo para el período (sin ellas, sus renglones saldrían sin nombre).
 */
export async function cargarCuentasEstandarDeCedula(
  descriptor: DescriptorModulo | null | undefined,
  delPeriodo: readonly string[] = [],
): Promise<{ codigo: string; nombre: string }[]> {
  const base = cuentas6ACargarCedula(cedulaModulo(descriptor, []));
  const extras = delPeriodo.map((c) => c.replace(/\D/g, "")).filter((c) => c.length === 6);
  const codigos = base ? [...new Set([...base, ...extras])] : null;
  if (codigos && codigos.length === 0) return [];
  return cargarCuentasEstandarCruce(codigos);
}

/**
 * Cruce contable completo: selección del balance del período, compuerta del
 * prevalidador, agregado contable por cuenta Russell de 4 díg., cédula y marcas.
 */
export async function construirCruceContableModulo(insumos: InsumosCruceModulo): Promise<ResultadoCruceModulo> {
  const { descriptor, encabezado, consolidacionRows, asignacionesPeriodo, subgrupos, cuentasEstandar, catalogoPrevalidador } = insumos;
  const moduloCodigo = encabezado.moduloCodigo;
  if (!descriptor) {
    return vacio(null, `Módulo ${moduloCodigo} no reconocido.`);
  }
  // Clave de la cédula: el subgrupo (4), la cuenta Russell completa (6) o una mezcla (Activos
  // fijos abre la 1592; Ingresos suma la 422005). Una homologación del cliente que no llegue al
  // nivel (cuenta4 sin cuenta6 donde toca 6) deja el clasificador «sin cuenta»: no se adivina la
  // cuenta completa a partir del subgrupo. Es la cédula DEL PERÍODO: la del módulo más las cuentas
  // que el usuario asignó solo para este cliente y período, con la base del módulo.
  const { cedula, extras: cuentasPeriodo } = cedulaDelCargue(descriptor, moduloCodigo, catalogoPrevalidador, asignacionesPeriodo);
  const prefijosModulo = cedula.prefijos;
  const nivel = cedula.nivel;

  const cuentasPorClasificador = new Map<string, string[]>();
  for (const r of consolidacionRows) {
    const clave = claveCedula(cedula, r.cuenta6, r.cuenta4);
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
  // Subgrupos cuyas cuentas homologadas pueden entrar: los de la lista del módulo (cédula a 4) o los
  // del prevalidador, más los de las cuentas adicionales (2510 en Nómina, 4220 en Ingresos).
  const codigosModulo = subgruposCedula(cedula, subgrupos);
  const verifGuardadas = (encabezado.verificaciones ?? {}) as Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>;

  // Nómina: consolidado por (concepto, centro) con la homologación resuelta y los repartos
  // guardados; el lado módulo de la cédula sale de ahí.
  const insumosNomina = descriptor.nomina ? await cargarInsumosNomina(encabezado.clienteId, moduloCodigo, encabezado.periodo) : null;
  const consolidadoNomina = descriptor.nomina && insumosNomina
    ? construirConsolidadoNominaDeGrupos({
        grupos: encabezado.gruposNomina
          ?? agruparDetalleNomina(encabezado.detalles.map((d) => ({ clasificador: d.clasificador, valor: d.valor, datos: d.datos ?? {} }))),
        memoria: consolidacionRows.map((r) => ({ ...r, agrupador: r.agrupador ?? "", cuenta6: r.cuenta6 ?? "" })),
        reglasClase: insumosNomina.reglasClase,
        mapeoCliente: insumosNomina.mapeoCliente,
        cuentasRussell6: cuentasCedula6(descriptor, cuentasPeriodo),
      })
    : null;
  const formalNomina = consolidadoNomina && insumosNomina ? entradasCruceFormalNomina(consolidadoNomina.renglones, insumosNomina.repartos) : null;
  // Cuentas solo visibles (Nómina): lo que el módulo les asigna va a su resumen aparte. Una visible
  // que comparte un concepto sin repartir con una que concilia se concilia en este cargue.
  const separadas = formalNomina && cedula.visibles.size > 0 ? separarEntradasVisibles(formalNomina.entradas, cedula.visibles) : null;
  const visiblesDelCargue = new Set([...cedula.visibles].filter((c) => !separadas?.promovidas.has(c)));
  // Las filas de un archivo de SOLO DEPRECIACIÓN no son costo: su valor ya está en el rol
  // relacionado y entra por `entradasValorRelacionado`. Sumarlas aquí las contaría dos veces.
  const consolidado = consolidarPorClasificador(
    encabezado.detalles
      .filter((d) => !filaEsSoloDepreciacion(d.datos))
      .map((d) => ({ clasificador: d.clasificador, valor: d.valor })),
  );
  // Qué lados trae el cargue: con uno solo, la diferencia de la cédula no es un faltante del
  // cliente sino el archivo que falta. Solo informa.
  const avisoContenidoActivos = descriptor.confirmarContenidoActivosEnCarga
    ? avisoContenidoIncompleto(contenidoDelCargue(encabezado.detalles.map((d) => ({ valor: d.valor, datos: d.datos, imputable: d.imputable }))))
    : null;
  // Activos fijos: la depreciación del archivo cruza contra la 1592xx relacionada con el activo.
  const etiquetaRelacionado = descriptor.columnas.find((c) => c.nombre === cedula.rolRelacionado)?.etiqueta ?? cedula.rolRelacionado ?? "";
  const entradasRelacionadas = entradasValorRelacionado(
    cedula,
    encabezado.detalles.filter((d) => d.imputable !== false),
    cuentasPorClasificador,
    etiquetaRelacionado.toLowerCase(),
  );

  // Balance del período: uno confirmado que TERMINE en el mes de corte del cargue, el oficial si
  // existe y, si no, la versión más reciente (congelar NO es requisito para conciliar). Todos los
  // módulos comparan saldos finales, así que no importa desde cuándo arranca el balance. Después,
  // la compuerta común exige que conserve una aprobación vigente del prevalidador.
  const balancesDelCliente = await prisma.balancePruebaEncabezado.findMany({
    where: { clienteId: encabezado.clienteId },
    select: { id: true, periodo: true, periodoInicio: true, periodoFin: true, version: true, esOficial: true, estaCongelado: true, loteId: true, aperturaBalance: true },
    orderBy: [{ esOficial: "desc" }, { periodoFin: "desc" }, { id: "desc" }],
  });
  // Cartera y CxP: gana la versión del mes con detalle por tercero (el cruce por tercero solo lee
  // el LIGADO por `loteId`), y se avisa si con eso no es la oficial o si el mes tiene varias.
  const preferirDetalleTercero = descriptor.crucePorTercero.habilitado && descriptor.crucePorTercero.preferirBalanceConTerceros === true;
  const lotesConTerceros = new Set<string>();
  const lotes = preferirDetalleTercero ? balancesDelCliente.map((b) => b.loteId).filter((l): l is string => l != null) : [];
  if (lotes.length > 0) {
    const capturas = await prisma.balanceTerceroEncabezado.findMany({
      where: { clienteId: encabezado.clienteId, loteId: { in: lotes } },
      select: { loteId: true },
    });
    for (const captura of capturas) if (captura.loteId) lotesConTerceros.add(captura.loteId);
  }
  const balancesConfirmados = balancesDelCliente.map((b) => ({ ...b, conDetalleTercero: b.loteId != null && lotesConTerceros.has(b.loteId) }));
  const emparejado = seleccionarBalanceCruceModulo(balancesConfirmados, encabezado.periodo, { preferirDetalleTercero });
  const avisoBalance = avisoSeleccionBalance(balancesConfirmados, emparejado, encabezado.periodo);
  const balanceEmparejado: BalanceFuenteCruce | null = emparejado
    ? {
        id: emparejado.id,
        version: emparejado.version,
        periodo: emparejado.periodo,
        periodoInicio: emparejado.periodoInicio.toISOString().slice(0, 10),
        periodoFin: emparejado.periodoFin.toISOString().slice(0, 10),
        esOficial: emparejado.esOficial,
        estaCongelado: emparejado.estaCongelado,
        aperturaBalance: emparejado.aperturaBalance,
        descripcion: describirBalanceCruce(emparejado),
      }
    : null;

  let cruceContable: ResumenCruceContable | null = null;
  let soloVisibles: ResumenCruceContable | null = null;
  /** Activos fijos: depreciaciones agrupadas entre activos de renglones distintos (no se parten). */
  let sinEmparejarActivos: string[] = [];
  let sinMapeoContable: { total: number; filas: number } | null = null;
  let sinReglaContableFilas = 0;
  const fuera = { total: 0, filas: 0, porCuenta: {} as Record<string, number> };
  let bloqueo = bloqueoCrucePorVerificacionesCriticasModulo(descriptor, verifGuardadas);
  let contextoBalance: Awaited<ReturnType<typeof cargarContextoPrevalidadorBalance>> | null = null;

  if (emparejado && !bloqueo) {
    try {
      contextoBalance = await cargarContextoPrevalidadorBalance(emparejado.id);
      bloqueo = validarCompuertaPrevalidador(contextoBalance, encabezado.clienteId, moduloCodigo);
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
      clasificadoresNoModulares: { orderBy: { clasificador: "asc" }, select: { clasificador: true, totalAlMarcar: true } },
    },
  });
  const excluidas = new Set(marcasPeriodo.flatMap((m) => m.noModulares.map((n) => n.cuenta8)));
  // Del saldo sin cuenta: los clasificadores que su marca excluyó del lado del módulo.
  const excluidosSinCuenta = new Set(
    marcasPeriodo.filter((m) => m.cuenta4 === CLAVE_SIN_CUENTA).flatMap((m) => m.clasificadoresNoModulares.map((c) => c.clasificador)),
  );
  // Conceptos NO CONTABILIZADOS por renglón: lo que el archivo trae y la contabilidad no registra
  // en esa cuenta. Es el espejo de las cuentas no modulares, del lado del módulo.
  const noContabilizadosPorFila = new Map<string, Set<string>>();
  for (const m of marcasPeriodo) {
    const clave = m.cuenta4 ?? "";
    if (!clave || clave === CLAVE_SIN_CUENTA || m.clasificadoresNoModulares.length === 0) continue;
    noContabilizadosPorFila.set(clave, new Set(m.clasificadoresNoModulares.map((c) => c.clasificador)));
  }

  const detalleContablePorCuenta: Record<string, HijoContableCruce[]> = {};
  let nomina: ResultadoCruceNomina | null = null;
  if (emparejado && contextoBalance && !bloqueo) {
    const cuentasAgrupadoras = cuentasAgrupadorasExcluidas(contextoBalance.prevalidador);
    const contablePorCuenta: Record<string, number> = {};
    const contableVisiblePorCuenta: Record<string, number> = {};
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
        const digitos = d.cuenta6Russell.replace(/\D/g, "");
        const sub4 = digitos.slice(0, 4);
        const russell6 = digitos.length >= 6 ? digitos.slice(0, 6) : "";
        // Una cuenta adicional (o del período, o un subgrupo de la lista fuera de las reglas) entra
        // aunque su subgrupo no sea del prevalidador y hace de su propia regla; el resto de ese
        // subgrupo (422010 en Ingresos) no es del módulo y se ignora como siempre. A 4 dígitos manda
        // la lista del módulo: un subgrupo que no está en ella no entra aunque esté bajo la regla.
        // Una solo visible fuera de los prefijos (los pasivos 25xx de Nómina) se lee como adicional.
        const visibleFueraDePrefijos = cedula.visibles.has(russell6) && !cuenta4DelModulo(sub4, prefijosModulo);
        const adicional = esAdicionalCedula(cedula, russell6, sub4) || visibleFueraDePrefijos;
        if (!codigosModulo.has(sub4) || (!adicional && !cuenta4DelModulo(sub4, prefijosModulo))) continue;
        // Las reglas del cruce salen del catálogo VIGENTE, como en el cruce por tercero, y no del
        // congelado de la aprobación del balance (`contexto.ts`): ese rige solo el informe del
        // prevalidador. Si no, una cuenta agregada después de aprobar quedaría «sin regla» y
        // bloquearía el cruce. La base de cálculo no interviene aquí: se lee siempre el saldo final.
        const calculo = calcularValorContableModulo({
          moduloCodigo,
          cuentaRussell: d.cuenta6Russell,
          fila: filaContable,
          catalogo: catalogoPrevalidador,
          naturaleza: descriptor.crucePorTercero.naturaleza,
          adicional,
          naturalezaCuenta: cedula.abiertos.get(sub4),
        });
        if (!calculo) {
          sinReglaContableFilas += 1;
          continue;
        }
        // Solo visible: su propio resumen, sin no modulares (no se concilia).
        if (visiblesDelCargue.has(russell6)) {
          contableVisiblePorCuenta[russell6] = (contableVisiblePorCuenta[russell6] ?? 0) + calculo.valor;
          (detalleContablePorCuenta[russell6] ??= []).push({ cuenta8, nombre: d.nombreCuenta, valor: calculo.valor, noModular: false });
          continue;
        }
        const fueraDeLaLista = fueraDeListaCedula(cedula, russell6);
        if (fueraDeLaLista) {
          fuera.total += calculo.valor;
          fuera.filas += 1;
          fuera.porCuenta[russell6] = (fuera.porCuenta[russell6] ?? 0) + calculo.valor;
        }
        // Clave del renglón: a 4 la cédula compara el subgrupo entero (lo de fuera de la lista
        // se informa aparte); a 6 cada cuenta Russell es su propio renglón y lo que el módulo
        // no concilia (510548) no entra a la cédula: solo se informa. Un subgrupo abierto (1592)
        // homologado solo a 4 dígitos no tiene renglón: cuenta como homologación incompleta.
        const clave = claveCedula(cedula, d.cuenta6Russell);
        if (!clave) {
          if (cedula.abiertos.has(sub4)) {
            sinMapeoTotal += calculo.valor;
            sinMapeoFilas += 1;
          }
          continue;
        }
        if (nivel === 6 && fueraDeLaLista) continue;
        contablePorCuenta[clave] = (contablePorCuenta[clave] ?? 0) + calculo.valor;
        // Desglose de la fila: qué cuentas del cliente la componen y cuáles quedaron
        // marcadas como no modulares (su valor se descuenta del lado contable).
        const noModular = excluidas.has(cuenta8);
        (detalleContablePorCuenta[clave] ??= []).push({ cuenta8, nombre: d.nombreCuenta, valor: calculo.valor, noModular });
        if (noModular) noModularPorCuenta[clave] = (noModularPorCuenta[clave] ?? 0) + calculo.valor;
      } else if (cuenta4DelModulo(cuenta4, prefijosModulo) || cedula.lista4?.has(cuenta4)) {
        // Sin homologar: se avisa si la cuenta del cliente cae bajo la regla del prevalidador O en la
        // lista del módulo. Es solo un aviso (no suma a «Contabilidad» ni bloquea el cierre). La que
        // cae solo por la lista no tiene regla: se lee como adicional, con el signo de su clase.
        const soloPorLista = !cuenta4DelModulo(cuenta4, prefijosModulo);
        const calculo = calcularValorContableModulo({ moduloCodigo, cuentaRussell: cuenta4, fila: filaContable, catalogo: catalogoPrevalidador, naturaleza: descriptor.crucePorTercero.naturaleza, adicional: soloPorLista, naturalezaCuenta: cedula.abiertos.get(cuenta4) });
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
      noModularSinCuenta: excluidosSinCuenta,
      noContabilizadosPorFila,
      consolidado: formalNomina
        ? separadas?.concilian ?? formalNomina.entradas
        : [
            ...consolidado.map((c) => ({ clasificador: c.clasificador, total: c.total, cuentas4: cuentasPorClasificador.get(c.clasificador) ?? [] })),
            ...entradasRelacionadas,
          ],
      // La cédula se muestra COMPLETA: sus cuentas llevan renglón aunque estén en cero por los dos
      // lados. Las solo visibles (Nómina) no, que tienen su propio resumen aparte.
      cuentasSiempre: opcionesCedula(cedula, insumos.subgrupos, insumos.cuentasEstandar ?? [])
        .map((c) => c.codigo)
        .filter((c) => !cedula.visibles.has(c)),
      nombrePorCuenta: (cod) => nombrePorCuenta.get(cod) ?? null,
      ordenCuenta: (clave) => ordenClaveCedula(cedula, clave),
      // Un clasificador asignado a varias cuentas cruza contra la suma de ellas en una fila
      // agrupada. En Nómina también (1/Oct/2026): el reparto es opcional y, guardado, separa el
      // concepto en entradas de una cuenta cada una, que ya no agrupan.
      agruparMultiAsignados: true,
    });
    // Las solo visibles: el mismo cálculo, aparte (sin marcas ni no modulares).
    if (Object.keys(contableVisiblePorCuenta).length > 0 || (separadas?.visibles.length ?? 0) > 0) {
      soloVisibles = construirCruceContable({
        contablePorCuenta: contableVisiblePorCuenta,
        consolidado: separadas?.visibles ?? [],
        nombrePorCuenta: (cod) => nombrePorCuenta.get(cod) ?? null,
        ordenCuenta: (clave) => ordenClaveCedula(cedula, clave),
        agruparMultiAsignados: true,
      });
    }
    // El desglose de una fila agrupada son las cuentas del cliente de todas sus cuentas Russell.
    for (const fila of [...cruceContable.filas, ...(soloVisibles?.filas ?? [])]) {
      if (!fila.cuentas) continue;
      detalleContablePorCuenta[fila.cuenta4] = fila.cuentas
        .flatMap((c) => detalleContablePorCuenta[c] ?? [])
        .sort((a, b) => a.cuenta8.localeCompare(b.cuenta8));
    }
    // ACTIVOS FIJOS: cada depreciación 1592xx se funde con el renglón de su activo y el renglón
    // pasa a presentarse por el NETO (costo − depreciación), con las dos columnas en `columnas`.
    if (cedula.relacionPorSubgrupo.size > 0) {
      const emparejada = emparejarCedulaActivos(cruceContable, cedula.relacionPorSubgrupo);
      sinEmparejarActivos = emparejada.sinEmparejar;
      // El desglose del renglón suma las cuentas del cliente del costo y las de la depreciación;
      // estas últimas en NEGATIVO, que es como restan del neto. Así Σ del desglose = `contable`
      // y marcar una cuenta no modular sigue cuadrando con la diferencia ajustada.
      for (const fila of emparejada.filas) {
        const cuentasDep = fila.columnas?.depreciacion.cuentas ?? [];
        if (cuentasDep.length === 0) continue;
        const dep = cuentasDep.flatMap((c) => (detalleContablePorCuenta[c] ?? []).map((h) => ({ ...h, valor: Math.round(-h.valor * 100) / 100 })));
        detalleContablePorCuenta[fila.cuenta4] = [...(detalleContablePorCuenta[fila.cuenta4] ?? []), ...dep]
          .sort((a, b) => a.cuenta8.localeCompare(b.cuenta8));
      }
      cruceContable = emparejada;
    }
    // Pesos del reparto sugerido: el saldo de todas las candidatas, concilien o solo se vean.
    const contableTodas = { ...contableVisiblePorCuenta, ...contablePorCuenta };
    // Nómina: vista por subcuenta PUC sumando clases, control de deducciones y repartos
    // sugeridos: lo repartido en los centros del concepto en el período (un cargue sin centro) y,
    // si no hay, proporcionales al saldo contable de las cuentas candidatas (D4).
    if (consolidadoNomina && formalNomina && insumosNomina) {
      const balanceNomina = contextoBalance.filas
        .filter((d) => !cuentasAgrupadoras.has(d.cuenta8.replace(/\D/g, "")))
        .map((d) => ({ cuenta8: d.cuenta8, nombreCuenta: d.nombreCuenta, debitos: d.debitos, creditos: d.creditos, saldoFinal: d.saldoFinal }));
      const repartosVm = repartosAplicadosNomina(consolidadoNomina.renglones, insumosNomina.repartos, contableTodas);
      nomina = {
        repartosAplicados: repartosVm.aplicados,
        repartosIgnorados: repartosVm.ignorados,
        vistaSubcuenta: construirVistaSubcuenta({
          balance: balanceNomina,
          renglones: consolidadoNomina.renglones,
          prefijos: prefijosModulo,
          subcuentasVisibles: subcuentasSoloVisibles(cedula.lista6 ?? [], cedula.visibles),
        }),
        control: construirControlDeducciones({ balance: balanceNomina, renglones: consolidadoNomina.renglones }),
        repartosPendientes: formalNomina.pendientesReparto.map((r) => {
          const porCuenta = Object.fromEntries(r.sugerencia.cuentas.map((c) => [c, contableTodas[c] ?? 0]));
          const deCentros = pesosRepartoDeCentros(r, r.sugerencia.cuentas, insumosNomina.repartos);
          return {
            clasificador: r.clasificador,
            codigo: r.codigo,
            agrupador: r.agrupador,
            cuentaArchivo: r.cuentaArchivo,
            descripcion: r.descripcion,
            total: r.total,
            cuentas: [...r.sugerencia.cuentas],
            sugerido: sugerirReparto(r.total, deCentros ?? porCuenta),
            origenSugerido: deCentros ? "centros" as const : "saldo" as const,
            contablePorCuenta: porCuenta,
          };
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
      soloVisibles = null;
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
    clasificadoresNoModulares: m.clasificadoresNoModulares.map((c) => ({ clasificador: c.clasificador, totalAlMarcar: Number(c.totalAlMarcar) })),
  }));
  const anotado = cruceContable ? anotarCruceConMarcas(cruceContable.filas, marcas) : null;

  return {
    balanceEmparejado,
    bloqueo,
    avisoBalance,
    huellaBalance: contextoBalance && !bloqueo ? contextoBalance.huella : null,
    cruceContable,
    detalleContablePorCuenta,
    detalleSinCuenta: (cruceContable?.sinCuenta ?? []).map((s) => ({ ...s, noModular: excluidosSinCuenta.has(s.clasificador) })),
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
    soloVisibles: cruceContable ? soloVisibles : null,
    // Activos fijos: la cédula se presenta por el neto, con las columnas de costo y depreciación.
    cedulaActivos: cedula.relacionPorSubgrupo.size > 0,
    sinEmparejarActivos,
    avisoContenidoActivos,
    nomina: nomina ?? (consolidadoNomina ? { vistaSubcuenta: null, control: null, repartosPendientes: [], repartosAplicados: [], repartosIgnorados: 0, repartos: insumosNomina?.repartos ?? [], repartidos: 0, renglones: consolidadoNomina.renglones } : null),
    cuentasPeriodo,
  };
}

function vacio(balanceEmparejado: BalanceFuenteCruce | null, bloqueo: string | null): ResultadoCruceModulo {
  return {
    balanceEmparejado,
    bloqueo,
    avisoBalance: null,
    huellaBalance: null,
    cruceContable: null,
    detalleContablePorCuenta: {},
    detalleSinCuenta: [],
    sinMapeoContable: null,
    sinReglaContableFilas: 0,
    marcas: [],
    filasMarcadas: [],
    resumenMarcas: null,
    fueraDelModulo: null,
    soloVisibles: null,
    cedulaActivos: false,
    sinEmparejarActivos: [],
    avisoContenidoActivos: null,
    nomina: null,
    cuentasPeriodo: [],
  };
}
