import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { fmtCalendarDate, fmtDate } from "@/lib/format";
import BorradoresIndexClient, { type BorradorRow } from "./borradores-index-client";

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

export default async function BorradoresPage() {
  await requirePermiso("balance:crear");

  // La lista usa el SNAPSHOT del encabezado en lugar de descargar y reconstruir
  // todas las filas de cada Excel. El staging puede superar fácilmente las cien mil
  // filas; agruparlo en PostgreSQL mantiene la detección de lotes huérfanos sin
  // transferirlos ni ejecutar el costoso view-model contable 83+ veces por visita.
  const [resumenStaging, headers, clientes] = await Promise.all([
    prisma.balanceImportacionStaging.groupBy({
      by: ["loteId", "tipoFila", "omitida"],
      _count: { _all: true },
      _sum: { debitos: true, creditos: true },
      _max: { creadoEn: true },
    }),
    prisma.balanceImportacionLote.findMany({
      select: {
        loteId: true,
        clienteId: true,
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
    prisma.client.findMany({ select: { id: true, name: true, nit: true } }),
  ]);
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

  const porNit = new Map<string, string>();
  for (const c of clientes) porNit.set(soloDigitos(c.nit).slice(0, 9), c.name);
  const clientePorId = new Map(clientes.map((c) => [c.id, c.name]));

  const rows: BorradorRow[] = [...resumenByLote.keys()]
    .sort((a, b) => (resumenByLote.get(b)?.creadoEn?.getTime() ?? 0) - (resumenByLote.get(a)?.creadoEn?.getTime() ?? 0))
    .map((loteId) => {
      const h = headerByLote.get(loteId);
      const resumen = resumenByLote.get(loteId)!;
      const core = soloDigitos(h?.nitDetectado ?? "").slice(0, 9);
      const partidaDobleDiff = h ? Number(h.partidaDobleDiff) : resumen.partidaDobleDiff;
      return {
        loteId,
        archivoNombre: h?.archivoNombre ?? "(sin encabezado)",
        conEncabezado: !!h,
        nitDetectado: h?.nitDetectado ?? null,
        clienteSugerido: h?.clienteId
          ? (clientePorId.get(h.clienteId) ?? null)
          : core.length >= 5 ? (porNit.get(core) ?? null) : null,
        periodo: h?.periodoInicial && h?.periodoFinal ? `${fmtCalendarDate(h.periodoInicial)} → ${fmtCalendarDate(h.periodoFinal)}` : "—",
        cuentasMovimiento: resumen.cuentasMovimiento,
        cuadrado: h?.cuadrado ?? Math.abs(partidaDobleDiff) <= 1,
        partidaDobleDiff,
        cargadoPor: h?.cargadoPor ?? null,
        fecha: resumen.creadoEn ? fmtDate(resumen.creadoEn) : h?.creadoEn ? fmtDate(h.creadoEn) : "—",
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
