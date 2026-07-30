import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { BackLink } from "@/components/ui";
import { SpecCargaBalanceSchema } from "@/lib/definitions";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { stagingBorradorLote } from "@/lib/balance/staging-borrador";
import {
  contextoAccesoBorradorActual,
  puedeVerBorrador,
  resolverVinculoClienteBorrador,
} from "@/lib/balance/autorizacion-borrador";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import BorradorDetailClient from "./borrador-detail-client";

// La homologación de un balance pesado puede incluir mapeo por IA y escritura
// del PUC. El host debe permitir más que los 10 minutos del proveedor externo.
export const maxDuration = 1800;

export default async function BorradorDetailPage({ params }: { params: Promise<{ loteId: string }> }) {
  await requirePermiso("balance:crear");
  const { loteId } = await params;

  // El staging es la fuente del borrador; el encabezado (si existe) solo enriquece
  // la metadata. Los lotes «huérfanos» (sin encabezado) se abren igual. La lectura
  // del staging (colapso de terceros incluido) está CACHEADA por lote — ver
  // `stagingBorradorLote`; toda escritura la invalida con `invalidarStagingBorrador`.
  // Autoriza ANTES de reconstruir un staging pesado: una URL ajena no debe disparar
  // ese trabajo ni recibir datos del borrador.
  const [lote, contextoAcceso] = await Promise.all([
    prisma.balanceImportacionLote.findUnique({ where: { loteId } }),
    contextoAccesoBorradorActual(),
  ]);
  if (
    lote
    && !puedeVerBorrador(
      {
        clienteId: lote.clienteId,
        cargadoPorId: lote.cargadoPorId,
      },
      contextoAcceso,
    )
  ) {
    notFound();
  }
  if (!lote) {
    // Recuperación tras perder la respuesta de red: la promoción atómica ya
    // pudo confirmar el balance y consumir el borrador. El lote de origen queda
    // persistido en el encabezado oficial para reenviar sin crear otra versión.
    const balancePromovido = await prisma.balancePruebaEncabezado.findUnique({
      where: { loteId },
      select: { id: true, clienteId: true },
    });
    if (
      balancePromovido &&
      (
        contextoAcceso.alcance.todos
        || contextoAcceso.alcance.clientIds.includes(balancePromovido.clienteId)
      )
    ) {
      redirect(`/balance/${balancePromovido.id}?cargado=1&recuperado=1`);
    }
    // Solo un usuario global puede recuperar un staging legado sin encabezado:
    // no existe cliente ni propietario verificable para autorizar a otro rol.
    if (!contextoAcceso.alcance.todos) notFound();
  }
  const [staging, umbrales] = await Promise.all([
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
  const alc = contextoAcceso.alcance;
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
  const vinculoCliente = resolverVinculoClienteBorrador(
    {
      clienteId: lote?.clienteId ?? null,
      nitDetectado: lote?.nitDetectado ?? null,
    },
    clientes,
  );
  const clienteSugeridoId = vinculoCliente.tipo === "sin_cliente"
    ? null
    : vinculoCliente.id;

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
