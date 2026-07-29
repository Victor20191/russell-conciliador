import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { BackLink } from "@/components/ui";
import { SpecCargaBalanceSchema } from "@/lib/definitions";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { stagingBorradorLote } from "@/lib/balance/staging-borrador";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import BorradorDetailClient from "./borrador-detail-client";

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

export default async function BorradorDetailPage({ params }: { params: Promise<{ loteId: string }> }) {
  await requirePermiso("balance:crear");
  const { loteId } = await params;

  // El staging es la fuente del borrador; el encabezado (si existe) solo enriquece
  // la metadata. Los lotes «huérfanos» (sin encabezado) se abren igual. La lectura
  // del staging (colapso de terceros incluido) está CACHEADA por lote — ver
  // `stagingBorradorLote`; toda escritura la invalida con `invalidarStagingBorrador`.
  // El alcance depende de la sesión, así que corre fuera del caché, en paralelo.
  const alcancePromise = alcanceLecturaUsuario();
  const [lote, staging, umbrales] = await Promise.all([
    prisma.balanceImportacionLote.findUnique({ where: { loteId } }),
    stagingBorradorLote(loteId),
    // Umbrales de alerta vigentes (parametrizables en /config/parametros). El
    // borrador recalcula sus validaciones en el cliente, así que viajan por props.
    getUmbralesAlertas(),
  ]);
  if (!staging) notFound();

  // Spec de extracción usado (si se guardó): habilita el editor de estructura en el
  // borrador (re-adjuntando el archivo). Puede faltar (carga por plantilla sin spec).
  const specParsed = lote?.specJson ? SpecCargaBalanceSchema.safeParse(lote.specJson) : null;
  const spec: SpecCarga | null = specParsed?.success ? (specParsed.data as SpecCarga) : null;

  // Clientes de la cartera para el selector de carga + cliente sugerido por NIT.
  const alc = await alcancePromise;
  const filtroIds = alc.todos ? {} : { clienteId: { in: alc.clientIds } };
  const [clientes, notasRows, perfilesPorClienteRows] = await Promise.all([
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, name: true, nit: true },
      orderBy: { name: "asc" },
    }),
    // Notas de carga por cliente (particularidades del formato) para avisar al revisar.
    prisma.ajustesCargaBalance.findMany({
      where: { ...filtroIds, observaciones: { not: null } },
      select: { clienteId: true, observaciones: true },
    }),
    prisma.perfilCargaBalance.groupBy({
      by: ["clienteId"],
      where: filtroIds,
      _count: { _all: true },
    }),
  ]);
  const notasPorCliente = new Map(notasRows.map((r) => [r.clienteId, r.observaciones]));
  const perfilesPorCliente = new Map(
    perfilesPorClienteRows.map((fila) => [fila.clienteId, fila._count._all]),
  );
  const core = soloDigitos(lote?.nitDetectado ?? "").slice(0, 9);
  const clientePorNitId = core.length >= 5 ? (clientes.find((c) => soloDigitos(c.nit).slice(0, 9) === core)?.id ?? null) : null;
  // El cliente ya ASIGNADO al lote (al leer por NIT o a mano en la compuerta) manda
  // sobre la re-detección por NIT; debe estar en la cartera visible del usuario.
  const clienteAsignadoId = lote?.clienteId != null && clientes.some((c) => c.id === lote.clienteId) ? lote.clienteId : null;
  const clienteSugeridoId = clienteAsignadoId ?? clientePorNitId;

  return (
    <div>
      <div className="mb-3"><BackLink href="/balance/borradores" label="Volver a borradores" /></div>
      {/* El encabezado lo pinta el cliente: el botón de «filas tachadas» va en su
          misma fila y su contador depende de los cambios en memoria del borrador. */}
      <BorradorDetailClient
        loteId={loteId}
        archivoNombre={lote?.archivoNombre ?? "(sin encabezado)"}
        nitDetectado={lote?.nitDetectado ?? null}
        periodoInicial={lote?.periodoInicial ? fechaCalendarioISO(lote.periodoInicial) : null}
        periodoFinal={lote?.periodoFinal ? fechaCalendarioISO(lote.periodoFinal) : null}
        filasCompactas={staging.filasCompactas}
        porTerceroDetectado={staging.porTercero}
        revisionesReubicacion={staging.revisionesReubicacion ?? []}
        clientes={clientes.map((c) => ({
          id: c.id,
          name: c.name,
          nit: c.nit,
          notas: notasPorCliente.get(c.id) ?? null,
          perfilesEnMemoria: perfilesPorCliente.get(c.id) ?? 0,
        }))}
        clienteSugeridoId={clienteSugeridoId}
        spec={spec}
        correccionesAplicadas={lote?.correccionesAplicadas ?? 0}
        umbrales={umbrales}
      />
    </div>
  );
}
