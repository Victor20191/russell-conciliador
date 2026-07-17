import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { fmtCalendarDate, fmtDate } from "@/lib/format";
import BorradoresIndexClient, { type BorradorRow } from "./borradores-index-client";

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

export default async function BorradoresPage() {
  await requirePermiso("balance:crear");

  // La lista se guía por el STAGING (fuente real del borrador): muestra TODO lote
  // con filas cargadas, tenga o no encabezado. El encabezado (si existe) enriquece
  // la metadata (archivo, NIT, período, cuadre); los lotes «huérfanos» (leídos
  // antes de existir el encabezado) se muestran igual, con datos derivados.
  const [lotesStaging, movPorLote, headers] = await Promise.all([
    prisma.balanceImportacionStaging.groupBy({ by: ["loteId"], _max: { creadoEn: true }, _count: { _all: true } }),
    prisma.balanceImportacionStaging.groupBy({ by: ["loteId"], where: { tipoFila: "movimiento" }, _count: { _all: true } }),
    prisma.balanceImportacionLote.findMany(),
  ]);
  const headerByLote = new Map(headers.map((h) => [h.loteId, h]));
  const movByLote = new Map(movPorLote.map((m) => [m.loteId, m._count._all]));

  // Cliente sugerido por NIT (solo para lotes con encabezado que trae NIT).
  const nits = [...new Set(headers.map((h) => soloDigitos(h.nitDetectado ?? "").slice(0, 9)).filter((c) => c.length >= 5))];
  const clientes = nits.length ? await prisma.client.findMany({ select: { name: true, nit: true } }) : [];
  const porNit = new Map<string, string>();
  for (const c of clientes) porNit.set(soloDigitos(c.nit).slice(0, 9), c.name);

  const rows: BorradorRow[] = lotesStaging
    .sort((a, b) => (b._max.creadoEn?.getTime() ?? 0) - (a._max.creadoEn?.getTime() ?? 0))
    .map((l) => {
      const h = headerByLote.get(l.loteId);
      const core = soloDigitos(h?.nitDetectado ?? "").slice(0, 9);
      return {
        loteId: l.loteId,
        archivoNombre: h?.archivoNombre ?? "(sin encabezado)",
        conEncabezado: !!h,
        nitDetectado: h?.nitDetectado ?? null,
        clienteSugerido: core.length >= 5 ? (porNit.get(core) ?? null) : null,
        periodo: h?.periodoInicial && h?.periodoFinal ? `${fmtCalendarDate(h.periodoInicial)} → ${fmtCalendarDate(h.periodoFinal)}` : "—",
        cuentasMovimiento: movByLote.get(l.loteId) ?? h?.cuentasMovimiento ?? 0,
        cuadrado: h?.cuadrado ?? false,
        partidaDobleDiff: h ? Number(h.partidaDobleDiff) : 0,
        cargadoPor: h?.cargadoPor ?? null,
        fecha: l._max.creadoEn ? fmtDate(l._max.creadoEn) : "—",
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
