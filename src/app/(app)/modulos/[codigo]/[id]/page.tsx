import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";
import { PageHeader, BackLink } from "@/components/ui";
import Conversacion from "@/components/conversacion";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import {
  filtrarSubgruposPorModulo,
  prefijosCuentaModulo,
  cuenta4DelModulo,
} from "@/lib/modulos/cuentas-modulo";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { validacionDelCargue } from "@/lib/modulos/validacion-cargue";
import { detectarNegativos, detectarDescuadres } from "@/lib/modulos/validaciones";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { fmtDateTime } from "@/lib/format";
import { construirCruceTercero, type ResumenCruceTercero } from "@/lib/modulos/cruce-tercero";
import { normalizarTerceroModulo } from "@/lib/modulos/tercero";
import { filasEfectivasTercero } from "@/lib/balance/staging-tercero";
import { agregarPorNit } from "@/lib/modulos/agregar-por-nit";
import { calcularValorContableModulo } from "@/lib/modulos/valor-contable";
import { balanceTerminaEnPeriodo } from "@/lib/modulos/compuerta-cruce";
import { construirCruceContableModulo } from "@/lib/modulos/cruce-contable-servidor";
import { ESTADO_CIERRE_FIRME, evaluarCierreConciliacion } from "@/lib/conciliacion/cuentas-bloqueo";
import { autorizarCierreConciliacion } from "@/lib/conciliacion/verificar-bloqueo";
import DatoCargadoClient, { type FilaDetalleVm, type ConsolidadoVm, type NovedadesVm, type VersionModuloVm, type CruceContableVm, type CruceTerceroVm, type CierreConciliacionVm } from "./dato-cargado-client";

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

  const [consolidacionRows, subgrupos, catalogoPrevalidador, comentariosGrp, cuentasCliente, hermanos] = await Promise.all([
    prisma.consolidacionModuloCliente.findMany({
      where: { clienteId: encabezado.clienteId, moduloCodigo },
      select: { clasificador: true, descripcion: true, cuenta4: true },
    }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true }, orderBy: { codigo: "asc" } }),
    getCatalogoPrevalidador(),
    prisma.comment.groupBy({ by: ["anchor"], where: { entityType: "modulos_datos", entityId: encabezadoId }, _count: { _all: true } }),
    // Homologación del cliente: cuentas propias mapeadas al plan Russell (para detallar por subgrupo).
    prisma.clientAccount.findMany({
      where: { clienteId: encabezado.clienteId, cuenta6Russell: { not: null } },
      select: { code: true, name: true, level: true, cuenta6Russell: true },
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
  ]);
  // Un clasificador puede tener 1..N cuentas: agrupamos en lista (ordenada).
  const cuentasPorClasificador = new Map<string, string[]>();
  // Nombre legible del clasificador cuando existe (Nómina: el clasificador es el CÓDIGO
  // del concepto y la descripción es su nombre, cargado en /config/conceptos-nomina).
  const descripcionPorClasificador = new Map<string, string>();
  for (const r of consolidacionRows) {
    const lista = cuentasPorClasificador.get(r.clasificador) ?? [];
    lista.push(r.cuenta4);
    cuentasPorClasificador.set(r.clasificador, lista);
    if (r.descripcion && !descripcionPorClasificador.has(r.clasificador)) {
      descripcionPorClasificador.set(r.clasificador, r.descripcion);
    }
  }
  for (const [k, v] of cuentasPorClasificador) cuentasPorClasificador.set(k, [...new Set(v)].sort());
  // Nombres del plan completo (por si hay un mapeo legado fuera del módulo).
  const nombrePorCuenta = new Map(subgrupos.map((s) => [s.codigo, s.nombre]));
  const comentariosPorAncla: Record<string, number> = {};
  for (const g of comentariosGrp) if (g.anchor) comentariosPorAncla[g.anchor] = g._count._all;
  // El datalist solo ofrece cuentas Russell del módulo (p. ej. INV → 14xx).
  const prefijosModulo = prefijosCuentaModulo(moduloCodigo, catalogoPrevalidador);
  const cuentasModulo = filtrarSubgruposPorModulo(subgrupos, prefijosModulo);
  // Cuentas del CLIENTE homologadas a cada subgrupo Russell del módulo (14XX → [143505 «…»]).
  const codigosModulo = new Set(cuentasModulo.map((c) => c.codigo));
  const homologacionPorSubgrupo: Record<string, { codigo: string; nombre: string }[]> = {};
  // Índice INVERSO (cuenta del cliente → su cuenta Russell de 4 díg) para que el campo
  // rápido del cruce acepte que el usuario escriba su propia cuenta. Va SIN filtrar por
  // módulo a propósito: así se puede avisar «143504 está homologada a 4175, que no
  // pertenece a Inventarios» en vez de un «no encontrada» que haría pensar que falta
  // parametrizarla. Quien decide si entra es `resolverCuenta4`.
  const resolucionCliente: Record<string, { cuenta4: string; nombre: string }> = {};
  for (const a of cuentasCliente) {
    const sub = (a.cuenta6Russell ?? "").replace(/\D/g, "").slice(0, 4);
    if (sub) resolucionCliente[a.code] = { cuenta4: sub, nombre: a.name };
    if (!codigosModulo.has(sub)) continue;
    (homologacionPorSubgrupo[sub] ??= []).push({ codigo: a.code, nombre: a.name });
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

  const consolidado = consolidarPorClasificador(detalleVm.map((d) => ({ clasificador: d.clasificador, valor: d.valor })));
  const consolidadoVm: ConsolidadoVm[] = consolidado.map((c) => ({
    clasificador: c.clasificador,
    descripcion: descripcionPorClasificador.get(c.clasificador) ?? null,
    total: c.total,
    filas: c.filas,
    cuentas4: (cuentasPorClasificador.get(c.clasificador) ?? []).map((cod) => ({ codigo: cod, nombre: nombrePorCuenta.get(cod) ?? null })),
  }));
  // Cruce contable (balance vs. archivos del módulo): el MISMO cálculo que verifica
  // la Server Action al cerrar la conciliación (`cruce-contable-servidor.ts`).
  const cruce = await construirCruceContableModulo({
    encabezado: {
      id: encabezado.id,
      clienteId: encabezado.clienteId,
      nombreCliente: encabezado.nombreCliente,
      moduloCodigo,
      periodo: encabezado.periodo,
      verificaciones: encabezado.verificaciones,
      detalles: detalleVm.map((d) => ({ clasificador: d.clasificador, valor: d.valor })),
    },
    consolidacionRows,
    subgrupos,
    catalogoPrevalidador,
  });
  const balanceEmparejado = cruce.balanceEmparejado;

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
  const evaluacionCierre = cruce.cruceContable ? evaluarCierreConciliacion(cruce.cruceContable, cruce.resumenMarcas) : null;
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
    balanceFuente: balanceEmparejado
      ? {
          id: balanceEmparejado.id,
          version: balanceEmparejado.version,
          periodoInicio: balanceEmparejado.periodoInicio,
          periodoFin: balanceEmparejado.periodoFin,
          esOficial: balanceEmparejado.esOficial,
          estaCongelado: balanceEmparejado.estaCongelado,
        }
      : null,
    filasMarcadas: cruce.filasMarcadas,
    resumenMarcas: cruce.resumenMarcas,
    conciliacion: cierreVm,
  };

  // Cruce por tercero: la configuración tipada del descriptor decide si el módulo
  // consulta el balance por tercero y presenta la pestaña. Cambiar la disponibilidad
  // no requiere tocar este loader ni el componente cliente.
  // Mismo criterio de emparejamiento de período que el cruce contable, pero contra
  // el balance abierto POR TERCERO del cliente (`balance_tercero_*`, capturado al
  // confirmar el borrador con apertura «por terceros»).
  const tieneRolTercero = descriptor.crucePorTercero.habilitado;
  const rolCruceTercero = descriptor.crucePorTercero.rolClave ?? "tercero";
  const rolNombreCruce = descriptor.crucePorTercero.rolNombre ?? null;
  let cruceTercero: ResumenCruceTercero | null = null;
  let balanceTerceroEncontrado = false;
  // Cargue por tercero emparejado (mismo año-mes): lo necesita el enlace de la pestaña.
  let balanceTerceroRef: { id: number; version: string } | null = null;
  let contableSinNit: { total: number; filas: number } | null = null;
  let moduloSinNit: { total: number; filas: number } | null = null;
  let contableExcluidoFilas = 0;

  if (tieneRolTercero) {
    const balancesTercero = await prisma.balanceTerceroEncabezado.findMany({
      where: { clienteId: encabezado.clienteId },
      select: { id: true, periodoFin: true, version: true },
      orderBy: [{ esOficial: "desc" }, { periodoFin: "desc" }, { id: "desc" }],
    });
    const balanceTerceroEmparejado = balancesTercero.find(
      (b) => balanceTerminaEnPeriodo(b.periodoFin, encabezado.periodo),
    ) ?? null;
    balanceTerceroEncontrado = balanceTerceroEmparejado != null;
    balanceTerceroRef = balanceTerceroEmparejado
      ? { id: balanceTerceroEmparejado.id, version: balanceTerceroEmparejado.version }
      : null;

    if (balanceTerceroEmparejado) {
      const detallesTerceroCrudos = await prisma.balanceTerceroDetalle.findMany({
        where: { encabezadoId: balanceTerceroEmparejado.id },
        select: {
          cuenta4: true,
          cuenta8: true,
          cuenta6Russell: true,
          nitTercero: true,
          nombreTercero: true,
          debitos: true,
          creditos: true,
          saldoFinal: true,
        },
      });
      // Dedup de la fila «propia» (cargues capturados del borrador): una cuenta
      // con detalle usa solo sus terceros; su consolidado no infla el «sin NIT».
      const detallesTercero = filasEfectivasTercero(detallesTerceroCrudos);
      const itemsContables: { nit: string | null; nombre: string | null; saldo: number }[] = [];
      for (const d of detallesTercero) {
        if (!d.cuenta6Russell) {
          if (cuenta4DelModulo(d.cuenta4, prefijosModulo)) contableExcluidoFilas += 1;
          continue;
        }
        const sub4 = d.cuenta6Russell.replace(/\D/g, "").slice(0, 4);
        if (!codigosModulo.has(sub4)) continue;
        const calculo = calcularValorContableModulo({
          moduloCodigo,
          cuentaRussell: d.cuenta6Russell,
          fila: {
            debitos: Number(d.debitos),
            creditos: Number(d.creditos),
            saldoFinal: Number(d.saldoFinal),
          },
          catalogo: catalogoPrevalidador,
        });
        if (!calculo) {
          contableExcluidoFilas += 1;
          continue;
        }
        itemsContables.push({ nit: d.nitTercero, nombre: d.nombreTercero, saldo: calculo.valor });
      }
      const { aportes: contablePorNit, sinNit: contableSinNitCalc } = agregarPorNit(itemsContables);
      contableSinNit = contableSinNitCalc;

      // Cada fila del detalle ya llegó a `modulo_dato_detalle` como IMPUTABLE (movimiento,
      // no omitida, no en cero): la promoción (`esImputable`) filtra antes de persistir.
      const itemsModulo = detalleVm.map((d) => {
        const t = normalizarTerceroModulo(d.datos[rolCruceTercero] as string | number | null | undefined);
        const nombreAparte = rolNombreCruce ? String(d.datos[rolNombreCruce] ?? "").trim() || null : null;
        return { nit: t.nitCanonico, nombre: t.nombre ?? nombreAparte, saldo: d.valor };
      });
      const { aportes: moduloPorNit, sinNit: moduloSinNitCalc } = agregarPorNit(itemsModulo);
      moduloSinNit = moduloSinNitCalc;

      cruceTercero = construirCruceTercero({ contablePorNit, moduloPorNit });
    }
  }

  const cruceTerceroVm: CruceTerceroVm = {
    aplica: tieneRolTercero,
    balanceEncontrado: balanceTerceroEncontrado,
    balanceTerceroId: balanceTerceroRef?.id ?? null,
    balanceTerceroVersion: balanceTerceroRef?.version ?? null,
    periodo: encabezado.periodo,
    nombreCliente: encabezado.nombreCliente,
    resumen: cruceTercero,
    contableSinNit,
    moduloSinNit,
    contableExcluidoFilas,
    etiquetaClave: rolCruceTercero === "cedula" ? "Cédula" : "NIT",
    etiquetaNombre: rolCruceTercero === "cedula" ? "Empleado" : "Nombre",
  };

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
        columnas={descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo }))}
        clasificadorEtiqueta={descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiqueta ?? "Clasificador"}
        detalle={detalleVm}
        consolidado={consolidadoVm}
        cruceContable={cruceContableVm}
        cruceTercero={cruceTerceroVm}
        novedades={novedades}
        cuentas={cuentasModulo.map((s) => ({ codigo: s.codigo, nombre: s.nombre }))}
        homologacionCliente={homologacionPorSubgrupo}
        resolucionCliente={resolucionCliente}
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
