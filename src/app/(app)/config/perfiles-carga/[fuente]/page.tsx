import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requirePermiso } from "@/lib/rbac";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { cargarFilasMemoria } from "@/lib/perfiles-carga/cargar-filas";
import PerfilesCargaClient from "../perfiles-carga-client";

/**
 * Configuración › Perfiles de carga › **un módulo** (`/config/perfiles-carga/inv`,
 * `/car`, `/cxp`, `/ing`, `/afi`, `/nom`) — la memoria de carga de ese módulo por
 * cliente: formatos por huella (mapeo de columnas que el motor genérico guarda en
 * cada lectura y re-aplica sin volver a sugerir) y preferencias (hoja preferida,
 * notas). Todos los módulos se administran EXACTAMENTE igual: solo cambia el
 * descriptor. Es la entrada correspondiente del submenú lateral «Perfiles de
 * carga»; el balance tiene la suya en `/config/perfiles-carga`.
 */
export default async function PerfilesCargaModuloPage({ params }: { params: Promise<{ fuente: string }> }) {
  await requirePermiso("perfiles_carga:administrar");
  const { fuente } = await params;
  const codigo = String(fuente ?? "").trim().toUpperCase();
  if (codigo === "BALANCE") redirect("/config/perfiles-carga");
  const descriptor = descriptorModulo(codigo);
  if (!descriptor) notFound();

  const { rows, totalClientes } = await cargarFilasMemoria(codigo);

  return (
    <div>
      <PageHeader
        title={`Perfiles de carga · ${descriptor.label}`}
        subtitle={`Cómo lee la plataforma el archivo de ${descriptor.label.toLowerCase()} de cada cliente: formatos memorizados (mapeo de columnas) y preferencias de carga. Se crean solos al leer archivos en Módulos › ${descriptor.label}.`}
      />
      <PerfilesCargaClient fuente={codigo} rows={rows} totalClientes={totalClientes} />
    </div>
  );
}
