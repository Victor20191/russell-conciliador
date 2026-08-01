import { PageHeader } from "@/components/ui";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { getCatalogoPrevalidadorVista } from "@/lib/parametros/prevalidador";
import PrevalidadorConfigClient from "./prevalidador-client";

export default async function PrevalidadorConfigPage() {
  // Administrador y Superadministrador (permiso parametros:administrar): qué se
  // prevalida es un criterio de la firma, no un dato de cliente.
  await requirePermiso("parametros:administrar");

  const [catalogo, modulos] = await Promise.all([
    getCatalogoPrevalidadorVista(),
    prisma.module.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Cuentas del prevalidador"
        subtitle="Cuentas del plan estándar Russell que se comparan contra el PUC del cliente antes de conciliar cada módulo. Aplican a toda la plataforma y de inmediato, también sobre los balances ya cargados."
      />
      <PrevalidadorConfigClient catalogo={catalogo} modulos={modulos} />
    </div>
  );
}
