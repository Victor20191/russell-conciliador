import { PageHeader } from "@/components/ui";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { getCatalogoPrevalidadorVista } from "@/lib/parametros/prevalidador";
import { PREVALIDADOR_MODULOS_ORDEN } from "@/lib/balance/prevalidador/catalogo";
import PrevalidadorConfigClient from "./prevalidador-client";

export default async function PrevalidadorConfigPage() {
  // Administrador y Superadministrador (permiso parametros:administrar): qué se
  // prevalida es un criterio de la firma, no un dato de cliente.
  await requirePermiso("parametros:administrar");

  const [catalogo, modulos] = await Promise.all([
    getCatalogoPrevalidadorVista(),
    prisma.module.findMany({
      where: { code: { in: [...PREVALIDADOR_MODULOS_ORDEN] } },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Cuentas del prevalidador"
        subtitle="Cuentas del plan estándar Russell que se comparan contra el PUC del cliente antes de conciliar los seis módulos ERP aprobados."
      />
      <PrevalidadorConfigClient catalogo={catalogo} modulos={modulos} />
    </div>
  );
}
