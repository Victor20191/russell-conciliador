import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario, getMatriz } from "@/lib/rbac/contexto";
import { tienePermiso } from "@/lib/rbac/permisos";
import { getCurrentUser } from "@/lib/dal";
import { PageHeader } from "@/components/ui";
import MapeoClient, {
  type Account,
  type RussellOpt,
  type StdAccount,
  type StdLogRow,
} from "./mapeo-client";

export default async function MapeoPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requirePermiso("mapeo:ver");
  const sp = await searchParams;
  // El selector ofrece SOLO los clientes de la cartera del usuario; el `cliente`
  // elegido (searchParams) se valida contra esa lista, de modo que no puede
  // consultarse el plan de cuentas de un cliente ajeno por la URL.
  const alc = await alcanceLecturaUsuario();
  const balances = await prisma.balance.findMany({
    where: alc.todos ? {} : { clientName: { in: alc.clientNames } },
    select: { clientName: true },
    distinct: ["clientName"],
    orderBy: { clientName: "asc" },
  });
  const clientNames = balances.map((b) => b.clientName);
  const cliente = sp.cliente && clientNames.includes(sp.cliente) ? sp.cliente : (clientNames.includes("El Zarzal S.A") ? "El Zarzal S.A" : clientNames[0] ?? "");

  // Solo el Administrador parametriza el plan estándar (gate `mapeo:administrar`).
  // El flag controla la UI; la autoridad real sigue siendo el gate de la action.
  const user = await getCurrentUser();
  const matriz = await getMatriz();
  const canManage = user ? tienePermiso(matriz, user.role, "mapeo:administrar") : false;

  const [accounts, options, standard, logs] = await Promise.all([
    prisma.clientAccount.findMany({
      where: { clientName: cliente },
      include: { russellOption: { select: { code: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.russellOption.findMany({ orderBy: { code: "asc" } }),
    prisma.standardAccount.findMany({ orderBy: { code: "asc" } }),
    // Bitácora dedicada: solo se carga para quien puede administrar (los más
    // recientes; la tabla conserva el histórico completo + espejo en /auditoria).
    canManage
      ? prisma.standardAccountLog.findMany({ orderBy: { createdAt: "desc" }, take: 1000 })
      : Promise.resolve([]),
  ]);

  const acc: Account[] = accounts.map((a) => ({ id: a.id, code: a.code, level: a.level, name: a.name, russellCode: a.russellOption?.code ?? null }));
  const opts: RussellOpt[] = options.map((o) => ({ code: o.code, name: o.name, module: o.module }));
  const std: StdAccount[] = standard.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    level: s.level,
    nature: s.nature,
    parent: s.parent,
    critical: s.critical,
    russellAccount: s.russellAccount,
    categoryType: s.categoryType,
    includes: s.includes,
    excludes: s.excludes,
    possibleAccounts: s.possibleAccounts,
    supportingDocuments: s.supportingDocuments,
    controlSupports: s.controlSupports,
    mappingNotes: s.mappingNotes,
  }));
  const stdLogs: StdLogRow[] = logs.map((l) => ({
    id: l.id,
    code: l.code,
    action: l.action,
    user: l.user,
    detail: l.detail,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader title="Mapeo plan estándar" subtitle="Configuración de las cuentas del PUC del cliente contra el plan estándar de Russell Bedford y su módulo de conciliación." />
      <MapeoClient clientNames={clientNames} cliente={cliente} accounts={acc} options={opts} std={std} canManage={canManage} logs={stdLogs} />
    </div>
  );
}
