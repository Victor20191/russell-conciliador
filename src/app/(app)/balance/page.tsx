import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import BalanceIndexClient, {
  type ClientGroup,
  type PeriodRow,
  type AuditRow,
} from "./balance-index-client";
import { fmtDateTime } from "@/lib/format";
import { configuracionIABalanceUISesion } from "@/lib/ia/proveedor-balance-sesion";

export default async function BalancePage() {
  await requirePermiso("balance:ver");
  // Cartera de lectura: cada usuario ve solo los balances de SUS clientes
  // (Admin/Superadmin ven todos). El encabezado referencia al cliente por id.
  const alc = await alcanceLecturaUsuario();
  const whereCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };
  const [encabezados, carteraClientes] = await Promise.all([
    prisma.balancePruebaEncabezado.findMany({
      where: whereCliente,
      orderBy: { creadoEn: "desc" },
      select: {
        id: true, clienteId: true, nombreCliente: true, nit: true, periodo: true, version: true,
        esOficial: true, estado: true, completitud: true, ultimaCarga: true,
        mapeadas: true, sinMapear: true, filasTotales: true, creadoEn: true,
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
  // Selector de proveedor: visible en dev autorizado o para usuarios del
  // dominio corporativo (la Server Action re-verifica al enviar).
  const configuracionIA = canUpload ? await configuracionIABalanceUISesion() : null;

  // Agrupar por cliente → períodos. La clave es el clienteId (NO el nombre, que
  // es denormalizado: dos clientes homónimos no deben fusionarse y un cliente
  // renombrado no debe partirse). El mapeo (mapeadas/sinMapear/total) se lleva a
  // nivel de PERÍODO (su versión oficial), no de cliente, para no mezclar
  // períodos. A la frontera RSC→client se pasan SOLO objetos planos serializables.
  type Agg = {
    clientId: number; clientName: string; clientNit: string;
    periods: Map<string, PeriodRow>;
    // Sello de orden por última carga/recarga: el `creadoEn` más reciente de cada
    // período y del cliente entero (cada cargue/recargue crea un encabezado nuevo).
    periodTs: Map<string, number>; lastTs: number;
  };
  const byClient = new Map<number, Agg>();
  for (const b of encabezados) {
    const ts = b.creadoEn.getTime();
    let g = byClient.get(b.clienteId);
    if (!g) {
      g = { clientId: b.clienteId, clientName: b.nombreCliente, clientNit: b.nit ?? "", periods: new Map(), periodTs: new Map(), lastTs: ts };
      byClient.set(b.clienteId, g);
    }
    g.lastTs = Math.max(g.lastTs, ts);
    g.periodTs.set(b.periodo, Math.max(g.periodTs.get(b.periodo) ?? 0, ts));
    let p = g.periods.get(b.periodo);
    if (!p) {
      p = { period: b.periodo, versions: 0, official: null, officialId: null, status: b.estado, complete: b.completitud, lastUpload: b.ultimaCarga ? fmtDateTime(b.ultimaCarga) : "", mapped: b.mapeadas, unmapped: b.sinMapear, total: b.filasTotales };
      g.periods.set(b.periodo, p);
    }
    p.versions += 1;
    if (!p.officialId) p.officialId = b.id; // fallback si ninguna fila es oficial
    if (b.esOficial) {
      p.official = b.version; p.officialId = b.id; p.status = b.estado; p.complete = b.completitud; p.lastUpload = b.ultimaCarga ? fmtDateTime(b.ultimaCarga) : p.lastUpload;
      p.mapped = b.mapeadas; p.unmapped = b.sinMapear; p.total = b.filasTotales; // mapeo de la versión oficial del período
    }
  }

  // Orden por última carga/recarga (más reciente primero): tanto los clientes
  // como los períodos dentro de cada cliente.
  const clients: ClientGroup[] = [...byClient.values()]
    .sort((a, b) => b.lastTs - a.lastTs)
    .map((g) => ({
      clientId: g.clientId, clientName: g.clientName, clientNit: g.clientNit,
      periodList: [...g.periods.values()].sort(
        (x, y) => (g.periodTs.get(y.period) ?? 0) - (g.periodTs.get(x.period) ?? 0),
      ),
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
        configuracionIA={configuracionIA}
      />
    </div>
  );
}
