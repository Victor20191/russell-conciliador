import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import NovedadesClient, { type VersionRow } from "./novedades-client";

// Módulo de NOVEDADES (changelog + control de versiones), admin-only. El guard
// es `novedades:ver` (SOLO_ADMIN); `canManage` (gate `novedades:administrar`)
// habilita el CRUD desde la UI. Patrón de loader RSC idéntico a config/mapeo.
export default async function NovedadesPage() {
  await requirePermiso("novedades:ver");

  const [administrarAuth, versiones] = await Promise.all([
    authorizePermiso("novedades:administrar"),
    prisma.platformVersion.findMany({
      orderBy: [{ order: "desc" }, { id: "desc" }],
      include: { changes: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
    }),
  ]);
  const canManage = administrarAuth.ok;

  // Serializa a tipos planos (fechas → ISO) para el client component.
  const versions: VersionRow[] = versiones.map((v) => ({
    id: v.id,
    number: v.number,
    title: v.title,
    summary: v.summary,
    status: v.status,
    releasedAt: v.releasedAt ? v.releasedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
    order: v.order,
    changes: v.changes.map((c) => ({
      id: c.id,
      versionId: c.versionId,
      type: c.type,
      title: c.title,
      description: c.description,
      moduleKey: c.moduleKey,
      route: c.route,
      howTo: c.howTo,
      example: c.example,
      featureStatus: c.featureStatus,
      order: c.order,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  }));

  return <NovedadesClient versions={versions} canManage={canManage} />;
}
