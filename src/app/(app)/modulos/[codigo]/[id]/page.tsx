import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";
import { PageHeader, BackLink } from "@/components/ui";
import Conversacion from "@/components/conversacion";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import {
  cedulaModulo,
  claveCedula,
  claveCruceContable,
  cuentasCedula6,
  opcionesCedula,
  prefijosCuentaModulo,
} from "@/lib/modulos/cuentas-modulo";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { validacionDelCargue } from "@/lib/modulos/validacion-cargue";
import { detectarNegativos, detectarDescuadres } from "@/lib/modulos/validaciones";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { fmtDateTime } from "@/lib/format";
import { columnasDetalleModulo } from "@/lib/modulos/cartera/columnas-cartera";
import { cargarCuentasEstandarDeCedula, construirCruceContableModulo } from "@/lib/modulos/cruce-contable-servidor";
import { construirCruceTerceroModulo, etiquetasCruceTercero } from "@/lib/modulos/cruce-tercero-servidor";
import { validarAuxiliarTercero } from "@/lib/modulos/cartera/validaciones-tercero";
import { leerFormatosCartera } from "@/lib/modulos/cartera/tipo-formato";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import { finDePeriodo } from "@/lib/modulos/cartera/fecha-corte";
import { CLAVE_MONEDA } from "@/lib/modulos/cartera/detalle-cartera";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { ESTADO_CIERRE_FIRME, evaluarCierreConciliacion } from "@/lib/conciliacion/cuentas-bloqueo";
import { autorizarCierreConciliacion } from "@/lib/conciliacion/verificar-bloqueo";
import DatoCargadoClient, { type FilaDetalleVm, type ConsolidadoVm, type AgrupadorVm, type NovedadesVm, type VersionModuloVm, type CruceContableVm, type CruceTerceroVm, type CierreConciliacionVm } from "./dato-cargado-client";
import { construirConsolidadoNomina } from "@/lib/modulos/nomina/consolidado-nomina";
import { validarNomina } from "@/lib/modulos/nomina/validaciones-nomina";
import { esClaseNomina, type ClaseNomina } from "@/lib/modulos/nomina/homologacion";
import { construirConfigMapeoCliente } from "@/lib/balance/mapeo-cliente-config";

