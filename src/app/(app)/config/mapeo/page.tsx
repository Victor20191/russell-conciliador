import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import MapeoClient, { type Account, type RussellOpt, type StdAccount } from "./mapeo-client";

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

  const [accounts, options, standard] = await Promise.all([
    prisma.clientAccount.findMany({
      where: { clientName: cliente },
      include: { russellOption: { select: { code: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.russellOption.findMany({ orderBy: { code: "asc" } }),
    prisma.standardAccount.findMany({ orderBy: { code: "asc" } }),
  ]);

  const acc: Account[] = accounts.map((a) => ({ id: a.id, code: a.code, level: a.level, name: a.name, russellCode: a.russellOption?.code ?? null }));
  const opts: RussellOpt[] = options.map((o) => ({ code: o.code, name: o.name, module: o.module }));
  const std: StdAccount[] = standard.map((s) => ({
    code: s.code,
    name: s.name,
    level: s.level,
    nature: s.nature,
    critical: s.critical,
    russellAccount: s.russellAccount,
    categoryType: s.categoryType,
    includes: s.includes,
    supportingDocuments: s.supportingDocuments,
    mappingNotes: s.mappingNotes,
  }));

  return (
    <div>
      <PageHeader title="Mapeo plan estándar" subtitle="Configuración de las cuentas del PUC del cliente contra el plan estándar de Russell Bedford y su módulo de conciliación." />
      <MapeoClient clientNames={clientNames} cliente={cliente} accounts={acc} options={opts} std={std} />
    </div>
  );
}
