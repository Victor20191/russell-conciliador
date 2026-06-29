import { PageHeader } from "@/components/ui";
import { requirePermiso } from "@/lib/rbac";
import { getPromptsVista } from "@/lib/ia/prompts";
import PromptsClient from "./prompts-client";

export default async function PromptsPage() {
  // SOLO el Superadministrador (permiso prompts:administrar). Redirige si no cumple.
  await requirePermiso("prompts:administrar");

  const prompts = await getPromptsVista();

  return (
    <div>
      <PageHeader
        title="Prompts de IA"
        subtitle="Instrucciones de sistema que la plataforma envía a la IA. Editar un prompt cambia el comportamiento de la IA de inmediato para toda la plataforma."
      />
      <PromptsClient prompts={prompts} />
    </div>
  );
}
