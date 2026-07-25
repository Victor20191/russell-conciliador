import prisma from "@/lib/prisma";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { fmtDateTime, fmtNum, timeAgo } from "@/lib/format";
import { workNav, configNav } from "@/lib/nav";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import AuditoriaTabs from "../auditoria-tabs";
import AccesosTabla, { type AccesoRow } from "./accesos-tabla";

// Etiquetas legibles para las rutas conocidas (derivadas del menú); las rutas
// sin entrada en el menú se muestran con su path tal cual.
const navLabels = new Map<string, string>();
for (const item of [...workNav, ...configNav]) {
  navLabels.set(item.href, item.label);
  for (const c of item.children ?? []) navLabels.set(c.href, c.label);
}
const etiquetaRuta = (p: string) => navLabels.get(p) ?? p;

export default async function AccesosPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; user?: string; kind?: string }>;
}) {
  await requirePermiso("auditoria:accesos");
  const reporteAuth = await authorizePermiso("auditoria:reporte_ejecutivo");
  const sp = await searchParams;

  // Rango temporal: por defecto 30 días; "todo" sin límite.
  const ahora = new Date();
  const dias = sp.dias === "todo" ? null : Number(sp.dias ?? "30");
  const desde =
    dias != null && Number.isFinite(dias)
      ? new Date(ahora.getTime() - dias * 86400000)
      : null;

  // Alcance (rango + usuario) para KPIs y rankings; el filtro de evento (kind)
  // solo acota el detalle cronológico.
  const whereScope = {
    ...(desde ? { createdAt: { gte: desde } } : {}),
    ...(sp.user ? { userName: sp.user } : {}),
  };
  const whereDetalle = {
    ...whereScope,
    ...(sp.kind ? { kind: sp.kind } : {}),
  };

  const [porTipo, rutas, usuarios, detalle, userOpts] = await Promise.all([
    prisma.accessLog.groupBy({ by: ["kind"], where: whereScope, _count: { kind: true } }),
    prisma.accessLog.groupBy({
      by: ["path"],
      where: { ...whereScope, kind: "navegacion" },
      _count: { path: true },
      orderBy: { _count: { path: "desc" } },
      take: 15,
    }),
    prisma.accessLog.groupBy({
      by: ["userName"],
      where: whereScope,
      _count: { userName: true },
      _max: { createdAt: true },
      orderBy: { _count: { userName: "desc" } },
      take: 12,
    }),
    prisma.accessLog.findMany({
      where: whereDetalle,
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, createdAt: true, userName: true, role: true, kind: true, path: true, ip: true },
    }),
    prisma.accessLog.findMany({ distinct: ["userName"], select: { userName: true }, orderBy: { userName: "asc" } }),
  ]);

  const cuentaTipo = (k: string) => porTipo.find((t) => t.kind === k)?._count.kind ?? 0;
  const total = porTipo.reduce((s, t) => s + t._count.kind, 0);
  const navegaciones = cuentaTipo("navegacion");
  const ingresos = cuentaTipo("ingreso");
  const usuariosActivos = usuarios.length;

  const maxRuta = rutas[0]?._count.path ?? 1;
  const maxUser = usuarios[0]?._count.userName ?? 1;

  const rows: AccesoRow[] = detalle.map((e) => ({
    id: e.id,
    ts: fmtDateTime(e.createdAt),
    user: e.userName,
    role: e.role,
    kind: e.kind,
    path: e.path,
    ip: e.ip,
  }));
  const users = userOpts.map((u) => u.userName);

  return (
    <div>
      <PageHeader
        title="Auditoría"
        subtitle="Accesos y tráfico: quién entra, cuándo y qué rutas concentran la actividad. Los datos se acumulan a medida que los usuarios navegan."
      />
      <AuditoriaTabs canAccesos canReporteEjecutivo={reporteAuth.ok} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Accesos en el rango" value={fmtNum(total)} tone="ink" />
        <StatCard label="Usuarios activos" value={fmtNum(usuariosActivos)} tone="blue" />
        <StatCard label="Navegaciones" value={fmtNum(navegaciones)} tone="ink" hint="vistas de página" />
        <StatCard label="Ingresos" value={fmtNum(ingresos)} tone="ok" hint="inicios de sesión" />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-800">Rutas con más tráfico</h2>
          {rutas.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-400">Aún no hay navegaciones registradas.</p>
          ) : (
            <ul className="space-y-2.5">
              {rutas.map((r) => (
                <li key={r.path}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[12.5px] text-ink-800">
                      {etiquetaRuta(r.path)}
                      <span className="ml-1.5 font-mono text-[11px] text-ink-400">{r.path}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] font-semibold text-ink-700">{fmtNum(r._count.path)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.round((r._count.path / maxRuta) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-800">Usuarios más activos</h2>
          {usuarios.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-400">Sin accesos en el rango.</p>
          ) : (
            <ul className="space-y-2.5">
              {usuarios.map((u) => (
                <li key={u.userName}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[12.5px] text-ink-800">{u.userName}</span>
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {u._max.createdAt ? `último ${timeAgo(u._max.createdAt, ahora)}` : ""}
                      <span className="ml-2 font-mono text-[12px] font-semibold text-ink-700">{fmtNum(u._count.userName)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-navy-700" style={{ width: `${Math.round((u._count.userName / maxUser) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AccesosTabla rows={rows} users={users} />
    </div>
  );
}
