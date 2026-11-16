import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import prisma from "@/lib/prisma";
import { alcanceSinRepetidos } from "@/lib/conciliacion/cuentas-bloqueo";

/**
 * «Quedan en firme al cerrar» (al final de Filtros de cuentas › cada módulo y de Mapeo cuentas DIAN):
 * las cuentas Russell cuyo saldo final y homologación quedan bloqueados en el balance del corte al
 * cerrar en firme. Solo consulta. Recibe el alcance ya calculado —el de los módulos con
 * `alcanceDelCierre`, el de los impuestos con `alcanceCierreImpuesto`— y no repite las cuentas que ya
 * cubre un grupo de la lista.
 */
export default async function QuedanEnFirme({ sigla, codigos, explicacion, nota }: {
  sigla: string;
  codigos: readonly string[];
  explicacion: ReactNode;
  nota?: ReactNode;
}) {
  const lista = alcanceSinRepetidos(codigos);
  const nombres = await nombresPlanRussell(lista);
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="shield" size={15} />
        <h2 className="text-[14px] font-semibold text-navy-800">Quedan en firme al cerrar</h2>
        <span className="text-[11px] text-ink-400">{sigla}</span>
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-500">{explicacion}</p>
      <div className="flex flex-col gap-1.5">
        {lista.map((codigo) => (
          <div key={codigo} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-150 bg-ink-50/60 px-3.5 py-2">
            <p className="min-w-0 text-[12.5px] text-ink-700">
              <span className="tabular-nums text-ink-900">{codigo}</span>{" "}
              {nombres.get(codigo) ?? <span className="text-warn-700">No existe en el plan Russell</span>}
            </p>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
              <Icon name="shield" size={12} /> {codigo.length <= 2 ? "Grupo entero" : codigo.length <= 4 ? "Subgrupo entero" : "Cuenta"}
            </span>
          </div>
        ))}
        {lista.length === 0 && <p className="text-[11.5px] text-ink-400">Sin cuentas configuradas: el cierre no bloquearía ninguna.</p>}
      </div>
      {nota && <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">{nota}</p>}
    </Card>
  );
}

/** Nombre de cada código en el plan Russell: cuentas de cualquier nivel y, a 4 dígitos, el subgrupo. */
async function nombresPlanRussell(codigos: readonly string[]): Promise<Map<string, string>> {
  if (codigos.length === 0) return new Map();
  const cuatro = codigos.filter((c) => c.length === 4);
  const [cuentas, subgrupos] = await Promise.all([
    prisma.standardAccount.findMany({ where: { code: { in: [...codigos] } }, select: { code: true, name: true } }),
    cuatro.length ? prisma.subgrupoEstandar.findMany({ where: { codigo: { in: cuatro } }, select: { codigo: true, nombre: true } }) : Promise.resolve([]),
  ]);
  return new Map<string, string>([
    ...subgrupos.map((s) => [s.codigo, s.nombre] as const),
    ...cuentas.map((c) => [c.code, c.name] as const),
  ]);
}
