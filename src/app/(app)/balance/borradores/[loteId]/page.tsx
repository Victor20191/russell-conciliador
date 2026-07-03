import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader, BackLink } from "@/components/ui";
import type { FilaBorrador } from "@/lib/balance/borrador";
import BorradorDetailClient from "./borrador-detail-client";

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

export default async function BorradorDetailPage({ params }: { params: Promise<{ loteId: string }> }) {
  await requirePermiso("balance:crear");
  const { loteId } = await params;

  // El staging es la fuente del borrador; el encabezado (si existe) solo enriquece
  // la metadata. Los lotes «huérfanos» (sin encabezado) se abren igual.
  const [lote, filasStaging] = await Promise.all([
    prisma.balanceImportacionLote.findUnique({ where: { loteId } }),
    prisma.balanceImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } }),
  ]);
  if (filasStaging.length === 0) notFound();

  // Filas CRUDAS del staging → al cliente, que recomputa el view-model (árbol +
  // validaciones + hallazgos) y aplica los cambios TEMPORALES antes de guardar.
  // Decimal de Prisma → number.
  const filas: FilaBorrador[] = filasStaging.map((f) => ({
    filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, nivel: f.nivel,
    tipoFila: f.tipoFila as FilaBorrador["tipoFila"], desacoplada: f.desacoplada,
    saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
  }));

  // Clientes de la cartera para el selector de carga + cliente sugerido por NIT.
  const alc = await alcanceLecturaUsuario();
  const clientes = await prisma.client.findMany({
    where: alc.todos ? {} : { id: { in: alc.clientIds } },
    select: { id: true, name: true, nit: true },
    orderBy: { name: "asc" },
  });
  const core = soloDigitos(lote?.nitDetectado ?? "").slice(0, 9);
  const clienteSugeridoId = core.length >= 5 ? (clientes.find((c) => soloDigitos(c.nit).slice(0, 9) === core)?.id ?? null) : null;

  return (
    <div>
      <div className="mb-3"><BackLink href="/balance/borradores" label="Volver a borradores" /></div>
      <PageHeader
        title={`Borrador · ${lote?.archivoNombre ?? "(sin encabezado)"}`}
        subtitle="Estructura CRUDA extraída del Excel (sin homologación). Las agrupadoras cuyo total ≠ suma de sus hijos aparecen subrayadas: ahí está el descuadre."
      />
      <BorradorDetailClient
        loteId={loteId}
        archivoNombre={lote?.archivoNombre ?? "(sin encabezado)"}
        nitDetectado={lote?.nitDetectado ?? null}
        periodoInicial={lote?.periodoInicial ?? null}
        periodoFinal={lote?.periodoFinal ?? null}
        filas={filas}
        clientes={clientes.map((c) => ({ id: c.id, name: c.name, nit: c.nit }))}
        clienteSugeridoId={clienteSugeridoId}
      />
    </div>
  );
}
