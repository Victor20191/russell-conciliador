import { PageHeader } from "@/components/ui";
import { requirePermiso } from "@/lib/rbac";
import { getPromptsVista } from "@/lib/ia/prompts";
import prisma from "@/lib/prisma";
import { CLAVE_MODELO_NOVEDADES, normalizarModelo } from "@/lib/ia/modelos-novedades";
import PromptsClient from "./prompts-client";

export default async function PromptsPage() {
  // SOLO el Superadministrador (permiso prompts:administrar). Redirige si no cumple.
  await requirePermiso("prompts:administrar");

  const prompts = await getPromptsVista();

  // Modelo de IA que usa el hook que vuelca los commits del día a /novedades.
  const filaModelo = await prisma.configuracionPlataforma.findUnique({
    where: { clave: CLAVE_MODELO_NOVEDADES },
    select: { valor: true, actualizadoPor: true, actualizadoEn: true },
  });
  const modeloNovedades = {
    valor: normalizarModelo(filaModelo?.valor),
    actualizadoPor: filaModelo?.actualizadoPor ?? null,
    actualizadoEn: filaModelo?.actualizadoEn ? filaModelo.actualizadoEn.toISOString() : null,
  };

  return (
    <div>
      <PageHeader
        title="Prompts de IA"
        subtitle="Instrucciones de sistema que la plataforma envía a la IA. Editar un prompt cambia el comportamiento de la IA de inmediato para toda la plataforma."
      />
      <PromptsClient prompts={prompts} modeloNovedades={modeloNovedades} />
    </div>
  );
}
