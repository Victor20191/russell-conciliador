import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { PageHeader, BackLink } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { fmtDateTime } from "@/lib/format";
import { versionarYOrdenarBorradoresModulo } from "@/lib/modulos/versiones";
import { clavesDeDetalle, itemsRepetidos, llaveItem, refRolDe } from "@/lib/modulos/fraccionamiento";
import { esImputable } from "@/lib/modulos/promocion";
import type { ReconciliacionModulo } from "@/lib/modulos/extraccion/transformar";
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
  if (lote.clienteId == null) notFound();
  const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
  if (!scope.ok) notFound();

  const [comentariosGrp, cliente, ajustesCarga, lotesHermanos] = await Promise.all([
    // Conteo de comentarios por renglón del borrador (ancla `fila:<n>`, anclados al lote).
    prisma.comment.groupBy({ by: ["anchor"], where: { entityType: "modulos_borrador", entityId: lote.id }, _count: { _all: true } }),
    prisma.client.findUnique({ where: { id: lote.clienteId }, select: { name: true } }),
    // Notas de carga del cliente para este módulo (Configuración › Perfiles de carga).
    prisma.ajustesCargaModulo.findUnique({
      where: { clienteId_moduloCodigo: { clienteId: lote.clienteId, moduloCodigo } },
      select: { observaciones: true },
    }),
    lote.periodoInicial && lote.periodoFinal
      ? prisma.moduloImportacionLote.findMany({
          where: {
            moduloCodigo,
            clienteId: lote.clienteId,
            periodoInicial: lote.periodoInicial,
            periodoFinal: lote.periodoFinal,
          },
          select: {
            loteId: true,
            clienteId: true,
            moduloCodigo: true,
            archivoNombre: true,
            periodoInicial: true,
            periodoFinal: true,
            creadoEn: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const comentariosPorAncla: Record<string, number> = {};
  for (const g of comentariosGrp) if (g.anchor) comentariosPorAncla[g.anchor] = g._count._all;

  const periodoSugerido = lote.periodoFinal
    ? fechaCalendarioISO(lote.periodoFinal).slice(0, 7)
    : lote.periodoInicial
      ? fechaCalendarioISO(lote.periodoInicial).slice(0, 7)
      : "";
  const hermanosVersionados = versionarYOrdenarBorradoresModulo(
    lotesHermanos.map((hermano) => ({
      loteId: hermano.loteId,
      clienteId: hermano.clienteId,
      moduloCodigo: hermano.moduloCodigo,
      archivoNombre: hermano.archivoNombre,
      periodoInicial: hermano.periodoInicial ? fechaCalendarioISO(hermano.periodoInicial) : null,
      periodoFinal: hermano.periodoFinal ? fechaCalendarioISO(hermano.periodoFinal) : null,
      creadoEn: hermano.creadoEn.toISOString(),
    })),
  );
  const versionActual = hermanosVersionados.find((hermano) => hermano.loteId === loteId)?.version ?? null;

  // Reconciliación (red de seguridad de integridad, ver transformar.ts Parte B): viaja como
  // un campo adicional dentro del JSON del spec del lote (sin migración); ausente en lotes
  // viejos o cuando la carga no excluyó nada por encima del inicio detectado.
  const specConReconciliacion = lote.specJson as { reconciliacion?: ReconciliacionModulo } | null;
  const reconciliacion = specConReconciliacion?.reconciliacion ?? null;

  // ANEXO declarado: este archivo se SUMA al encabezado que el usuario eligió con
  // «Agregar archivo». Se resuelve aquí para avisar ANTES de confirmar si trae ítems que
  // ese cargue ya tiene — avisar, no bloquear: la llave (clasificador, referencia) depende
  // del mapeo de columnas y un falso positivo dejaría sin salida a un anexo legítimo.
  let anexo: { version: number; periodo: string; repetidos: string[]; vigente: boolean } | null = null;
  if (lote.anexoEncabezadoId != null) {
    const destino = await prisma.moduloDatoEncabezado.findUnique({
      where: { id: lote.anexoEncabezadoId },
      select: { id: true, version: true, periodo: true, esOficial: true, detalles: { select: { clasificador: true, datos: true } } },
    });
    if (destino) {
      const refRol = refRolDe(descriptor);
      const columnasNumericas = descriptor.columnas.filter((c) => c.tipo === "numero" || c.tipo === "moneda").map((c) => c.nombre);
      const existentes = clavesDeDetalle(
        destino.detalles.map((d) => ({ clasificador: d.clasificador, datos: (d.datos ?? {}) as Record<string, unknown> })),
        refRol,
      );
      // Solo cuentan las filas que realmente se promoverían (las mismas de `promoverStaging`).
      const nuevas = new Set(
        filas
          .filter((f) => esImputable(f, columnasNumericas))
          .map((f) => llaveItem(f.clasificador, refRol ? String(((f.datos ?? {}) as Record<string, unknown>)[refRol] ?? "") : "")),
      );
      anexo = {
        version: destino.version,
        periodo: destino.periodo,
        repetidos: itemsRepetidos(nuevas, existentes),
        vigente: destino.esOficial,
      };
    }
  }

  const filasVm: FilaBorradorModulo[] = filas.map((f) => ({
    filaNum: f.filaNum,
    clasificador: f.clasificador,
    valor: Number(f.valor),
    datos: (f.datos ?? {}) as Record<string, string | number | null>,
    tipoFila: f.tipoFila,
    omitida: f.omitida,
    motivo: f.motivoTipoFila,
  }));

  return (
    <div>
      <div className="mb-3"><BackLink href={`/modulos/${codigo.toLowerCase()}`} label={`Volver a ${descriptor.label}`} /></div>
      <PageHeader
        title={`Borrador · ${descriptor.label}`}
        subtitle={`${versionActual ? `v${versionActual} · ` : ""}${lote.archivoNombre}${lote.archivoTam ? ` · ${lote.archivoTam}` : ""}. Revisa el mapeo y confirma la carga.`}
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
        reconciliacion={reconciliacion}
        anexo={anexo}
        version={versionActual}
        notasCliente={ajustesCarga?.observaciones?.trim() || null}
        hermanos={hermanosVersionados.map((hermano) => ({
          loteId: hermano.loteId,
          version: hermano.version,
          archivoNombre: hermano.archivoNombre,
          fecha: hermano.creadoEn ? fmtDateTime(hermano.creadoEn) : "—",
        }))}
      />
    </div>
  );
}
