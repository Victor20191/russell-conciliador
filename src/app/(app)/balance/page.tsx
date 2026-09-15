import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import BalanceIndexClient, {
  type ClientGroup,
  type PeriodGroup,
  type PeriodRow,
  type AuditRow,
} from "./balance-index-client";
import { compararApertura } from "@/lib/balance/apertura-balance";
import {
  aperturaDeListado,
  aperturasDeclaradasPorGrupo,
  claveRenglonApertura,
  periodoConAperturasParalelas,
} from "@/lib/balance/agrupacion-aperturas";
import { fmtDateTime } from "@/lib/format";
import { leerPartesArchivo } from "@/lib/balance/partes-archivo";
import { configuracionIABalanceUISesion } from "@/lib/ia/proveedor-balance-sesion";

// La extracción asistida puede tardar hasta 10 minutos. Vercel usa este valor
// para que la Server Action no sea terminada antes que su proveedor de IA.
export const maxDuration = 1800;

export default async function BalancePage() {
  await requirePermiso("balance:ver");
  // Cartera de lectura: cada usuario ve solo los balances de SUS clientes
  // (Admin/Superadmin ven todos). El encabezado referencia al cliente por id.
  const [alc, crearBalanceAuth] = await Promise.all([
    alcanceLecturaUsuario(),
    authorizePermiso("balance:crear"),
  ]);
  const canUpload = crearBalanceAuth.ok;
  const whereCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };
  const [encabezados, carteraClientes, configuracionIA, auditoria, usuariosAuditoria] = await Promise.all([
    prisma.balancePruebaEncabezado.findMany({
      where: whereCliente,
      orderBy: { creadoEn: "desc" },
      select: {
        _count: { select: { crucesComoCuenta: { where: { inconsistente: true } }, crucesComoTercero: { where: { inconsistente: true } } } },
        id: true, clienteId: true, nombreCliente: true, nit: true, periodo: true,
        esOficial: true, estado: true, completitud: true, ultimaCarga: true,
        mapeadas: true, sinMapear: true, filasTotales: true, aperturaBalance: true, creadoEn: true,
        archivosCargue: true,
      },
    }),
    // Clientes de la cartera para el selector del modal de carga.
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, name: true, nit: true },
      orderBy: { name: "asc" },
    }),
    canUpload ? configuracionIABalanceUISesion() : Promise.resolve(null),
    prisma.auditEntry.findMany({
      where: alc.todos
        ? { clientId: { not: null } }
        : { clientId: { in: alc.clientIds } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        createdAt: true,
        user: true,
        action: true,
        entity: true,
        detail: true,
        clientId: true,
        ip: true,
      },
    }),
    prisma.user.findMany({
      select: { name: true, role: true },
    }),
  ]);
  // Cargar balance = permiso de rol (Staff es el único operativo). El alcance
  // por cliente se verifica de nuevo en la Server Action al enviar.
  const uploadClients = canUpload ? carteraClientes : [];

  // Agrupar por cliente → períodos → renglones. La clave de cliente es el clienteId
  // (NO el nombre, que es denormalizado: dos clientes homónimos no deben fusionarse y
  // un cliente renombrado no debe partirse). El mapeo (mapeadas/sinMapear/total) se
  // lleva a nivel de RENGLÓN (su versión oficial), no de cliente, para no mezclar
  // períodos. A la frontera RSC→client se pasan SOLO objetos planos serializables.
  //
  // Un período se PARTE en un renglón por apertura cuando el cliente entregó las dos
  // («por cuenta» y «por terceros»): son dos archivos que coexisten y se cruzan entre
  // sí, no versiones sucesivas del mismo, y antes el más reciente ocultaba al otro —
  // incluso estando ambos marcados como inconsistentes. La regla (y el cuidado con los
  // cargues legados sin apertura declarada) vive en `agrupacion-aperturas.ts`.
  const clavePeriodo = (b: { clienteId: number; periodo: string }) => `${b.clienteId}::${b.periodo}`;
  const aperturasPorPeriodo = aperturasDeclaradasPorGrupo(
    encabezados.map((b) => ({ clave: clavePeriodo(b), aperturaBalance: b.aperturaBalance })),
  );

  type Agg = {
    clientId: number; clientName: string; clientNit: string;
    periods: Map<string, PeriodGroup>;
    // Sello de orden por última carga/recarga: el `creadoEn` más reciente de cada
    // período y del cliente entero (cada cargue/recargue crea un encabezado nuevo).
    periodTs: Map<string, number>; lastTs: number;
  };
  const byClient = new Map<number, Agg>();
  // Índice auxiliar de renglones por período: `PeriodGroup.rows` viaja como arreglo
  // plano al cliente, pero acá hace falta ubicarlos por apertura mientras se agregan.
  const filasPorPeriodo = new Map<string, Map<string, PeriodRow>>();
  for (const b of encabezados) {
    const ts = b.creadoEn.getTime();
    let g = byClient.get(b.clienteId);
    if (!g) {
      g = { clientId: b.clienteId, clientName: b.nombreCliente, clientNit: b.nit ?? "", periods: new Map(), periodTs: new Map(), lastTs: ts };
      byClient.set(b.clienteId, g);
    }
    g.lastTs = Math.max(g.lastTs, ts);
    g.periodTs.set(b.periodo, Math.max(g.periodTs.get(b.periodo) ?? 0, ts));

    const claveP = clavePeriodo(b);
    const declaradas = aperturasPorPeriodo.get(claveP);
    const apertura = aperturaDeListado(b.aperturaBalance, declaradas);
    const claveFila = claveRenglonApertura(claveP, apertura);
    // Marcado por el cruce de aperturas: este archivo no cuadra contra su contraparte.
    const inconsistente = b._count.crucesComoCuenta + b._count.crucesComoTercero > 0;
    // Balance partido en varios archivos: nombres de las partes de ESTA versión.
    const archivos = leerPartesArchivo(b.archivosCargue).map((parte) => parte.archivoNombre);

    let grupo = g.periods.get(b.periodo);
    if (!grupo) {
      grupo = { period: b.periodo, paralelo: periodoConAperturasParalelas(declaradas), rows: [] };
      g.periods.set(b.periodo, grupo);
      filasPorPeriodo.set(claveP, new Map());
    }
    const filas = filasPorPeriodo.get(claveP)!;
    let p = filas.get(claveFila);
    if (!p) {
      p = { key: claveFila, period: b.periodo, apertura, versions: 0, officialId: null, status: b.estado, complete: b.completitud, lastUpload: b.ultimaCarga ? fmtDateTime(b.ultimaCarga) : "", mapped: b.mapeadas, unmapped: b.sinMapear, total: b.filasTotales, inconsistentes: 0, archivos };
      filas.set(claveFila, p);
      grupo.rows.push(p);
    }
    p.versions += 1;
    if (inconsistente) p.inconsistentes += 1;
    if (!p.officialId) p.officialId = b.id; // fallback si ninguna versión es oficial
    if (b.esOficial) {
      p.officialId = b.id; p.status = b.estado; p.complete = b.completitud; p.lastUpload = b.ultimaCarga ? fmtDateTime(b.ultimaCarga) : p.lastUpload;
      p.mapped = b.mapeadas; p.unmapped = b.sinMapear; p.total = b.filasTotales; // mapeo de la versión oficial del renglón
      p.archivos = archivos; // los archivos que se indican son los de la versión que abre el renglón
    }
    // `p.apertura` NO se repisa con la versión oficial: es la clave del renglón, y en un
    // período partido cada renglón tiene la suya por construcción.
  }

  // Orden por última carga/recarga (más reciente primero): tanto los clientes como los
  // períodos dentro de cada cliente. Dentro de un período partido, las aperturas van en
  // orden estable («Por cuenta», «Por terceros», y los cargues sin declarar al final).
  const clients: ClientGroup[] = [...byClient.values()]
    .sort((a, b) => b.lastTs - a.lastTs)
    .map((g) => ({
      clientId: g.clientId, clientName: g.clientName, clientNit: g.clientNit,
      periodList: [...g.periods.values()]
        .sort((x, y) => (g.periodTs.get(y.period) ?? 0) - (g.periodTs.get(x.period) ?? 0))
        .map((grupo) => ({ ...grupo, rows: [...grupo.rows].sort((x, y) => compararApertura(x.apertura, y.apertura)) })),
    }));

  const clientePorId = new Map(carteraClientes.map((cliente) => [cliente.id, cliente.name]));
  const rolPorUsuario = new Map(usuariosAuditoria.map((usuario) => [usuario.name, usuario.role]));
  const auditRows: AuditRow[] = auditoria.flatMap((entrada) => {
    if (entrada.clientId == null) return [];
    const clientName = clientePorId.get(entrada.clientId);
    if (!clientName) return [];
    return [{
      date: fmtDateTime(entrada.createdAt),
      actor: entrada.user,
      role: rolPorUsuario.get(entrada.user) ?? "Sistema",
      action: entrada.action,
      ip: entrada.ip ?? "—",
      details: [entrada.entity, entrada.detail].filter(Boolean).join(" · "),
      clientId: entrada.clientId,
      clientName,
    }];
  });
  const auditClients = carteraClientes.map((cliente) => ({ id: cliente.id, name: cliente.name }));

  return (
    <div>
      <PageHeader
        title="Balance de comprobación"
        subtitle="Fuente única de los balances cargados por cliente. Carga, versionamiento, validaciones y trazabilidad. Lo consumen DIAN y Conciliaciones."
      />
      <BalanceIndexClient
        clients={clients}
        auditRows={auditRows}
        auditClients={auditClients}
        uploadClients={uploadClients}
        canUpload={canUpload}
        configuracionIA={configuracionIA}
      />
    </div>
  );
}
