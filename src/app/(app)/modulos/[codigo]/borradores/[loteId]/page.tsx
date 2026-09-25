import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { PageHeader, BackLink } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { fmtDateTime } from "@/lib/format";
import { versionarYOrdenarBorradoresModulo } from "@/lib/modulos/versiones";
import { clavesDeDetalle, itemsRepetidos, llaveItem, rolesLlaveItemDe } from "@/lib/modulos/fraccionamiento";
import { esImputable } from "@/lib/modulos/promocion";
import { columnasDetalleModulo } from "@/lib/modulos/cartera/columnas-cartera";
import type { ReconciliacionModulo } from "@/lib/modulos/extraccion/transformar";
import { SpecModuloSchema } from "@/lib/modulos/extraccion/esquema";
import { formatoArchivoCartera, nivelCarteraDeSpec } from "@/lib/modulos/cartera/tipo-formato";
import { grupoSinNombreDe, opcionesNombreClasificador, type GrupoSinNombre } from "@/lib/modulos/nombre-clasificador";
import { cargarResumenBorrador, filasDelLote } from "@/lib/modulos/borrador-servidor";
import BorradorModuloClient from "./borrador-detail-client";

export default async function BorradorModuloPage({ params }: { params: Promise<{ codigo: string; loteId: string }> }) {
  await requirePermiso("modulos_datos:crear");
  const { codigo, loteId } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  // Las filas se leen ENTERAS aquí para calcular los agregados, pero NO viajan al navegador:
  // la tabla pide el detalle grupo por grupo con la accion filasBorradorModulo.
  const [lote, filas] = await Promise.all([
    prisma.moduloImportacionLote.findUnique({ where: { loteId } }),
    filasDelLote(loteId),
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
  const columnasNumericas = descriptor.columnas.filter((c) => c.tipo === "numero" || c.tipo === "moneda").map((c) => c.nombre);
  let anexo: { version: number; periodo: string; repetidos: string[]; vigente: boolean } | null = null;
  // Agrupadores del cargue al que se suma el anexo: se ofrecen como nombre para las filas sin él.
  let nombresDestino: { version: number; nombres: string[] } | null = null;
  if (lote.anexoEncabezadoId != null) {
    const destino = await prisma.moduloDatoEncabezado.findUnique({
      where: { id: lote.anexoEncabezadoId },
      select: { id: true, version: true, periodo: true, esOficial: true, detalles: { select: { clasificador: true, datos: true } } },
    });
    if (destino) {
      if (destino.esOficial) {
        nombresDestino = { version: destino.version, nombres: [...new Set(destino.detalles.map((d) => d.clasificador?.trim() ?? "").filter(Boolean))] };
      }
      const rolesLlave = rolesLlaveItemDe(descriptor);
      const existentes = clavesDeDetalle(
        destino.detalles.map((d) => ({ clasificador: d.clasificador, datos: (d.datos ?? {}) as Record<string, unknown> })),
        rolesLlave,
      );
      // Solo cuentan las filas que realmente se promoverían (las mismas de `promoverStaging`).
      const nuevas = new Set(
        filas
          .filter((f) => esImputable(f, columnasNumericas))
          .map((f) => llaveItem(f.clasificador, rolesLlave.map((rol) => String(((f.datos ?? {}) as Record<string, unknown>)[rol] ?? "")))),
      );
      anexo = {
        version: destino.version,
        periodo: destino.periodo,
        repetidos: itemsRepetidos(nuevas, existentes),
        vigente: destino.esOficial,
      };
    }
  }

  // Grupos que nombra el sistema y no el archivo — «(sin clasificar)» y «GLOBAL» —: el usuario
  // les puede poner nombre antes de confirmar. Cuentan las filas que se promoverían. Nómina no
  // aplica: su clasificador es el código del concepto.
  const gruposSinNombre = new Map<GrupoSinNombre, { filas: number; total: number }>();
  if (!descriptor.nomina) {
    for (const f of filas) {
      const grupo = grupoSinNombreDe(f.clasificador);
      if (!grupo || !esImputable(f, columnasNumericas)) continue;
      const previo = gruposSinNombre.get(grupo) ?? { filas: 0, total: 0 };
      gruposSinNombre.set(grupo, { filas: previo.filas + 1, total: previo.total + Number(f.valor) });
    }
  }
  // Nombres que ya tienen cuenta en la memoria del cliente: usar el mismo trae su cuenta sola.
  const memoria = gruposSinNombre.size > 0
    ? await prisma.consolidacionModuloCliente.findMany({
        where: { clienteId: lote.clienteId, moduloCodigo },
        select: { clasificador: true, cuenta4: true, cuenta6: true },
      })
    : [];
  const cuentasPorNombre = new Map<string, string[]>();
  for (const m of memoria) cuentasPorNombre.set(m.clasificador, [...(cuentasPorNombre.get(m.clasificador) ?? []), m.cuenta6 || m.cuenta4]);
  const opcionesNombre = gruposSinNombre.size > 0
    ? opcionesNombreClasificador({
        destino: nombresDestino,
        memoria: [...cuentasPorNombre].map(([nombre, cuentas]) => ({ nombre, cuentas })),
        delBorrador: filas.map((f) => f.clasificador),
      })
    : [];

  // Los rangos de vencimiento que detectó la lectura viven en el spec del LOTE (aquí el
  // cargue todavía no existe), y de ahí salen las columnas por archivo de la tabla.
  const familiasDelLote = ((lote.specJson ?? {}) as { familias?: Record<string, { etiqueta: string }[]> }).familias;
  // Tipo de formato del archivo (Cartera y CxP): fija el nivel de la fila y qué controles aplican.
  const specDelLote = SpecModuloSchema.safeParse(lote.specJson).data;
  const nivelDelLote = nivelCarteraDeSpec(specDelLote ?? {});
  const formatoDelLote = descriptor.crucePorTercero.detalleTercero && specDelLote
    ? formatoArchivoCartera(specDelLote, { loteId, archivo: lote.archivoNombre, rolTotal: descriptor.valor })
    : null;
  const columnasDelBorrador = columnasDetalleModulo(
    descriptor,
    (familiasDelLote?.edades ?? []).map((e) => e.etiqueta),
  );

  const resumen = await cargarResumenBorrador({
    loteId,
    descriptor,
    columnas: columnasDelBorrador,
    nivelCartera: nivelDelLote,
    formatoCartera: formatoDelLote,
  });

  return (
    <div>
      <div className="mb-3"><BackLink href={`/modulos/${codigo.toLowerCase()}/borradores`} label="Volver a Borradores" /></div>
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
        columnas={columnasDelBorrador}
        clasificadorRol={descriptor.clasificador}
        noNegativos={descriptor.noNegativos ?? []}
        productos={Object.entries(descriptor.derivar ?? {}).filter(([, r]) => "producto" in r).map(([resultado, r]) => ({ resultado, cantidad: (r as { producto: [string, string] }).producto[0], unitario: (r as { producto: [string, string] }).producto[1] }))}
        verificaciones={descriptor.verificaciones ?? []}
        resumen={resumen}
        reconciliacion={reconciliacion}
        anexo={anexo}
        sinNombre={[...gruposSinNombre].map(([grupo, g]) => ({ grupo, filas: g.filas, total: Math.round(g.total * 100) / 100 }))}
        opcionesNombre={opcionesNombre}
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
