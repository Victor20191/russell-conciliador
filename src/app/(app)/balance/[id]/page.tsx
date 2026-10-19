import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { PageHeader, StatCard, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmt, fmtDateTime } from "@/lib/format";
import { reconstruirBalance, agruparJerarquia } from "@/lib/balance/calcular";
import { ORIGEN_PENDIENTE } from "@/lib/balance/mapeo-cliente-config";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import { etiquetaApertura, parsearApertura } from "@/lib/balance/apertura-balance";
import { cargarContextoPrevalidadorBalance, cargarHistorialRevisionesPrevalidador } from "@/lib/balance/prevalidador/servidor";
import { construirHistorialRevisiones } from "@/lib/balance/prevalidador/historial";
import BalanceDetailClient, {
  type Meta, type Version,
} from "./balance-detail-client";
import { tabDesdeParametro } from "./tabs";
import { parseId } from "@/lib/ids";
import { FreezeBalanceButton } from "./freeze-balance-button";
import { DescongelarBalanceButton } from "./descongelar-balance-button";
import { quedoDescongelado } from "@/lib/balance/descongelar";
import { estadoBalance, tonoEstadoBalance } from "@/lib/balance/estado-balance";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { ReaplicarMapeoButton } from "./reaplicar-mapeo-button";
import { cruzaClaseContable } from "@/lib/balance/clase-contable";
import { ExportarBalance } from "./exportar-balance";
import { EliminarBalanceButton } from "./eliminar-balance-button";
import { alcancesEliminacionPermitidos, bloqueosEliminacionBalance } from "@/lib/balance/alcance-eliminacion";
import { FlashToast } from "@/components/flash-toast";
import { ComentarioAprobacion } from "./comentario-aprobacion";
import {
  construirNotasAprobacionBalance,
  parsearRevisionesReubicacionBalance,
} from "@/lib/balance/revisiones-reubicacion-balance";
import Conversacion from "@/components/conversacion";
import { cargarVistaCorte } from "@/lib/balance/comparacion-corte-servidor";
import { CortePanel } from "./corte-panel";
import { cierresFirmes, cuentasBloqueadas } from "@/lib/conciliacion/verificar-bloqueo";
import { ConciliacionEnFirmeBanner, type BloqueoCuentaVm, type CierreFirmeVm } from "./conciliacion-en-firme";
import { evaluarCierreBalance, mensajePrevalidadorParaCerrar } from "@/lib/balance/cierre-balance";
import { evaluarReemplazoBalance } from "@/lib/balance/reemplazo-balance";
import { leerDescuadreAlCargar } from "@/lib/balance/cuadre-borrador";
import { EliminarBalanceCorteButton, ReemplazarBalanceButton, type ReemplazoVm } from "./acciones-corte";
import type { ReactNode } from "react";

