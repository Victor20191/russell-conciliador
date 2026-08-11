import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader, BackLink } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import BorradorModuloClient, { type FilaBorradorModulo } from "./borrador-detail-client";

export default async function BorradorModuloPage({ params }: { params: Promise<{ codigo: string; loteId: string }> }) {
  await requirePermiso("modulos_datos:crear");
  const { codigo, loteId } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  const [lote, filas] = await Promise.all([
    prisma.moduloImportacionLote.findUnique({ where: { loteId } }),
    prisma.moduloImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } }),
  ]);
  if (!lote || lote.moduloCodigo !== moduloCodigo || filas.length === 0) notFound();

  // Conteo de comentarios por renglón del borrador (ancla `fila:<n>`, anclados al lote).
  const comentariosGrp = await prisma.comment.groupBy({ by: ["anchor"], where: { entityType: "modulos_borrador", entityId: lote.id }, _count: { _all: true } });
  const comentariosPorAncla: Record<string, number> = {};
  for (const g of comentariosGrp) if (g.anchor) comentariosPorAncla[g.anchor] = g._count._all;

  const cliente = lote.clienteId != null ? await prisma.client.findUnique({ where: { id: lote.clienteId }, select: { name: true } }) : null;
  const periodoSugerido = lote.periodoFinal ? lote.periodoFinal.toISOString().slice(0, 7) : lote.periodoInicial ? lote.periodoInicial.toISOString().slice(0, 7) : "";

  const filasVm: FilaBorradorModulo[] = filas.map((f) => ({
    filaNum: f.filaNum,
    clasificador: f.clasificador,
    valor: Number(f.valor),
    datos: (f.datos ?? {}) as Record<string, string | number | null>,
    tipoFila: f.tipoFila,
    omitida: f.omitida,
  }));

  return (
    <div>
      <div className="mb-3"><BackLink href={`/modulos/${codigo.toLowerCase()}`} label={`Volver a ${descriptor.label}`} /></div>
      <PageHeader
        title={`Borrador · ${descriptor.label}`}
        subtitle="Revisa el mapeo, marca renglones agrupadores (subtotales) u omítelos, y confirma la carga."
      />
      <BorradorModuloClient
        moduloCodigo={moduloCodigo}
        loteId={loteId}
        loteRowId={lote.id}
        comentarios={comentariosPorAncla}
        cliente={cliente?.name ?? (lote.clienteId != null ? `Cliente ${lote.clienteId}` : "(sin cliente)")}
        periodoSugerido={periodoSugerido}
        columnas={descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo }))}
        clasificadorRol={descriptor.clasificador}
        valorRol={descriptor.valor}
        noNegativos={descriptor.noNegativos ?? []}
        productos={Object.entries(descriptor.derivar ?? {}).filter(([, r]) => "producto" in r).map(([resultado, r]) => ({ resultado, cantidad: (r as { producto: [string, string] }).producto[0], unitario: (r as { producto: [string, string] }).producto[1] }))}
        verificaciones={descriptor.verificaciones ?? []}
        filas={filasVm}
      />
    </div>
  );
}
