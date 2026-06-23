import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import BalanceIndexClient, {
  type ClientGroup,
  type PeriodRow,
  type AuditRow,
} from "./balance-index-client";

export default async function BalancePage() {
  await requirePermiso("balance:ver");
  // Cartera de lectura: cada usuario ve solo los balances de SUS clientes
  // (Admin/Superadmin ven todos). El encabezado referencia al cliente por id.
  const alc = await alcanceLecturaUsuario();
  const whereCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };
  const [encabezados, carteraClientes] = await Promise.all([
    prisma.balancePruebaEncabezado.findMany({
      where: whereCliente,
      orderBy: [{ nombreCliente: "asc" }, { creadoEn: "desc" }],
      select: {
        id: true, nombreCliente: true, nit: true, periodo: true, version: true,
        esOficial: true, estado: true, completitud: true, ultimaCarga: true,
        mapeadas: true, sinMapear: true, filasTotales: true,
      },
    }),
    // Clientes de la cartera para el selector del modal de carga.
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, name: true, nit: true },
      orderBy: { name: "asc" },
    }),
  ]);
  // Cargar balance = permiso de rol (Staff es el único operativo). El alcance
  // por cliente se verifica de nuevo en la Server Action al enviar.
  const canUpload = (await authorizePermiso("balance:crear")).ok;
  const uploadClients = canUpload ? carteraClientes : [];

  // Agrupar por cliente → períodos. NOTA: el Map es solo para agregar aquí;
  // a la frontera RSC→client se pasan SOLO objetos planos serializables (periodList).
  type Agg = { clientName: string; clientNit: string; mapped?: number; unmapped?: number; total?: number; periods: Map<string, PeriodRow> };
  const byClient = new Map<string, Agg>();
  for (const b of encabezados) {
    let g = byClient.get(b.nombreCliente);
    if (!g) {
      g = { clientName: b.nombreCliente, clientNit: b.nit ?? "", periods: new Map() };
      byClient.set(b.nombreCliente, g);
    }
    if (g.mapped == null || b.esOficial) {
      g.mapped = b.mapeadas; g.unmapped = b.sinMapear; g.total = b.filasTotales;
    }
    let p = g.periods.get(b.periodo);
    if (!p) { p = { period: b.periodo, versions: 0, official: null, officialId: null, status: b.estado, complete: b.completitud, lastUpload: b.ultimaCarga ?? "" }; g.periods.set(b.periodo, p); }
    p.versions += 1;
    if (!p.officialId) p.officialId = b.id; // fallback si ninguna fila es oficial
    if (b.esOficial) {
      p.official = b.version; p.officialId = b.id; p.status = b.estado; p.complete = b.completitud; p.lastUpload = b.ultimaCarga ?? p.lastUpload;
    }
  }

  const clients: ClientGroup[] = [...byClient.values()].map((g) => ({
    clientName: g.clientName, clientNit: g.clientNit, mapped: g.mapped, unmapped: g.unmapped, total: g.total,
    periodList: [...g.periods.values()],
  }));

  // La bitácora detallada por movimiento vive ahora en /auditoria (registros_auditoria).
  const auditRows: AuditRow[] = [];

  const clientNames = clients.map((c) => c.clientName);

  return (
    <div>
      <PageHeader
        title="Balance de comprobación"
        subtitle="Fuente única de los balances cargados por cliente. Carga, versionamiento, validaciones y trazabilidad. Lo consumen DIAN y Conciliaciones."
      />
      <BalanceIndexClient
        clients={clients}
        auditRows={auditRows}
        clientNames={clientNames}
        uploadClients={uploadClients}
        canUpload={canUpload}
      />
    </div>
  );
}