export default async function BalanceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cargado?: string; tab?: string }> }) {
  await requirePermiso("balance:ver");
  const { id: rawId } = await params;
  const { cargado, tab } = await searchParams;
  const id = parseId(rawId);
  if (!id) notFound();
  const balance = await prisma.balancePruebaEncabezado.findUnique({
    where: { id },
    include: {
      detalles: {
        select: { id: true, cuenta8: true, nombreCuenta: true, cuenta6Russell: true, coincidencia: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
      },
    },
  });
  if (!balance) notFound();

  // Alcance por cartera: leer este balance exige READ sobre su cliente. Quien
  // no lo alcanza (cliente ajeno) es redirigido; Admin/Superadmin ven todo.
  const clientId = balance.clienteId;
  await requirePermiso("balance:ver", { clientId });

  // Agregados RECALCULADOS desde el detalle. Plan estándar (cacheado), subgrupos
  // (nombres de nivel 4/2), la bitácora y los permisos de UI se cargan en una
  // sola ola después de validar el alcance de lectura.
  const [
    mapearAuth,
    revisarAuth,
    eliminarAuth,
    cuentasEstandar,
    subgrupos,
    hermanos,
    comentariosGrp,
    validacionesRows,
    umbrales,
    balancesCliente,
    perfilesCliente,
    contextoPrevalidador,
    pendienteRows,
    vistaCorte,
    cierresPeriodo,
    bloqueadasPeriodo,
    terceroLigado,
    cierresCliente,
    cerradosCliente,
    historialRevisionesCrudo,
  ] = await Promise.all([
    authorizePermiso("balance:crear", { clientId }),
    authorizePermiso("balance:revisar", { clientId }),
    authorizePermiso("balance:eliminar", { clientId }),
    getCuentasEstandar(),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true, grupo: true, nombreGrupo: true } }),
    prisma.balancePruebaEncabezado.findMany({
      where: { clienteId: balance.clienteId, periodo: balance.periodo },
      orderBy: { creadoEn: "desc" },
      select: { id: true, version: true, ultimaCarga: true, cargadoPor: true, rolCarga: true, archivo: true, tamanoArchivo: true, filasTotales: true, sumaActivo: true, cuadrado: true, nota: true, comentarioAprobacion: true, reubicacionesAprobadas: true, cambios: true, aperturaBalance: true, creadoEn: true },
    }),
    // Conteo de comentarios por cuenta (ancla) de este balance, para los badges del árbol.
    prisma.comment.groupBy({ by: ["anchor"], where: { entityType: "balance", entityId: id }, _count: { _all: true } }),
    // Alertas ya VALIDADAS (OK + comentario) de este balance → se retiran de la vista.
    prisma.validacionAlerta.findMany({
      where: { balanceId: id },
      select: { anchor: true, tipoAlerta: true, validadoPor: true, validadoEn: true, comment: { select: { body: true } } },
    }),
    // Umbrales de alerta vigentes (/config/parametros). Como los agregados se
    // RECALCULAN al leer, cambiarlos se refleja de inmediato en este balance.
    getUmbralesAlertas(),
    prisma.balancePruebaEncabezado.count({
      where: { clienteId: balance.clienteId },
    }),
    prisma.perfilCargaBalance.count({
      where: { clienteId: balance.clienteId },
    }),
    // Carga estricta: un fallo de catálogo/override no puede convertirse en un
    // informe aparentemente válido con valores predeterminados.
    cargarContextoPrevalidadorBalance(id)
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const })),
    // Códigos del cliente marcados «Pendiente por Asignar» (grupo o cuenta
    // exacta): solo pintan el badge, el prevalidador no cambia por esto.
    prisma.clientAccount.findMany({
      where: { clienteId: balance.clienteId, origenMapeo: ORIGEN_PENDIENTE },
      select: { code: true },
    }),
    // Balances con la misma fecha de corte y si sus saldos finales coinciden (fail-closed).
    cargarVistaCorte({ id, clienteId: clientId, periodoFin: balance.periodoFin }),
    // Conciliación EN FIRME del mes de corte del balance (cualquier módulo, aunque se haya
    // conciliado contra un balance de otro período con la misma fecha fin): cierres + cuentas.
    cierresFirmes(clientId, balance),
    cuentasBloqueadas(clientId, balance),
    // Captura por tercero LIGADA a este cargue (misma llave `loteId` que usa la
    // promoción y el visor). Un cargue con apertura «tercero» pero sin captura
    // (archivo sin detalle reconocible, evento «SIN DETALLE POR TERCERO») no
    // ofrece el visor: no habría nada que mostrar.
    balance.loteId
      ? prisma.balanceTerceroEncabezado.findUnique({ where: { loteId: balance.loteId, clienteId: balance.clienteId }, select: { id: true } })
      : Promise.resolve(null),
    // Todas las conciliaciones en firme del cliente: deciden qué alcances de «Eliminar» se ofrecen
    // (el balance con que se cerró una no se elimina hasta desbloquearla).
    cierresFirmes(clientId),
    // Balances cerrados del cliente: se abren antes de eliminarlos.
    prisma.balancePruebaEncabezado.findMany({ where: { clienteId: clientId, estaCongelado: true }, select: { id: true, periodo: true, version: true } }),
    // Aprobaciones y revocaciones del prevalidador de este balance (pestaña Prevalidador › Historial).
    cargarHistorialRevisionesPrevalidador(id),
  ]);
  const cierresVm: CierreFirmeVm[] = cierresPeriodo.map((c) => ({
    id: c.id,
    moduloCodigo: c.moduloCodigo,
    periodo: c.periodo,
    moduloDatoEncabezadoId: c.moduloDatoEncabezadoId,
    balanceEncabezadoId: c.balanceEncabezadoId,
    cerradoPor: c.cerradoPor,
    cerradoEn: fmtDateTime(c.cerradoEn),
    cuentas: bloqueadasPeriodo.filter((b) => b.cierre.id === c.id).length,
  }));
  // Distintivo por cuenta (hoja del árbol): quién la cerró, desde qué cargue y cuándo.
  const bloqueos: Record<string, BloqueoCuentaVm> = {};
  for (const b of bloqueadasPeriodo) {
    bloqueos[b.cuenta8] = {
      moduloCodigo: b.cierre.moduloCodigo,
      moduloDatoEncabezadoId: b.cierre.moduloDatoEncabezadoId,
      cerradoPor: b.cierre.cerradoPor,
      cerradoEn: fmtDateTime(b.cierre.cerradoEn),
    };
  }
  const codigosPendientes = new Set(pendienteRows.map((r) => r.code));
  // Homologar, re-homologar con la memoria, congelar y descongelar son del senior
  // asignado (o un administrador, `balance:revisar`); validar alertas, eliminar una
  // cuenta del detalle y la cuenta alternativa del prevalidador siguen con quien
  // carga (`balance:crear`, escritura). Las Server Actions vuelven a verificarlo.
  const puedeCongelar = revisarAuth.ok;
  const puedeHomologar = revisarAuth.ok && !balance.estaCongelado;
  const puedeMapear = mapearAuth.ok && !balance.estaCongelado;
  // Eliminar: los administradores (cualquier alcance) y el senior asignado (una versión o un
  // período). Un balance cerrado se abre antes y uno con conciliación en firme no se elimina.
  const puedeEliminarBalance = eliminarAuth.ok || revisarAuth.ok;
  // En proceso, en proceso con alertas o cerrado: el mismo rótulo del índice de /balance.
  const estado = estadoBalance(balance);
  // Abierto para corregirlo y aún sin volver a cerrar: aviso arriba con quién y por qué.
  const descongelada = quedoDescongelado(balance);
  const comentariosPorAncla: Record<string, number> = {};
  for (const g of comentariosGrp) if (g.anchor) comentariosPorAncla[g.anchor] = g._count._all;

  const validaciones: Record<string, { tipo: string; por: string; en: string; comentario: string }> = {};
  for (const v of validacionesRows) validaciones[v.anchor] = { tipo: v.tipoAlerta, por: v.validadoPor ?? "—", en: fmtDateTime(v.validadoEn), comentario: v.comment?.body ?? "" };
  const filas = balance.detalles.map((f) => ({
    id: f.id, cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
    coincidencia: f.coincidencia != null ? Number(f.coincidencia) : null,
    saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
  }));
  const calc = reconstruirBalance(filas, cuentasEstandar, umbrales);
  // Qué impide cerrar el balance (versión anterior, diferencias con otro balance del corte o
  // prevalidador). Solo anticipa: la acción recalcula el corte y decide en su transacción, así que un
  // par «sin comparar» no deshabilita el botón.
  const mensajePrevalidadorCierre = contextoPrevalidador.ok
    ? mensajePrevalidadorParaCerrar(contextoPrevalidador.value)
    : "No se puede cerrar el balance: no fue posible leer el prevalidador.";
  const evaluacionCierre = evaluarCierreBalance({
    balanceId: id,
    vigenteDeMiLinea: vistaCorte.vigenteDeMiLinea,
    anterioresCerradas: vistaCorte.anterioresCerradas,
    otros: vistaCorte.otros.map((o) => ({
      id: o.id,
      version: o.version,
      nombre: o.nombre,
      estaCongelado: o.estaCongelado,
      enFirme: o.enFirme.length > 0,
      comparacion: o.comparacion ? { inconsistente: o.comparacion.inconsistente, cuentas: o.comparacion.diferencias.length } : null,
    })),
    mensajePrevalidador: mensajePrevalidadorCierre,
    ignorarSinComparar: true,
  });
  const bloqueoCierre = evaluacionCierre.ok ? null : evaluacionCierre.bloqueo;
  // Cuentas homologadas a otra clase contable (validación V6): alimentan el badge
  // del botón de re-homologar, porque son las que la acción viene a resolver.
  const filasFueraDeClase = filas.filter((f) => cruzaClaseContable(f.cuenta8, f.cuenta6Russell));
  const montoFueraDeClase = filasFueraDeClase.reduce((acc, f) => acc + Math.abs(f.saldoFinal), 0);
  const prevalidador = contextoPrevalidador.ok
    ? contextoPrevalidador.value.prevalidador
    : {
        estado: "no_disponible" as const,
        mensaje: "No fue posible leer de forma íntegra el catálogo o las cuentas configuradas para este balance.",
      };
  const revisionPrevalidador = contextoPrevalidador.ok
    ? contextoPrevalidador.value.revision
    : {
        estado: "pendiente" as const,
        vigente: false,
        justificacion: null,
        actor: null,
        creadoEn: null,
        huella: null,
        instantaneaDisponible: false,
        catalogoCongelado: null,
      };
  const historialPrevalidador = construirHistorialRevisiones(historialRevisionesCrudo, revisionPrevalidador.estado);
  const sums = balance.detalles.length > 0 ? calc.sums : null;
  const validations = calc.validations;
  // Árbol normalizado a Russell: clase(2) → subgrupo(4) → cuenta estándar(6) → cuenta cliente(8).
  const nombresRussell = new Map(cuentasEstandar.map((s) => [s.code, s.name]));
  const nombre4 = new Map(subgrupos.map((s) => [s.codigo, s.nombre]));
  const nombre2 = new Map(subgrupos.map((s) => [s.grupo, s.nombreGrupo]));
  const arbol = agruparJerarquia(filas, cuentasEstandar, nombresRussell, { nombre4, nombre2 }, codigosPendientes);
  const estandarOpciones = cuentasEstandar.map((s) => ({ code: s.code, name: s.name }));

  // Bitácora de versiones: los encabezados hermanos del mismo (cliente, período)
  // (cargados arriba en paralelo con el plan estándar).
  // La constancia de cada versión se compone al LEER: nota aclaratoria (texto) +
  // reubicaciones aprobadas (JSON estructurado). En la bitácora va resumida; el
  // banner de esta versión las pinta con la misma ficha que mostró el borrador.
  // Vigentes del corte: la versión más reciente de cada línea (período + apertura).
  const idsVigentes = new Set([...vistaCorte.otros.map((o) => o.id), ...(vistaCorte.esVigente ? [id] : [])]);
  const versions: Version[] = hermanos.map((h) => {
    const reubicaciones = parsearRevisionesReubicacionBalance(h.reubicacionesAprobadas);
    return {
      id: h.id, v: h.version, vigente: idsVigentes.has(h.id),
      date: h.ultimaCarga ? fmtDateTime(h.ultimaCarga) : "—", uploadedBy: h.cargadoPor ?? "—", role: h.rolCarga ?? "—",
      file: h.archivo ?? "—", size: h.tamanoArchivo ?? "—", rows: h.filasTotales, sumA: Number(h.sumaActivo),
      balanced: h.cuadrado, note: h.nota ?? "",
      approvalNote: reubicaciones.length === 0
        ? h.comentarioAprobacion ?? ""
        : construirNotasAprobacionBalance(h.comentarioAprobacion, reubicaciones) ?? "",
      changes: h.cambios,
      apertura: h.aperturaBalance,
    };
  });
  const versionVigenteId = vistaCorte.vigenteDeMiLinea?.id ?? null;
  const conDiferencias = vistaCorte.otros.filter((o) => o.comparacion?.inconsistente);
  const reubicacionesAprobadas = parsearRevisionesReubicacionBalance(balance.reubicacionesAprobadas);
  // Cargado «Descuadrado» por algo distinto del archivo fuente: condiciones que fallaban.
  const descuadreAlCargar = leerDescuadreAlCargar(balance.descuadreBorrador);
  // Hay diff si existe una versión anterior a esta (cargada antes).
  const esta = hermanos.find((h) => h.id === id);
  const hasDiff = esta != null && hermanos.some((h) => h.creadoEn < esta.creadoEn);

  // Botones del panel del corte para resolver una diferencia: abrir el otro (si está cerrado),
  // eliminarlo (abierto y sin conciliación en firme) o reemplazarlo (con conciliación en firme, solo
  // desde la versión vigente que queda). Cada acción vuelve a comprobarlo todo en el servidor.
  const cierresAvisoCorte = cierresPeriodo.map((c) => ({ modulo: descriptorModulo(c.moduloCodigo)?.label ?? c.moduloCodigo, cargue: c.moduloDatoEncabezadoId, cerradoPor: c.cerradoPor }));
  const reemplazoDe = (viejo: { id: number; nombre: string; version: string }): ReemplazoVm => {
    const cierresViejo = cierresPeriodo.filter((c) => c.balanceEncabezadoId === viejo.id);
    const idsCierres = new Set(cierresViejo.map((c) => c.id));
    const evaluacion = evaluarReemplazoBalance({
      viejo: { id: viejo.id, clienteId: clientId, periodoFin: balance.periodoFin },
      nuevo: { id, clienteId: clientId, periodoFin: balance.periodoFin, esVigente: vistaCorte.esVigente },
      cierresDelViejo: cierresViejo,
      bloqueadas: bloqueadasPeriodo.filter((b) => idsCierres.has(b.cierre.id)).map((b) => ({ ...b, cierreId: b.cierre.id })),
      filasNuevas: filas,
      tercero: [],
      mensajePrevalidador: mensajePrevalidadorCierre,
      conciliacionesFormales: 0,
    });
    return {
      viejo,
      nuevo: { id, version: balance.version },
      cierres: cierresViejo.map((c) => ({ modulo: descriptorModulo(c.moduloCodigo)?.label ?? c.moduloCodigo, periodo: c.periodo, cargue: c.moduloDatoEncabezadoId })),
      cuentasEnFirme: evaluacion.ok ? evaluacion.cuentasEnFirme : new Set(bloqueadasPeriodo.filter((b) => idsCierres.has(b.cierre.id)).map((b) => b.cuenta8)).size,
      motivo: evaluacion.ok ? null : evaluacion.mensaje,
    };
  };
  const accionesCorte: Record<number, ReactNode> = {};
  if (vistaCorte.disponible && vistaCorte.esVigente) {
    for (const o of vistaCorte.otros) {
      if (!o.comparacion?.inconsistente) continue;
      if (o.enFirme.length > 0) {
        if (puedeCongelar) accionesCorte[o.id] = <ReemplazarBalanceButton reemplazo={reemplazoDe(o)} />;
      } else if (o.estaCongelado) {
        if (puedeCongelar) {
          accionesCorte[o.id] = (
            <DescongelarBalanceButton id={o.id} titulo={`${balance.nombreCliente} · ${o.periodo} · ${o.version}`} cierres={cierresAvisoCorte} compacto />
          );
        }
      } else if (puedeEliminarBalance) {
        accionesCorte[o.id] = <EliminarBalanceCorteButton balanceId={o.id} nombre={`${o.nombre} ${o.version}`} />;
      }
    }
    if (puedeCongelar) {
      for (const a of vistaCorte.anterioresEnFirme) accionesCorte[a.id] = <ReemplazarBalanceButton reemplazo={reemplazoDe(a)} />;
    }
  }

  const meta: Meta = {
    rows: balance.filasTotales, mapped: balance.mapeadas, unmapped: balance.sinMapear, critical: balance.criticas,
    file: balance.archivo ?? "—", fileSize: balance.tamanoArchivo ?? "—",
    frozenBy: balance.congeladoPor ?? "", frozenAt: balance.congeladoEn ? fmtDateTime(balance.congeladoEn) : "",
    uploadedBy: balance.cargadoPor ?? "—", uploadedAt: balance.ultimaCarga ? fmtDateTime(balance.ultimaCarga) : "—",
  };

  const okCount = validations.filter((v) => v.status === "ok").length;
  const warnCount = validations.filter((v) => v.status === "warn").length;

  return (
    <div>
      {cargado && (
        <FlashToast
          tone={conDiferencias.length > 0 || vistaCorte.estado === "sin_comparar" || !vistaCorte.disponible ? "info" : "success"}
          title="Balance cargado"
          message={conDiferencias.length > 0
            ? `Sus saldos finales difieren de ${conDiferencias.length} balance(s) del mismo corte: revisa «Balances del mismo corte».`
            : vistaCorte.estado === "sin_comparar" || !vistaCorte.disponible
              ? "La carga se completó. La comparación con los balances del mismo corte está pendiente; usa «Revisar comparación»."
              : "El borrador se confirmó como balance."}
          clearParam="cargado"
        />
      )}
      <PageHeader
        title={balance.nombreCliente}
        subtitle={`${balance.periodo} · versión ${balance.version}`}
        actions={
          <div className="flex items-center gap-2">
            {sums && <ExportarBalance id={id} />}
            {hasDiff && (
              <a href={`/balance/${id}/diff`} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50">
                <Icon name="log" size={14} /> Diff de versiones
              </a>
            )}
            {sums && puedeHomologar && (
              <ReaplicarMapeoButton
                id={id}
                fueraDeClase={filasFueraDeClase.length}
                montoFueraDeClase={montoFueraDeClase}
              />
            )}
            <Chip label={estado} tone={tonoEstadoBalance(estado)} />
            {!balance.estaCongelado && puedeCongelar && (
              <FreezeBalanceButton id={id} bloqueo={bloqueoCierre} />
            )}
            {balance.estaCongelado && puedeCongelar && (
              <DescongelarBalanceButton
                id={id}
                titulo={`${balance.nombreCliente} · ${balance.periodo} · ${balance.version}`}
                cierres={cierresAvisoCorte}
              />
            )}
            {puedeEliminarBalance && (
              <EliminarBalanceButton
                balanceId={id}
                nombreCliente={balance.nombreCliente}
                periodo={balance.periodo}
                version={balance.version}
                versionesPeriodo={hermanos.length}
                balancesCliente={balancesCliente}
                perfilesCliente={perfilesCliente}
                alcances={alcancesEliminacionPermitidos(eliminarAuth.ok)}
                bloqueos={bloqueosEliminacionBalance({
                  balanceId: id,
                  idsPeriodo: hermanos.map((h) => h.id),
                  cierresCliente: cierresCliente,
                  cerradosCliente,
                })}
              />
            )}
          </div>
        }
      />

      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
        <span className="inline-flex items-center gap-1"><Icon name="upload" size={12} /> {meta.uploadedBy} · {meta.uploadedAt}</span>
        {balance.estaCongelado && <span className="inline-flex items-center gap-1 text-ok-700"><Icon name="check" size={12} /> Cerrado por {meta.frozenBy} · {meta.frozenAt}</span>}
        <span className="font-mono">{meta.file} · {meta.fileSize} · {meta.rows} cuentas</span>
        {/* Apertura declarada al cargar. Los balances anteriores a este dato no la pintan. */}
        {parsearApertura(balance.aperturaBalance) && (
          <Chip
            label={etiquetaApertura(balance.aperturaBalance)}
            tone={parsearApertura(balance.aperturaBalance) === "tercero" ? "blue" : "ink"}
          />
        )}
        {/* Visor interno de solo lectura: compara la homologación y el saldo de cada
            cuenta contra su detalle por tercero ligado (mismo loteId). Solo tiene
            sentido cuando esta versión declaró apertura «por terceros» y trae su
            propio detalle cargado (captura ligada por loteId). */}
        {parsearApertura(balance.aperturaBalance) === "tercero" && sums && terceroLigado && (
          <a href={`/balance/${id}/terceros`} className="inline-flex items-center gap-1 font-medium text-blue-500 hover:underline">
            <Icon name="link" size={12} /> Ver por terceros
          </a>
        )}
      </p>

      {descongelada && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warn-500 bg-warn-100/40 px-3 py-2 text-[12.5px] text-warn-700">
          <Icon name="edit" size={13} />
          <span>
            Abierto por <b>{balance.descongeladoPor ?? "—"}</b> el {balance.descongeladoEn ? fmtDateTime(balance.descongeladoEn) : "—"} para corregirlo
            {balance.motivoDescongelado ? <>: «{balance.motivoDescongelado}»</> : null}.
          </span>
          <span className="font-semibold">
            Cuando termines, vuelve a cerrarlo: mientras esté abierto, los módulos no concilian contra él.
          </span>
        </div>
      )}

      {cierresVm.length > 0 && <ConciliacionEnFirmeBanner cierres={cierresVm} balanceId={id} periodo={balance.periodo} />}

      {/* Balances con la misma fecha de corte: un balance único, vigente y consultable no necesita el panel. */}
      {(!vistaCorte.disponible || !vistaCorte.esVigente || vistaCorte.otros.length > 0 || vistaCorte.anterioresEnFirme.length > 0) && (
        <CortePanel balanceId={id} vista={vistaCorte} puedeRevisar={mapearAuth.ok || puedeCongelar} accionesPorBalance={accionesCorte} />
      )}

      {(balance.comentarioAprobacion || balance.advertenciaArchivoFuente || descuadreAlCargar || reubicacionesAprobadas.length > 0) && (
        <ComentarioAprobacion
          comentario={balance.comentarioAprobacion}
          advertenciaArchivoFuente={balance.advertenciaArchivoFuente}
          diferenciaArchivoFuente={balance.diferenciaArchivoFuente != null ? Number(balance.diferenciaArchivoFuente) : null}
          descuadre={descuadreAlCargar}
          reubicaciones={reubicacionesAprobadas}
          version={`versión ${balance.version}`}
          autor={meta.uploadedBy}
          rol={balance.rolCarga ?? "—"}
          fecha={meta.uploadedAt}
        />
      )}

      {!sums && (
        <div className="rounded-lg border border-ink-150 bg-white p-6 text-[13px] text-ink-500">
          Esta versión no tiene detalle contable cargado. El detalle completo está en la versión vigente de su línea.
          {/* Sin detalle no se monta el detalle (ni su pestaña «Versiones»): sin
              esta salida, la versión sería un callejón sin salida. */}
          {versionVigenteId != null && versionVigenteId !== id && (
            <a
              href={`/balance/${versionVigenteId}?tab=versiones`}
              className="ml-1 font-medium text-blue-500 hover:underline"
            >
              Ver las {hermanos.length} versiones del período
            </a>
          )}
        </div>
      )}

      {sums && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Activo" value={fmt(sums.activo)} tone="blue" valueClassName="text-lg" />
            <StatCard label="Pasivo" value={fmt(sums.pasivo)} tone="ink" valueClassName="text-lg" />
            <StatCard label="Patrimonio" value={fmt(sums.patrimonio)} tone="ink" valueClassName="text-lg" />
            <StatCard label="Ingresos" value={fmt(sums.ingresos)} tone="ink" valueClassName="text-lg" />
            <StatCard label="Gastos" value={fmt(sums.gastos)} tone="ink" valueClassName="text-lg" />
            <StatCard label="Costos" value={fmt(sums.costos)} tone="ink" valueClassName="text-lg" />
            <StatCard label="Utilidad" value={fmt(sums.utilidad)} tone="ok" valueClassName="text-lg" />
            <StatCard label="Validaciones" value={`${okCount} ok`} hint={warnCount > 0 ? `${warnCount} alerta(s)` : "Sin alertas"} tone={warnCount > 0 ? "warn" : "ok"} valueClassName="text-lg" />
            {meta && <StatCard label="Mapeo al estándar" value={`${meta.mapped}/${meta.rows}`} hint={`${meta.critical} críticas`} tone="ink" valueClassName="text-lg" />}
          </div>

          <BalanceDetailClient
            arbol={arbol}
            estandar={estandarOpciones}
            puedeMapear={puedeMapear}
            puedeHomologar={puedeHomologar}
            puedeRevisarPrevalidador={revisarAuth.ok}
            estaCongelado={balance.estaCongelado}
            validations={validations}
            versions={versions}
            tabInicial={tabDesdeParametro(tab)}
            warnCount={warnCount}
            balanceId={id}
            comentarios={comentariosPorAncla}
            validaciones={validaciones}
            puedeValidar={puedeMapear}
            puedeEliminar={puedeMapear && !balance.estaCongelado}
            bloqueos={bloqueos}
            sums={sums}
            balanced={calc.balanced}
            diffCuadre={calc.diffCuadre}

            umbrales={umbrales}
            prevalidador={prevalidador}
            revisionPrevalidador={revisionPrevalidador}
            historialPrevalidador={historialPrevalidador}
          />
        </>
      )}

      {/* Conversación del balance completo (período). Los comentarios por cuenta
          se abren desde cada fila del detalle. */}
      <div className="mt-6">
        <Conversacion tipo="balance" entityId={id} titulo={`Conversación · ${balance.nombreCliente} · ${balance.periodo} ${balance.version}`} />
      </div>
    </div>
  );
}
