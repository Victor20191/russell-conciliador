import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { fmtCalendarDate, fmtDate } from "@/lib/format";
import { construirVistaBorrador } from "@/lib/balance/borrador-vm";
import type { FilaBorrador } from "@/lib/balance/borrador";
import BorradoresIndexClient, { type BorradorRow } from "./borradores-index-client";

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

export default async function BorradoresPage() {
  await requirePermiso("balance:crear");

  // La lista se guía por el STAGING (fuente real del borrador): muestra TODO lote
  // con filas cargadas, tenga o no encabezado. El encabezado (si existe) enriquece
  // la metadata (archivo, NIT, período); los lotes «huérfanos» (leídos antes de
  // existir el encabezado) se muestran igual, con datos derivados.
  const [filasStaging, headers] = await Promise.all([
    prisma.balanceImportacionStaging.findMany({ orderBy: { filaNum: "asc" } }),
    prisma.balanceImportacionLote.findMany(),
  ]);
  const headerByLote = new Map(headers.map((h) => [h.loteId, h]));

  // Agrupa el staging por lote y RECOMPUTA el cuadre con el MISMO pipeline del detalle
  // (`construirVistaBorrador`). El cuadre NO se lee del encabezado (que lo cachea en la
  // extracción, antes de las pasadas actuales) para que la lista y el detalle coincidan.
  const filasByLote = new Map<string, FilaBorrador[]>();
  const creadoByLote = new Map<string, Date>();
  const movByLote = new Map<string, number>();
  for (const f of filasStaging) {
    let arr = filasByLote.get(f.loteId);
    if (!arr) { arr = []; filasByLote.set(f.loteId, arr); }
    arr.push({
      filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, nivel: f.nivel,
      tipoFila: f.tipoFila as FilaBorrador["tipoFila"], desacoplada: f.desacoplada, omitida: f.omitida ?? undefined, padreManual: f.padreManual,
      saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
    });
    if (f.tipoFila === "movimiento") movByLote.set(f.loteId, (movByLote.get(f.loteId) ?? 0) + 1);
    const prev = creadoByLote.get(f.loteId);
    if (!prev || (f.creadoEn && f.creadoEn > prev)) creadoByLote.set(f.loteId, f.creadoEn);
  }
  const cuadreByLote = new Map<string, { cuadrado: boolean; diff: number }>();
  for (const [loteId, filas] of filasByLote) {
    try {
      const v = construirVistaBorrador(filas);
      cuadreByLote.set(loteId, { cuadrado: v.diagnostico.cuadrado, diff: v.diagnostico.partidaDobleDiff });
    } catch {
      const h = headerByLote.get(loteId);
      cuadreByLote.set(loteId, { cuadrado: h?.cuadrado ?? false, diff: h ? Number(h.partidaDobleDiff) : 0 });
    }
  }

  // Cliente sugerido por NIT (solo para lotes con encabezado que trae NIT).
  const nits = [...new Set(headers.map((h) => soloDigitos(h.nitDetectado ?? "").slice(0, 9)).filter((c) => c.length >= 5))];
  const clientes = nits.length ? await prisma.client.findMany({ select: { name: true, nit: true } }) : [];
  const porNit = new Map<string, string>();
  for (const c of clientes) porNit.set(soloDigitos(c.nit).slice(0, 9), c.name);

  const rows: BorradorRow[] = [...filasByLote.keys()]
    .sort((a, b) => (creadoByLote.get(b)?.getTime() ?? 0) - (creadoByLote.get(a)?.getTime() ?? 0))
    .map((loteId) => {
      const h = headerByLote.get(loteId);
      const cu = cuadreByLote.get(loteId);
      const core = soloDigitos(h?.nitDetectado ?? "").slice(0, 9);
      return {
        loteId,
        archivoNombre: h?.archivoNombre ?? "(sin encabezado)",
        conEncabezado: !!h,
        nitDetectado: h?.nitDetectado ?? null,
        clienteSugerido: core.length >= 5 ? (porNit.get(core) ?? null) : null,
        periodo: h?.periodoInicial && h?.periodoFinal ? `${fmtCalendarDate(h.periodoInicial)} → ${fmtCalendarDate(h.periodoFinal)}` : "—",
        cuentasMovimiento: movByLote.get(loteId) ?? h?.cuentasMovimiento ?? 0,
        cuadrado: cu?.cuadrado ?? false,
        partidaDobleDiff: cu?.diff ?? 0,
        cargadoPor: h?.cargadoPor ?? null,
        fecha: creadoByLote.get(loteId) ? fmtDate(creadoByLote.get(loteId)!) : "—",
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