export default async function DatoModuloPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePermiso("modulos_datos:ver");
  const [{ codigo, id }, query] = await Promise.all([params, searchParams]);
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  const encabezadoId = Number(id);
  if (!descriptor || !Number.isInteger(encabezadoId)) notFound();

  const encabezado = await prisma.moduloDatoEncabezado.findUnique({
    where: { id: encabezadoId },
    include: { detalles: { orderBy: { filaNum: "asc" } } },
  });
  if (!encabezado || encabezado.moduloCodigo !== moduloCodigo) notFound();

  // Alcance de lectura sobre el cliente del dato (fail-closed).
  const scope = await authorizePermiso("modulos_datos:ver", { clientId: encabezado.clienteId });
  if (!scope.ok) notFound();

  // ¿Puede editar la consolidación de este cliente?
  const puedeEditar = (await authorizePermiso("modulos_datos:editar", { clientId: encabezado.clienteId })).ok;

  const [consolidacionRows, subgrupos, cuentasEstandar, catalogoPrevalidador, comentariosGrp, cuentasCliente, hermanos, reglasClaseRows] = await Promise.all([
    prisma.consolidacionModuloCliente.findMany({
      where: { clienteId: encabezado.clienteId, moduloCodigo },
      select: { clasificador: true, agrupador: true, descripcion: true, cuenta4: true, cuenta6: true, grupo: true, subcuentaPuc: true, cuentaCliente: true },
    }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true }, orderBy: { codigo: "asc" } }),
    cargarCuentasEstandarDeCedula(descriptor),
    getCatalogoPrevalidador(),
    prisma.comment.groupBy({ by: ["anchor"], where: { entityType: "modulos_datos", entityId: encabezadoId }, _count: { _all: true } }),
    // Homologación del cliente: cuentas propias mapeadas al plan Russell (para detallar por subgrupo).
    prisma.clientAccount.findMany({
      where: { clienteId: encabezado.clienteId, cuenta6Russell: { not: null } },
      select: { code: true, name: true, level: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoEn: true },
      orderBy: { code: "asc" },
    }),
    prisma.moduloDatoEncabezado.findMany({
      where: {
        clienteId: encabezado.clienteId,
        moduloCodigo,
        periodo: encabezado.periodo,
      },
      orderBy: [{ version: "desc" }, { ultimaCarga: "desc" }, { id: "desc" }],
      select: {
        id: true,
        version: true,
        esOficial: true,
        filas: true,
        total: true,
        archivoNombre: true,
        archivoTam: true,
        origenExtraccion: true,
        observaciones: true,
        cargadoPor: true,
        ultimaCarga: true,
      },
    }),
    // Nómina: clase contable por centro de costo / clase del archivo (GYA → 51, MOD → 72).
    descriptor.nomina
      ? prisma.claseAgrupadorModulo.findMany({ where: { clienteId: encabezado.clienteId, moduloCodigo }, select: { agrupador: true, clase: true } })
      : Promise.resolve([] as { agrupador: string; clase: string }[]),
  ]);
  // Cédula contable: subgrupo de 4 dígitos, cuenta Russell completa (Nómina, Cartera, CxP) o una
  // mezcla (Activos fijos abre la 1592; Ingresos suma la 422005).
  const prefijosModulo = prefijosCuentaModulo(moduloCodigo, catalogoPrevalidador);
  const cedula = cedulaModulo(descriptor, prefijosModulo);
  const nivel = cedula.nivel;
  // Un clasificador puede tener 1..N cuentas: agrupamos en lista (ordenada).
  const cuentasPorClasificador = new Map<string, string[]>();
  // Nombre legible del clasificador cuando existe (Nómina: el clasificador es el CÓDIGO
  // del concepto y la descripción es su nombre, cargado en /config/conceptos-nomina).
  const descripcionPorClasificador = new Map<string, string>();
  for (const r of consolidacionRows) {
    // A 6 dígitos solo cuenta la homologación completa: una fila con cuenta4 y sin cuenta6
    // (guardada antes de que el módulo cruzara a 6) deja el concepto «sin cuenta».
    const clave = claveCedula(cedula, r.cuenta6, r.cuenta4);
    if (clave) {
      const lista = cuentasPorClasificador.get(r.clasificador) ?? [];
      lista.push(clave);
      cuentasPorClasificador.set(r.clasificador, lista);
    }
    if (r.descripcion && !descripcionPorClasificador.has(r.clasificador)) {
      descripcionPorClasificador.set(r.clasificador, r.descripcion);
    }
  }
  for (const [k, v] of cuentasPorClasificador) cuentasPorClasificador.set(k, [...new Set(v)].sort());
  // Nombres del plan completo (por si hay un mapeo legado fuera del módulo).
  const nombrePorCuenta = new Map([
    ...subgrupos.map((s) => [s.codigo, s.nombre] as const),
    ...cuentasEstandar.map((c) => [c.codigo, c.nombre] as const),
  ]);
  const comentariosPorAncla: Record<string, number> = {};
  for (const g of comentariosGrp) if (g.anchor) comentariosPorAncla[g.anchor] = g._count._all;
  // El datalist solo ofrece cuentas Russell del módulo (p. ej. INV → 14xx; Nómina → 510506…;
  // Ingresos → 41xx y 422005). La 1592xx de Activos fijos no se asigna: sale de la relación.
  const cuentasModulo = opcionesCedula(cedula, subgrupos, cuentasEstandar);
  // Cuentas del CLIENTE homologadas a cada cuenta Russell del módulo (14XX → [143505 «…»]).
  const codigosModulo = new Set(cuentasModulo.map((c) => c.codigo));
  const homologacionPorSubgrupo: Record<string, { codigo: string; nombre: string }[]> = {};
  // Índice INVERSO (cuenta del cliente → su cuenta Russell de 4 y de 6 díg) para que el campo
  // rápido del cruce acepte que el usuario escriba su propia cuenta. Va SIN filtrar por
  // módulo a propósito: así se puede avisar «143504 está homologada a 4175, que no
  // pertenece a Inventarios» en vez de un «no encontrada» que haría pensar que falta
  // parametrizarla. Quien decide si entra es `resolverCuenta4`.
  const resolucionCliente: Record<string, { cuenta4: string; cuenta6: string | null; nombre: string }> = {};
  for (const a of cuentasCliente) {
    const sub = (a.cuenta6Russell ?? "").replace(/\D/g, "").slice(0, 4);
    if (!sub) continue;
    resolucionCliente[a.code] = { cuenta4: sub, cuenta6: claveCruceContable(a.cuenta6Russell, 6), nombre: a.name };
    const clave = claveCedula(cedula, a.cuenta6Russell);
    if (!clave || !codigosModulo.has(clave)) continue;
    (homologacionPorSubgrupo[clave] ??= []).push({ codigo: a.code, nombre: a.name });
  }

  const detalleVm: FilaDetalleVm[] = encabezado.detalles.map((d) => ({
    filaNum: d.filaNum,
    clasificador: d.clasificador,
    valor: Number(d.valor),
    datos: (d.datos ?? {}) as Record<string, string | number | null>,
  }));

  // Novedades: negativos y descuadres RECALCULADOS del detalle + checklist/observaciones guardados.
  const filasVal = detalleVm.map((d) => ({ filaNum: d.filaNum, clasificador: d.clasificador, datos: d.datos }));
  const negativos = detectarNegativos(descriptor, filasVal);
  const descuadres = detectarDescuadres(descriptor, filasVal);
  const verifGuardadas = (encabezado.verificaciones ?? {}) as Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>;
  const novedades: NovedadesVm = {
    negativos: negativos.map((n) => ({ filaNum: n.filaNum, etiqueta: n.etiqueta, referencia: n.referencia, valor: n.valor })),
    descuadres: descuadres.map((d) => ({ filaNum: d.filaNum, referencia: d.referencia, etiqueta: d.resultadoEtiqueta, declarado: d.declarado, esperado: d.esperado })),
    observaciones: encabezado.observaciones ?? null,
    verificaciones: (descriptor.verificaciones ?? []).map((v) => ({ texto: v.texto, respuesta: verifGuardadas[v.id]?.respuesta ?? null, nota: verifGuardadas[v.id]?.nota ?? null })),
    // Único control que NO se recalcula del detalle: el total que declaró el archivo vive en
    // una fila no imputable y el staging que la traía se purga al promover, así que se lee de
    // lo que el encabezado congeló. `null` = cargue anterior a esta validación.
    validacionArchivo: validacionDelCargue({
      total: Number(encabezado.total),
      filas: encabezado.filas,
      totalDeclarado: encabezado.totalDeclarado == null ? null : Number(encabezado.totalDeclarado),
      filaTotalDeclarado: encabezado.filaTotalDeclarado,
      archivosDelCargue: encabezado.archivosDelCargue,
      archivosConTotal: encabezado.archivosConTotal,
    }),
  };

  // Nómina: un renglón por (concepto, centro de costo) con la memoria guardada para ese par y la
  // sugerencia de homologación (cuenta del archivo, memoria + regla de clase, grupo por nombre).
  const reglasClase = new Map(reglasClaseRows.filter((r) => esClaseNomina(r.clase)).map((r) => [r.agrupador, r.clase as ClaseNomina]));
  const consolidadoNomina = descriptor.nomina
    ? construirConsolidadoNomina({
        detalle: detalleVm,
        memoria: consolidacionRows.map((r) => ({ ...r, cuenta6: r.cuenta6 ?? "" })),
        reglasClase,
        mapeoCliente: new Map([...construirConfigMapeoCliente(cuentasCliente).entries()].map(([k, v]) => [k, v.std])),
        cuentasRussell6: cuentasCedula6(descriptor),
      })
    : null;
  const consolidado = consolidarPorClasificador(detalleVm.map((d) => ({ clasificador: d.clasificador, valor: d.valor })));
  const consolidadoVm: ConsolidadoVm[] = consolidadoNomina
    ? consolidadoNomina.renglones.map((c) => ({
        clasificador: c.clasificador,
        codigo: c.codigo,
        agrupador: c.agrupador,
        descripcion: c.descripcion,
        total: c.total,
        filas: c.filas,
        cuentas4: c.cuentas.map((cod) => ({ codigo: cod, nombre: nombrePorCuenta.get(cod) ?? null })),
        sugerencia: c.sugerencia,
      }))
    : consolidado.map((c) => ({
        clasificador: c.clasificador,
        descripcion: descripcionPorClasificador.get(c.clasificador) ?? null,
        total: c.total,
        filas: c.filas,
        cuentas4: (cuentasPorClasificador.get(c.clasificador) ?? []).map((cod) => ({ codigo: cod, nombre: nombrePorCuenta.get(cod) ?? null })),
      }));
  const agrupadoresVm: AgrupadorVm[] = consolidadoNomina?.agrupadores ?? [];
  // Cruce contable (balance vs. archivos del módulo): el MISMO cálculo que verifica
  // la Server Action al cerrar la conciliación (`cruce-contable-servidor.ts`).
  const cruce = await construirCruceContableModulo({
    encabezado: {
      id: encabezado.id,
      clienteId: encabezado.clienteId,
      nombreCliente: encabezado.nombreCliente,
      moduloCodigo,
      periodo: encabezado.periodo,
      periodoDesde: encabezado.periodoDesde,
      verificaciones: encabezado.verificaciones,
      detalles: encabezado.detalles.map((d) => ({
        clasificador: d.clasificador,
        valor: Number(d.valor),
        datos: (d.datos ?? {}) as Record<string, unknown>,
        imputable: d.imputable,
      })),
    },
    consolidacionRows,
    subgrupos,
    cuentasEstandar,
    catalogoPrevalidador,
  });
  const balanceEmparejado = cruce.balanceEmparejado;

  // Cruce por tercero (la compuerta tipada del descriptor decide si el módulo lo tiene). Se
  // resuelve antes del estado del cierre porque en Cartera y CxP la conciliación no se cierra
  // sin él. Mismo balance y compuertas del cruce contable, contra el detalle por tercero ligado.
  const cruceTercero = descriptor.crucePorTercero.habilitado
    ? await construirCruceTerceroModulo({
        encabezado: {
          id: encabezado.id,
          clienteId: encabezado.clienteId,
          moduloCodigo,
          periodo: encabezado.periodo,
          total: Number(encabezado.total),
          nivelSaldo: encabezado.nivelSaldo,
          detalles: encabezado.detalles.map((d) => ({
            filaNum: d.filaNum,
            valor: Number(d.valor),
            datos: (d.datos ?? {}) as Record<string, unknown>,
            nivel: d.nivel,
            imputable: d.imputable,
            cuentaCliente: d.cuentaCliente,
            origenCartera: d.origenCartera,
          })),
        },
        balanceEmparejado,
        bloqueo: cruce.bloqueo,
        subgrupos,
        catalogoPrevalidador,
        consolidacionRows,
      })
    : null;

  // Conciliación en firme del (cliente, módulo, período): estado + quién puede
  // cerrar/desbloquear (senior o gerente asignado; Superadministrador por alcance).
  const [cierreRow, cerrarAuth, desbloquearAuth] = await Promise.all([
    prisma.conciliacionModuloCierre.findUnique({
      where: { clienteId_moduloCodigo_periodo: { clienteId: encabezado.clienteId, moduloCodigo, periodo: encabezado.periodo } },
      select: {
        id: true, estado: true, balancePeriodo: true, balanceEncabezadoId: true, moduloDatoEncabezadoId: true,
        cerradoPor: true, cerradoEn: true, desbloqueadoPor: true, desbloqueadoEn: true, justificacionDesbloqueo: true,
        _count: { select: { cuentas: true } },
      },
    }),
    autorizarCierreConciliacion("conciliaciones:cerrar", encabezado.clienteId),
    autorizarCierreConciliacion("conciliaciones:desbloquear", encabezado.clienteId),
  ]);
  const exigeTercero = descriptor.crucePorTercero.habilitado && descriptor.crucePorTercero.exigidoParaCierre === true;
  const evaluacionCierre = cruce.cruceContable
    ? evaluarCierreConciliacion(
        cruce.cruceContable,
        cruce.resumenMarcas,
        exigeTercero
          ? { exigido: true, estado: cruceTercero?.estado ?? "sin_balance", mensaje: cruceTercero?.mensaje ?? null, resumenMarcas: cruceTercero?.resumenMarcas ?? null }
          : null,
      )
    : null;
  const cierreVm: CierreConciliacionVm = {
    cierre: cierreRow
      ? {
          id: cierreRow.id,
          enFirme: cierreRow.estado === ESTADO_CIERRE_FIRME,
          balancePeriodo: cierreRow.balancePeriodo,
          balanceEncabezadoId: cierreRow.balanceEncabezadoId,
          moduloDatoEncabezadoId: cierreRow.moduloDatoEncabezadoId,
          cuentasBloqueadas: cierreRow._count.cuentas,
          cerradoPor: cierreRow.cerradoPor,
          cerradoEn: fmtDateTime(cierreRow.cerradoEn),
          desbloqueadoPor: cierreRow.desbloqueadoPor,
          desbloqueadoEn: cierreRow.desbloqueadoEn ? fmtDateTime(cierreRow.desbloqueadoEn) : null,
          justificacionDesbloqueo: cierreRow.justificacionDesbloqueo,
        }
      : null,
    puedeCerrar: cerrarAuth.ok,
    puedeDesbloquear: desbloquearAuth.ok,
    motivoNoCerrable: evaluacionCierre && !evaluacionCierre.ok ? evaluacionCierre.motivo : null,
  };

  const cruceContableVm: CruceContableVm = {
    balanceEncontrado: balanceEmparejado != null,
    periodo: encabezado.periodo,
    nombreCliente: encabezado.nombreCliente,
    resumen: cruce.cruceContable,
    sinMapeoContable: cruce.sinMapeoContable,
    sinReglaContableFilas: cruce.sinReglaContableFilas,
    bloqueo: cruce.bloqueo,
    avisoBalance: cruce.avisoBalance,
    balanceFuente: balanceEmparejado
      ? {
          id: balanceEmparejado.id,
          version: balanceEmparejado.version,
          periodoInicio: balanceEmparejado.periodoInicio,
          periodoFin: balanceEmparejado.periodoFin,
          esOficial: balanceEmparejado.esOficial,
          estaCongelado: balanceEmparejado.estaCongelado,
          descripcion: balanceEmparejado.descripcion,
        }
      : null,
    filasMarcadas: cruce.filasMarcadas,
    resumenMarcas: cruce.resumenMarcas,
    detalleContablePorCuenta: cruce.detalleContablePorCuenta,
    fueraDelModulo: cruce.fueraDelModulo,
    conciliacion: cierreVm,
    nomina: cruce.nomina,
  };

  // Fecha de corte y divisa del cargue (Cartera, CxP): contra la fecha se miden días y edades.
  const fechaCorte = encabezado.fechaCorte ? fechaCalendarioISO(encabezado.fechaCorte) : finDePeriodo(encabezado.periodo);
  const monedasCargue = [...new Set(
    encabezado.detalles
      .map((d) => (d.datos as Record<string, unknown> | null)?.[CLAVE_MONEDA])
      .filter((m): m is string => typeof m === "string"),
  )].sort();
  const cruceTerceroVm: CruceTerceroVm = {
    aplica: descriptor.crucePorTercero.habilitado,
    periodo: encabezado.periodo,
    nombreCliente: encabezado.nombreCliente,
    estado: cruceTercero?.estado ?? "sin_balance",
    mensaje: cruceTercero?.mensaje ?? null,
    avisoBalance: cruce.avisoBalance,
    balance: balanceEmparejado
      ? {
          id: balanceEmparejado.id,
          version: balanceEmparejado.version,
          periodoFin: balanceEmparejado.periodoFin,
          esOficial: balanceEmparejado.esOficial,
          estaCongelado: balanceEmparejado.estaCongelado,
          descripcion: balanceEmparejado.descripcion,
        }
      : null,
    balanceTercero: cruceTercero?.balanceTercero ?? null,
    resumen: cruceTercero?.resumen ?? null,
    resumenMarcas: cruceTercero?.resumenMarcas ?? null,
    emparejamientos: cruceTercero?.emparejamientos ?? [],
    umbralDescuadre: cruceTercero?.umbralDescuadre ?? 0,
    parametros: descriptor.crucePorTercero.detalleTercero
      ? {
          fechaCorte,
          fechaCorteDeclarada: encabezado.fechaCorte != null,
          trmCierre: encabezado.trmCierre == null ? null : Number(encabezado.trmCierre),
          monedas: monedasCargue,
        }
      : null,
    contableExcluidoFilas: cruceTercero?.contableExcluidoFilas ?? 0,
    contableNoModular: cruceTercero?.contableNoModular ?? { total: 0, filas: 0, cuentas: [] },
    moduloDerivadoDelDetalle: cruceTercero?.moduloDerivadoDelDetalle ?? false,
    moduloNoAtribuido: cruceTercero?.moduloNoAtribuido ?? 0,
    ...etiquetasCruceTercero(descriptor),
  };

  // Cartera y CxP: validaciones del auxiliar por tercero, recalculadas al leer sobre el detalle
  // y el cruce recién construidos (edades vs total, documentos repetidos, claves, naturaleza).
  const novedadesVm: NovedadesVm = descriptor.nomina
    ? {
        ...novedades,
        // Nómina: netos por fila, conceptos sin cuenta / con reparto, deducciones de control,
        // cédulas con varios nombres y meses del archivo, sobre el mismo consolidado del cruce.
        nomina: validarNomina({
          detalle: encabezado.detalles.map((d) => ({ filaNum: d.filaNum, valor: Number(d.valor), datos: (d.datos ?? {}) as Record<string, unknown> })),
          renglones: cruce.nomina?.renglones ?? consolidadoNomina?.renglones ?? [],
        }),
      }
    : descriptor.crucePorTercero.detalleTercero
    ? {
        ...novedades,
        tercero: validarAuxiliarTercero({
          filas: encabezado.detalles.map((d) => ({
            filaNum: d.filaNum,
            valor: Number(d.valor),
            imputable: d.imputable,
            nitCanonico: d.nitCanonico,
            datos: (d.datos ?? {}) as Record<string, unknown>,
            nivel: d.nivel,
          })),
          cruce: cruceTercero?.resumen ?? null,
          naturaleza: descriptor.crucePorTercero.naturaleza,
          umbralNaturaleza: (await getUmbralesAlertas()).naturaleza,
          fechaCorte,
          // Tipo de formato de cada archivo: decide qué controles aplican y cuáles no se
          // pudieron validar. Los cargues anteriores (null) se deducen de sus filas.
          nivelImputable: encabezado.nivelSaldo === "documento" || encabezado.nivelSaldo === "tercero" ? encabezado.nivelSaldo : undefined,
          formatos: leerFormatosCartera(encabezado.formatosCartera),
        }),
      }
    : novedades;

  // Columnas de la tabla de detalle: las del descriptor más, cuando el archivo las trajo,
  // una por cada rango de vencimiento. Ver `columnas-cartera.ts`.
  const columnasDeLaTabla = columnasDetalleModulo(descriptor, encabezado.rangosEdades);

  const versiones: VersionModuloVm[] = hermanos.map((hermano) => ({
    id: hermano.id,
    version: hermano.version,
    esOficial: hermano.esOficial,
    filas: hermano.filas,
    total: Number(hermano.total),
    archivoNombre: hermano.archivoNombre,
    archivoTam: hermano.archivoTam,
    origenExtraccion: hermano.origenExtraccion,
    observaciones: hermano.observaciones,
    cargadoPor: hermano.cargadoPor,
    ultimaCarga: fmtDateTime(hermano.ultimaCarga),
  }));
  const vigente = hermanos.find((hermano) => hermano.esOficial) ?? hermanos[0] ?? null;

  return (
    <div>
      <div className="mb-3"><BackLink href={`/modulos/${codigo.toLowerCase()}`} label={`Volver a ${descriptor.label}`} /></div>
      <PageHeader
        title={`${descriptor.label} · ${encabezado.nombreCliente}`}
        subtitle={`Período ${encabezado.periodo} · v${encabezado.version}${encabezado.esOficial ? " vigente" : " histórica"} · ${encabezado.filas} filas`}
      />
      {!encabezado.esOficial && vigente && vigente.id !== encabezado.id && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
          <span>Estás consultando una versión histórica. La versión vigente es v{vigente.version}.</span>
          <Link href={`/modulos/${codigo.toLowerCase()}/${vigente.id}?tab=versiones`} className="font-semibold text-blue-700 hover:underline">
            Abrir versión vigente
          </Link>
        </div>
      )}
      <DatoCargadoClient
        moduloCodigo={moduloCodigo}
        moduloLabel={descriptor.label}
        encabezadoId={encabezado.id}
        comentarios={comentariosPorAncla}
        clienteId={encabezado.clienteId}
        total={Number(encabezado.total)}
        columnas={columnasDeLaTabla}
        clasificadorEtiqueta={descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiqueta ?? "Clasificador"}
        detalle={detalleVm}
        consolidado={consolidadoVm}
        cruceContable={cruceContableVm}
        cruceTercero={cruceTerceroVm}
        novedades={novedadesVm}
        cuentas={cuentasModulo.map((s) => ({ codigo: s.codigo, nombre: s.nombre }))}
        nivelCruce={nivel}
        homologacionCliente={homologacionPorSubgrupo}
        resolucionCliente={resolucionCliente}
        agrupadores={agrupadoresVm}
        puedeEditar={puedeEditar}
        versiones={versiones}
        versionActualId={encabezado.id}
        tabInicial={query.tab === "versiones" ? "versiones" : null}
      />
      <div className="mt-4">
        <Conversacion
          tipo="modulos_datos"
          entityId={encabezado.id}
          titulo={`Conversación · ${descriptor.label} · ${encabezado.nombreCliente} · ${encabezado.periodo} v${encabezado.version}`}
        />
      </div>
    </div>
  );
}
