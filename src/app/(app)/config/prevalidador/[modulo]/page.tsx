import { notFound } from "next/navigation";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { getCatalogoPrevalidadorVista } from "@/lib/parametros/prevalidador";
import { getCuentasConciliacionVista, getSubgruposConciliacionVista } from "@/lib/parametros/cuentas-conciliacion";
import { PREVALIDADOR_MODULOS_ORDEN } from "@/lib/balance/prevalidador/catalogo";
import { prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import PrevalidadorConfigClient from "../prevalidador-client";
import CuentasConciliacionPanel, { type ModuloCuentasVm } from "../cuentas-conciliacion-panel";
import SubgruposConciliacionPanel from "../subgrupos-conciliacion-panel";
import { cargarPlan4, cargarPlan6, configuracionModulo, moduloDeRuta } from "../datos";

/**
 * Configuración › Filtros de cuentas › **un módulo** (`/config/prevalidador/ing`, `/car`, `/inv`, `/afi`,
 * `/cxp`, `/nom`): la misma vista de «Cuentas del prevalidador» con solo las cuentas del módulo y
 * las cuentas propias que concilia: las de 6 dígitos (Ingresos, Cartera, CxP, Nómina) o los subgrupos
 * de 4 (Inventarios, Activos fijos). Son independientes del prevalidador. Entrada del submenú.
 */
/**
 * `?volver=` trae de regreso a la pestaña Cruce por tercero de un cargue (panel «Cuentas en este
 * cruce»). Solo se acepta esa ruta exacta: nunca un destino arbitrario.
 */
const RUTA_VOLVER = /^\/modulos\/[a-z]+\/\d+\?tab=cruceTercero(&panel=cuentas)?$/;

export default async function PrevalidadorModuloPage({
  params,
  searchParams,
}: {
  params: Promise<{ modulo: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  // Administrador y Superadministrador (permiso parametros:administrar): qué se prevalida y qué
  // concilia cada módulo es un criterio de la firma, no un dato de cliente.
  await requirePermiso("parametros:administrar");
  const codigo = moduloDeRuta((await params).modulo);
  if (!codigo) notFound();
  const { volver } = await searchParams;
  const volverAlCruce = typeof volver === "string" && RUTA_VOLVER.test(volver) ? volver : null;

  const config = configuracionModulo(codigo);
  const [catalogo, modulos, cuentas, plan6, subgrupos, plan4] = await Promise.all([
    getCatalogoPrevalidadorVista(),
    prisma.module.findMany({
      where: { code: { in: [...PREVALIDADOR_MODULOS_ORDEN] } },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    config.conCuentas6 ? getCuentasConciliacionVista() : Promise.resolve([]),
    config.conCuentas6 ? cargarPlan6() : Promise.resolve([]),
    // Los módulos a 4 dígitos (Inventarios, Activos fijos) concilian su propia lista de subgrupos,
    // independiente de la regla del prevalidador.
    config.conSubgrupos4 ? getSubgruposConciliacionVista(codigo) : Promise.resolve([]),
    config.conSubgrupos4 ? cargarPlan4() : Promise.resolve([]),
  ]);
  const modulo = modulos.find((m) => m.code === codigo);
  if (!modulo) notFound();
  // Módulos que concilian a 6 dígitos, en el orden del informe: el editor permite mover una cuenta.
  const modulosCuentas: ModuloCuentasVm[] = PREVALIDADOR_MODULOS_ORDEN.flatMap((code) => {
    const m = modulos.find((x) => x.code === code);
    const c = configuracionModulo(code);
    return m && c.conCuentas6 ? [{ code, name: m.name, conOrigen: c.conOrigen, conCategoria: c.conCategoria, conCrucePorTercero: c.conCrucePorTercero }] : [];
  });

  return (
    <div>
      {volverAlCruce && <div className="mb-3"><BackLink href={volverAlCruce} label="Volver al cruce por tercero" /></div>}
      <PageHeader
        title={`Cuentas del prevalidador · ${modulo.name}`}
        subtitle={`Cuentas del plan estándar Russell que se comparan contra el PUC del cliente antes de conciliar ${modulo.name}.`}
      />
      <div className="flex flex-col gap-4">
        <PrevalidadorConfigClient catalogo={catalogo} modulos={modulos} soloModulo={codigo} />

        {config.conCuentas6 && (
          <CuentasConciliacionPanel
            modulo={{ code: modulo.code, name: modulo.name, conOrigen: config.conOrigen, conCategoria: config.conCategoria, conCrucePorTercero: config.conCrucePorTercero }}
            modulosCuentas={modulosCuentas}
            cuentas={cuentas.filter((c) => c.moduloCodigo === codigo)}
            catalogo={catalogo}
            plan6={plan6}
          />
        )}

        {config.conSubgrupos4 && (
          <SubgruposConciliacionPanel
            modulo={{ code: modulo.code, name: modulo.name }}
            subgrupos={subgrupos}
            plan4={plan4}
            // Solo marca los que quedan fuera de la regla: la lista no depende de ella.
            prefijos={prefijosCuentaModulo(codigo, catalogo)}
            fijos={config.subgruposFijos}
          />
        )}

        {config.subgruposAbiertos.length > 0 && (
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="settings" size={15} />
              <h2 className="text-[14px] font-semibold text-ink-900">Cuentas relacionadas</h2>
              <span className="text-[11px] text-ink-400">{modulo.code}</span>
            </div>
            <p className="text-[11.5px] text-ink-500">
              Fijas en el sistema: {config.subgruposAbiertos.join(", ")} se concilia por cuenta de 6 dígitos y la
              depreciación del archivo cruza contra la cuenta relacionada con cada activo.
            </p>
            {config.paresRelacionados.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {config.paresRelacionados.map((p) => (
                  <span key={p.subgrupo} className="rounded-md border border-ink-150 bg-ink-50/60 px-2 py-1 font-mono text-[11.5px] tabular-nums text-ink-600">
                    {p.subgrupo} → {p.cuenta6}
                  </span>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
