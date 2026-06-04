import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import MapeoClient, { type Account, type RussellOpt } from "./mapeo-client";

export default async function MapeoPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const sp = await searchParams;
  const balances = await prisma.balance.findMany({ select: { clientName: true }, distinct: ["clientName"], orderBy: { clientName: "asc" } });
  const clientNames = balances.map((b) => b.clientName);
  const cliente = sp.cliente && clientNames.includes(sp.cliente) ? sp.cliente : (clientNames.includes("El Zarzal S.A") ? "El Zarzal S.A" : clientNames[0] ?? "");

  const [accounts, options] = await Promise.all([
    prisma.clientAccount.findMany({ where: { clientName: cliente }, orderBy: { order: "asc" } }),
    prisma.russellOption.findMany({ orderBy: { code: "asc" } }),
  ]);

  const acc: Account[] = accounts.map((a) => ({ id: a.id, code: a.code, level: a.level, name: a.name, russellCode: a.russellCode }));
  const opts: RussellOpt[] = options.map((o) => ({ code: o.code, name: o.name, module: o.module }));

  return (
    <div>
      <PageHeader title="Mapeo plan estándar" subtitle="Parametrización de las cuentas del PUC del cliente (cuenta · subcuenta · auxiliar) contra el plan estándar de Russell Bedford y su módulo de conciliación." />
      <MapeoClient clientNames={clientNames} cliente={cliente} accounts={acc} options={opts} />
    </div>
  );
}
