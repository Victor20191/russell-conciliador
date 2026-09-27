import { PageHeader } from "@/components/ui";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { getCatalogoPrevalidadorVista } from "@/lib/parametros/prevalidador";
import { getCuentasConciliacionVista } from "@/lib/parametros/cuentas-conciliacion";
import { PREVALIDADOR_MODULOS_ORDEN } from "@/lib/balance/prevalidador/catalogo";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { moduloConCuentasConciliacion, moduloConOrigenPorCuenta } from "@/lib/modulos/cuentas-conciliacion";
import PrevalidadorConfigClient, { type ModuloConfigVm } from "./prevalidador-client";

export default async function PrevalidadorConfigPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  // Administrador y Superadministrador (permiso parametros:administrar): qué se
  // prevalida y qué concilia cada módulo es un criterio de la firma, no un dato de cliente.
  await requirePermiso("parametros:administrar");

  const [{ modulo }, catalogo, cuentas, modulosBd, plan6] = await Promise.all([
    searchParams,
    getCatalogoPrevalidadorVista(),
    getCuentasConciliacionVista(),
    prisma.module.findMany({
      where: { code: { in: [...PREVALIDADOR_MODULOS_ORDEN] } },
      select: { id: true, code: true, name: true },
    }),
    prisma.standardAccount.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  // Lo que la pantalla necesita del descriptor (tiene funciones: no viaja al cliente tal cual).
  const modulos: ModuloConfigVm[] = PREVALIDADOR_MODULOS_ORDEN.flatMap((code) => {
    const m = modulosBd.find((x) => x.code === code);
    if (!m) return [];
    const descriptor = descriptorModulo(code);
    const cedula = descriptor?.cedula;
    return [{
      id: m.id,
      code: m.code,
      name: m.name,
      conCuentas6: moduloConCuentasConciliacion(descriptor),
      conOrigen: moduloConOrigenPorCuenta(descriptor),
      conCrucePorTercero: descriptor?.crucePorTercero.habilitado === true,
      subgruposAbiertos: (cedula?.subgruposAbiertos ?? []).map((s) => ({ subgrupo: s.subgrupo, naturaleza: s.naturaleza })),
      paresRelacionados: (cedula?.valorRelacionado?.pares ?? []).map((p) => ({ subgrupo: p.subgrupo, cuenta6: p.cuenta6 })),
    }];
  });
  const moduloInicial = modulos.find((m) => m.code === modulo?.toUpperCase())?.code ?? modulos[0]?.code ?? "";

  return (
    <div>
      <PageHeader
        title="Cuentas del prevalidador"
        subtitle="Qué cuentas del plan estándar Russell se prevalidan y cuáles concilia cada módulo: el cruce contable, el cruce por tercero y el cierre en firme leen esta configuración."
      />
      <PrevalidadorConfigClient
        catalogo={catalogo}
        modulos={modulos}
        cuentas={cuentas}
        plan6={plan6.filter((c) => /^\d{6}$/.test(c.code)).map((c) => ({ codigo: c.code, nombre: c.name }))}
        moduloInicial={moduloInicial}
      />
    </div>
  );
}
