"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";

/** Cierre en firme de un módulo sobre el período de este balance. */
export type CierreFirmeVm = {
  id: number;
  moduloCodigo: string;
  periodo: string;
  moduloDatoEncabezadoId: number;
  balanceEncabezadoId: number;
  cerradoPor: string;
  cerradoEn: string;
  cuentas: number;
};

/** Cuenta (hoja del árbol) bloqueada: quién, desde qué cargue del módulo y cuándo. */
export type BloqueoCuentaVm = {
  moduloCodigo: string;
  moduloDatoEncabezadoId: number;
  cerradoPor: string;
  cerradoEn: string;
};

/**
 * Banner del período: lista los módulos cuya conciliación está en firme sobre este
 * período y qué versión del balance fue la conciliada. Solo el senior o gerente
 * asignado puede desbloquear, desde la pestaña Cruce contable del módulo.
 */
export function ConciliacionEnFirmeBanner({ cierres, balanceId, periodo }: { cierres: CierreFirmeVm[]; balanceId: number; periodo: string }) {
  return (
    <div className="mb-4 rounded-md border border-navy-700/30 bg-navy-700/5 px-3 py-2 text-[12px] text-ink-800">
      <div className="mb-1 inline-flex items-center gap-1 font-semibold text-navy-700">
        <Icon name="check" size={13} /> Conciliación en firme · {periodo}
      </div>
      <ul className="flex flex-col gap-0.5">
        {cierres.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-2">
            <span className="font-mono font-semibold">{c.moduloCodigo}</span>
            <span>{c.periodo}</span>
            <span className="text-ink-500">·</span>
            <span>cerró <b>{c.cerradoPor}</b> · {c.cerradoEn}</span>
            <span className="text-ink-500">·</span>
            <span>{c.cuentas} cuenta(s) bloqueada(s)</span>
            <span className="text-ink-500">·</span>
            <Link href={`/modulos/${c.moduloCodigo.toLowerCase()}/${c.moduloDatoEncabezadoId}`} className="font-semibold text-blue-600 hover:underline">
              cargue #{c.moduloDatoEncabezadoId} →
            </Link>
            {c.balanceEncabezadoId !== balanceId && (
              <span className="text-warn-700">
                (conciliada sobre <Link href={`/balance/${c.balanceEncabezadoId}`} className="font-semibold underline">otra versión</Link> del período)
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11.5px] text-ink-500">
        Mientras esté en firme no se puede cargar una versión que altere esas cuentas, congelar otra versión ni cambiar su homologación. Desbloquea desde la pestaña Cruce contable del módulo (senior o gerente asignado).
      </p>
    </div>
  );
}

/** Distintivo de cuenta bloqueada en la hoja del árbol del balance. */
export function DistintivoCuentaEnFirme({ bloqueo }: { bloqueo: BloqueoCuentaVm }) {
  return (
    <span
      title={`En firme por ${bloqueo.moduloCodigo} · cargue #${bloqueo.moduloDatoEncabezadoId} · cerró ${bloqueo.cerradoPor} · ${bloqueo.cerradoEn}`}
      className="inline-flex items-center gap-1 rounded border border-navy-700/30 bg-navy-700/10 px-1.5 py-px text-[10px] font-semibold text-navy-700"
    >
      <Icon name="check" size={9} /> En firme · {bloqueo.moduloCodigo} #{bloqueo.moduloDatoEncabezadoId}
      <span className="font-normal text-ink-500">· {bloqueo.cerradoPor} · {bloqueo.cerradoEn}</span>
    </span>
  );
}
