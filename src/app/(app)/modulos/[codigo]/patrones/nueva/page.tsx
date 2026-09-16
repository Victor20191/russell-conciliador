import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { BackLink, PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { ERP_MANUAL_CODE } from "@/lib/erp-procesos";
import EditorPatronClient, { type BasePatron } from "../editor-patron-client";

// Nueva versión de patrón de archivo (Administrador). `?erp=` preselecciona el aplicativo,
// `?recepcion=` prellena con el archivo de un cliente que no coincidió y `?base=` parte de otra
// versión («Nueva a partir de esta»).
export default async function NuevoPatronPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ erp?: string; recepcion?: string; base?: string }>;
}) {
  await requirePermiso("perfiles_carga:administrar");
  const { codigo } = await params;
  const sp = await searchParams;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  const baseId = Number(sp.base);
  const [erps, baseFila] = await Promise.all([
    prisma.erp.findMany({
      where: { active: true, code: { not: ERP_MANUAL_CODE } },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    Number.isInteger(baseId) && baseId > 0
      ? prisma.versionPatronArchivoModulo.findFirst({
          where: { id: baseId, moduloCodigo },
          select: { version: true, erpId: true, specJson: true, encabezadoJson: true },
        })
      : Promise.resolve(null),
  ]);
  const erpPedido = Number(sp.erp);
  const erpInicial = Number.isInteger(erpPedido) && erps.some((e) => e.id === erpPedido) ? erpPedido : (baseFila?.erpId ?? null);
  const base: BasePatron | null = baseFila
    ? { version: baseFila.version, specJson: JSON.stringify(baseFila.specJson), encabezadoJson: JSON.stringify(baseFila.encabezadoJson) }
    : null;
  const recepcion = /^[0-9a-f-]{36}$/i.test(sp.recepcion ?? "") ? sp.recepcion! : null;

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/modulos/${codigo.toLowerCase()}/patrones`} label="Patrones de archivo" />
      </div>
      <PageHeader
        title={`Nuevo patrón · ${descriptor.label}`}
        subtitle="Sube un archivo de muestra del aplicativo, indica cómo se lee y guarda la versión. Los archivos que coincidan en 80 % o más se cargarán sin configurar columnas."
      />
      <EditorPatronClient
        moduloCodigo={moduloCodigo}
        moduloLabel={descriptor.label}
        roles={descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo, requerido: c.requerido }))}
        clasificadorRol={descriptor.clasificador}
        conNivelCartera={descriptor.crucePorTercero.detalleTercero === true}
        erps={erps.map((e) => ({ id: e.id, nombre: e.name }))}
        erpInicial={erpInicial}
        recepcionLoteId={recepcion}
        base={base}
      />
    </div>
  );
}
