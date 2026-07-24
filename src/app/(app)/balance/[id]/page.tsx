import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { PageHeader, StatCard, Chip, BackLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmt, fmtDateTime } from "@/lib/format";
import { reconstruirBalance, agruparJerarquia } from "@/lib/balance/calcular";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import BalanceDetailClient, {
  type Meta, type Version,
} from "./balance-detail-client";
import { parseId } from "@/lib/ids";
import { FreezeBalanceButton } from "./freeze-balance-button";
import { ExportarBalance } from "./exportar-balance";
import { FlashToast } from "@/components/flash-toast";
import Conversacion from "@/components/conversacion";

export default async function BalanceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cargado?: string }> }) {
  await requirePermiso("balance:ver");
  const { id: rawId } = await params;
  const { cargado } = await searchParams;
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
  const [editarAuth, mapearAuth, cuentasEstandar, subgrupos, hermanos, comentariosGrp, validacionesRows, umbrales] = await Promise.all([
    authorizePermiso("balance:editar", { clientId }),
    authorizePermiso("balance:crear", { clientId }),
    getCuentasEstandar(),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true, grupo: true, nombreGrupo: true } }),
    prisma.balancePruebaEncabezado.findMany({
      where: { clienteId: balance.clienteId, periodo: balance.periodo },
      orderBy: { creadoEn: "desc" },
      select: { id: true, version: true, ultimaCarga: true, cargadoPor: true, rolCarga: true, archivo: true, tamanoArchivo: true, filasTotales: true, sumaActivo: true, cuadrado: true, nota: true, cambios: true, creadoEn: true },
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
  ]);
  // Editar (congelar) y mapear exigen alcance de escritura; las Server Actions
  // vuelven a verificarlo al ejecutar.
  const puedeEditar = editarAuth.ok;
  const puedeMapear = mapearAuth.ok;
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
  const sums = balance.detalles.length > 0 ? calc.sums : null;
  const validations = calc.validations;
  // Árbol normalizado a Russell: clase(2) → subgrupo(4) → cuenta estándar(6) → cuenta cliente(8).
  const nombresRussell = new Map(cuentasEstandar.map((s) => [s.code, s.name]));
  const nombre4 = new Map(subgrupos.map((s) => [s.codigo, s.nombre]));
  const nombre2 = new Map(subgrupos.map((s) => [s.grupo, s.nombreGrupo]));
  const arbol = agruparJerarquia(filas, cuentasEstandar, nombresRussell, { nombre4, nombre2 });
  const estandarOpciones = cuentasEstandar.map((s) => ({ code: s.code, name: s.name }));

  // Bitácora de versiones: los encabezados hermanos del mismo (cliente, período)
  // (cargados arriba en paralelo con el plan estándar).
  const versions: Version[] = hermanos.map((h) => ({
    v: h.version, date: h.ultimaCarga ? fmtDateTime(h.ultimaCarga) : "—", uploadedBy: h.cargadoPor ?? "—", role: h.rolCarga ?? "—",
    file: h.archivo ?? "—", size: h.tamanoArchivo ?? "—", rows: h.filasTotales, sumA: Number(h.sumaActivo),
    balanced: h.cuadrado, note: h.nota ?? "", changes: h.cambios,
  }));
  // Hay diff si existe una versión anterior a esta (cargada antes).
  const esta = hermanos.find((h) => h.id === id);
  const hasDiff = esta != null && hermanos.some((h) => h.creadoEn < esta.creadoEn);

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
      {cargado && <FlashToast title="Balance cargado" message="El borrador se promovió a balance oficial." clearParam="cargado" />}
      <div className="mb-3"><BackLink href="/balance" label="Balance de comprobación" /></div>
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
            {!balance.estaCongelado && puedeEditar && (
              <FreezeBalanceButton id={id} />
            )}
            {balance.estaCongelado && <Chip label="Congelado" tone="blue" />}
          </div>
        }
      />

      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
        <span className="inline-flex items-center gap-1"><Icon name="upload" size={12} /> {meta.uploadedBy} · {meta.uploadedAt}</span>
        {balance.estaCongelado && <span className="inline-flex items-center gap-1 text-ok-700"><Icon name="check" size={12} /> Congelada por {meta.frozenBy} · {meta.frozenAt}</span>}
        <span className="font-mono">{meta.file} · {meta.fileSize} · {meta.rows} cuentas</span>
      </p>

      {!sums && (
        <div className="rounded-lg border border-ink-150 bg-white p-6 text-[13px] text-ink-500">
          Esta versión no tiene detalle contable cargado. El detalle completo está en la versión oficial congelada.
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
            validations={validations}
            versions={versions}
            officialVersion={balance.version}
            warnCount={warnCount}
            balanceId={id}
            comentarios={comentariosPorAncla}
            validaciones={validaciones}
            puedeValidar={puedeMapear}
            puedeEliminar={puedeMapear && !balance.estaCongelado}
            sums={sums}
            balanced={calc.balanced}
            diffCuadre={calc.diffCuadre}

            umbrales={umbrales}
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
