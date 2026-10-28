import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import InicioEnPreparacion from "./inicio-en-preparacion";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader, Card, CardHeader, StatCard, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { statusChip, fmtCompact, fmtDateTimeSeconds } from "@/lib/format";
import { FlashToast } from "@/components/flash-toast";

const STATUS_LABEL: Record<string, string> = { OK: "Conciliado", DIFF: "Diferencia", REVIEW: "En revisión" };
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "··";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ pwd?: string }>;
}) {
  const { pwd } = await searchParams;
  // `/dashboard` es el destino de toda redirección (login, raíz, permiso denegado): nunca redirige.
  // Con «Inicio» en desarrollo para el rol (publicable desde el 20/Oct/2026: sus indicadores aún no
  // son reales) muestra una bienvenida con accesos en vez de las cifras.
  const inicio = await authorizePermiso("dashboard:ver");
  if (!inicio.ok) {
    const usuario = await getCurrentUser();
    return <InicioEnPreparacion nombre={usuario?.name?.split(" ")[0] ?? ""} pwd={pwd} />;
  }
  // Todos los indicadores se limitan a la cartera del usuario (Admin/Superadmin
  // ven la plataforma completa). La actividad del equipo requiere además
  // `auditoria:ver` (solo administradores, 22/Oct/2026) y conserva el filtro
  // de cartera porque su texto puede contener datos sensibles de clientes.
  const [user, crearConciliacionAuth, alc, auditoriaAuth] = await Promise.all([
    getCurrentUser(),
    authorizePermiso("conciliaciones:crear"),
    alcanceLecturaUsuario(),
    authorizePermiso("auditoria:ver"),
  ]);
  const puedeCrearConciliacion = crearConciliacionAuth.ok;
  const puedeVerAuditoria = auditoriaAuth.ok;
  const recWhere = alc.todos ? {} : { clientId: { in: alc.clientIds } };
  const cmWhere = alc.todos ? {} : { clientId: { in: alc.clientIds } };
  const rowWhere = alc.todos ? {} : { reconciliation: { clientId: { in: alc.clientIds } } };
  const clientWhere = alc.todos ? {} : { id: { in: alc.clientIds } };
  // El dashboard necesita una foto coherente de varios indicadores. La
  // transacción por arreglo ejecuta las seis lecturas sobre una sola conexión,
  // evitando abrir varios sockets PostgreSQL a la vez durante un arranque frío.
  const [recs, diffSum, configuredCount, pendingCount, activity, pendingClients] = await prisma.$transaction([
    prisma.reconciliation.findMany({
      where: recWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, clientName: true, module: true, erp: true, diff: true,
        status: true, owner: true,
      },
    }),
    prisma.reconciliationRow.aggregate({ where: rowWhere, _sum: { diff: true } }),
    prisma.clientModule.count({ where: { status: "configured", ...cmWhere } }),
    prisma.clientModule.count({ where: { status: "pending", ...cmWhere } }),
    // Dentro de la transacción por arreglo no cabe una promesa vacía: sin permiso, no trae filas.
    prisma.auditEntry.findMany({
      where: alc.todos ? {} : { clientId: { in: alc.clientIds } },
      orderBy: { createdAt: "desc" },
      take: puedeVerAuditoria ? 6 : 0,
      select: { id: true, user: true, action: true, entity: true, detail: true, createdAt: true },
    }),
    prisma.client.findMany({
      where: { ...clientWhere, modules: { some: { status: "pending" } } },
      take: 20,
      select: {
        id: true,
        name: true,
        erp: { select: { name: true } },
        modules: {
          where: { status: "pending" },
          select: { id: true, module: { select: { name: true } } },
        },
      },
    }),
  ]);

  const inProcess = recs.filter((r) => r.status === "DIFF" || r.status === "REVIEW").length;
  const netDiff = diffSum._sum.diff ?? 0;
  const coverage = configuredCount + pendingCount > 0 ? Math.round((configuredCount / (configuredCount + pendingCount)) * 100) : 0;

  return (
    <div>
      {pwd === "1" && (
        <FlashToast
          tone="success"
          title="Contraseña actualizada correctamente."
          clearParam="pwd"
        />
      )}
      <PageHeader
        title={`Hola, ${user?.name?.split(" ")[0] ?? ""}`}
        subtitle="Resumen de tu trabajo de conciliación y diagnóstico"
        actions={puedeCrearConciliacion ? <Link href="/conciliacion/nueva" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="play" size={14} /> Nueva conciliación</Link> : null}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Conciliaciones" value={String(recs.length)} hint={`${inProcess} en proceso`} tone="blue" />
        <StatCard label="Pendientes en proceso" value={String(inProcess)} hint="requieren atención" tone={inProcess > 0 ? "warn" : "ok"} />
        <StatCard label="Diferencia neta acumulada" value={fmtCompact(netDiff)} hint="partidas con diferencia" tone={netDiff !== 0 ? "err" : "ok"} />
        <StatCard label="Cobertura parametrización" value={`${coverage}%`} hint={`${configuredCount} módulos configurados`} tone="ink" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Conciliaciones recientes" right={<Link href="/conciliacion/resultados" className="text-[12px] font-medium text-blue-600 hover:underline">Ver todas</Link>} />
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2 font-semibold">ID</th>
                  <th className="px-4 py-2 font-semibold">Cliente</th>
                  <th className="px-4 py-2 font-semibold">Módulo</th>
                  <th className="px-4 py-2 font-semibold">ERP</th>
                  <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Auditor</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 tabular-nums text-[11.5px] text-ink-500">{r.id}</td>
                    <td className="px-4 py-2.5 text-ink-800">{r.clientName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.module}</td>
                    <td className="px-4 py-2.5 text-ink-500">{r.erp}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{r.diff}</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChip(r.status)}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td className="px-4 py-2.5 text-ink-600">{r.owner}</td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/conciliacion/resultados/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:underline">Ver <Icon name="chev-r" size={12} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          {puedeVerAuditoria && (
            <Card>
              <CardHeader title="Actividad del equipo" />
              <div className="divide-y divide-ink-50">
                {activity.map((a) => (
                  <div key={a.id} className="flex gap-2.5 px-4 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-700 text-[10px] font-semibold text-white">{initials(a.user)}</div>
                    <div className="text-[12px] text-ink-700">
                      <div><b>{a.user}</b> <span className="text-ink-500">{a.action.toLowerCase()}</span> <b>{a.entity}</b></div>
                      <div className="text-[11px] text-ink-400">{a.detail}</div>
                      <div className="text-[10.5px] text-ink-400">{fmtDateTimeSeconds(a.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Parametrización pendiente" />
            <div className="divide-y divide-ink-50">
              {pendingClients.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium text-ink-800">{c.name}</span><span className="tabular-nums text-[11px] text-ink-400">{c.erp?.name ?? "Sin ERP"}</span></div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{c.modules.map((m) => <Chip key={m.id} label={m.module.name} tone="warn" />)}</div>
                </div>
              ))}
              {pendingClients.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-ink-400">Sin pendientes</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
