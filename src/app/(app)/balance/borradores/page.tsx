import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { fmtCalendarDate, fmtDate, fmtHora12 } from "@/lib/format";
import {
  contextoAccesoBorradorActual,
  filtroLotesVisibles,
  puedeVerBorrador,
  resolverVinculoClienteBorrador,
} from "@/lib/balance/autorizacion-borrador";
import BorradoresIndexClient, { type BorradorRow } from "./borradores-index-client";

export default async function BorradoresPage() {
  await requirePermiso("balance:crear");
  const contextoAcceso = await contextoAccesoBorradorActual();
  const filtroClientes = contextoAcceso.alcance.todos
    ? {}
    : { id: { in: contextoAcceso.alcance.clientIds } };
  const filtroPerfiles = contextoAcceso.alcance.todos
    ? {}
    : { clienteId: { in: contextoAcceso.alcance.clientIds } };

  // La lista usa el SNAPSHOT del encabezado en lugar de descargar y reconstruir
  // todas las filas de cada Excel. El staging puede superar fácilmente las cien mil
  // filas; agruparlo en PostgreSQL mantiene la detección de lotes huérfanos sin
  // transferirlos ni ejecutar el costoso view-model contable 83+ veces por visita.
  const [headersConsultados, clientes, perfilesPorClienteRows] = await Promise.all([
    prisma.balanceImportacionLote.findMany({
      where: filtroLotesVisibles(contextoAcceso),
      select: {
        loteId: true,
        clienteId: true,
        cargadoPorId: true,
        archivoNombre: true,
        nitDetectado: true,
        periodoInicial: true,
        periodoFinal: true,
        cuentasMovimiento: true,
        partidaDobleDiff: true,
        cuadrado: true,
        cargadoPor: true,
        creadoEn: true,
      },
    }),
    prisma.client.findMany({
      where: filtroClientes,
      select: { id: true, name: true, nit: true },
    }),
    prisma.perfilCargaBalance.groupBy({
      by: ["clienteId"],
      where: filtroPerfiles,
      _count: { _all: true },
    }),
  ]);
  // Defensa adicional en memoria: el mismo predicado protege cualquier cambio
  // futuro que amplíe accidentalmente la consulta.
  const headers = headersConsultados.filter((header) =>
    puedeVerBorrador(header, contextoAcceso),
  );
  const resumenStaging = await prisma.balanceImportacionStaging.groupBy({
    by: ["loteId", "tipoFila", "omitida"],
    where: contextoAcceso.alcance.todos
      ? {}
      : { loteId: { in: headers.map((header) => header.loteId) } },
    _count: { _all: true },
    _sum: { debitos: true, creditos: true },
    _max: { creadoEn: true },
  });
  const headerByLote = new Map(headers.map((h) => [h.loteId, h]));

  type ResumenLote = {
    creadoEn: Date | null;
    cuentasMovimiento: number;
    partidaDobleDiff: number;
  };
  const resumenByLote = new Map<string, ResumenLote>();
  for (const grupo of resumenStaging) {
    const actual = resumenByLote.get(grupo.loteId) ?? {
      creadoEn: null,
      cuentasMovimiento: 0,
      partidaDobleDiff: 0,
    };
    const creadoEn = grupo._max.creadoEn;
    if (creadoEn && (!actual.creadoEn || creadoEn > actual.creadoEn)) actual.creadoEn = creadoEn;
    if (grupo.tipoFila === "movimiento") {
      actual.cuentasMovimiento += grupo._count._all;
      if (grupo.omitida !== true) {
        actual.partidaDobleDiff += Number(grupo._sum.debitos ?? 0) - Number(grupo._sum.creditos ?? 0);
      }
    }
    resumenByLote.set(grupo.loteId, actual);
  }

  const perfilesPorCliente = new Map(
    perfilesPorClienteRows.map((fila) => [fila.clienteId, fila._count._all]),
  );

  const rows: BorradorRow[] = [...resumenByLote.keys()]
    .map((loteId) => {
      const h = headerByLote.get(loteId);
      const resumen = resumenByLote.get(loteId)!;
      const cliente = resolverVinculoClienteBorrador(
        {
          clienteId: h?.clienteId ?? null,
          nitDetectado: h?.nitDetectado ?? null,
        },
        clientes,
      );
      const puedeGestionarPerfiles = cliente.tipo === "asignado"
        && cliente.nombre != null
        && cliente.nit != null;
      const partidaDobleDiff = h ? Number(h.partidaDobleDiff) : resumen.partidaDobleDiff;
      const creadoEn = resumen.creadoEn ?? h?.creadoEn ?? null;
      return {
        loteId,
        archivoNombre: h?.archivoNombre ?? "(sin encabezado)",
        conEncabezado: !!h,
        nitDetectado: h?.nitDetectado ?? null,
        cliente,
        perfilesEnMemoria: cliente.tipo === "asignado"
          ? (perfilesPorCliente.get(cliente.id) ?? 0)
          : 0,
        puedeGestionarPerfiles,
        periodo: h?.periodoInicial && h?.periodoFinal ? `${fmtCalendarDate(h.periodoInicial)} → ${fmtCalendarDate(h.periodoFinal)}` : "—",
        cuentasMovimiento: resumen.cuentasMovimiento,
        cuadrado: h?.cuadrado ?? Math.abs(partidaDobleDiff) <= 1,
        partidaDobleDiff,
        cargadoPor: h?.cargadoPor ?? null,
        creadoEn: creadoEn?.toISOString() ?? null,
        fecha: creadoEn ? fmtDate(creadoEn) : "—",
        hora: creadoEn ? fmtHora12(creadoEn) : null,
      };
    });

  return (
    <div>
      <PageHeader
        title="Balance borrador"
        subtitle="Lo que se extrajo del Excel antes de homologar y cargar. Revisa la estructura cruda (agrupadoras y movimiento), localiza el descuadre, y carga o descarta. Nada se ha guardado como balance oficial."
      />
      <BorradoresIndexClient rows={rows} />
    </div>
  );
}
