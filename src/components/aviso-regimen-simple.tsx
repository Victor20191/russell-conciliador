import { Icon } from "@/components/icons";
import { CUENTAS_IVA_RST } from "@/lib/impuestos/rst/mapeo-f2593";

/**
 * Recordatorio para los clientes del Régimen Simple de Tributación (ficha del cliente en Sí): su IVA se
 * homologa a las cuentas propias del RST, que son contra las que cruza la revisión de anticipos
 * bimestrales (recibo 2593). Va en el balance, el borrador de balance y Mapeo cuentas cliente. Solo
 * recuerda: no bloquea homologar a otras cuentas.
 */

const NOMBRES: Readonly<Record<string, string>> = {
  [CUENTAS_IVA_RST.generado[0]]: "IVA generado",
  [CUENTAS_IVA_RST.generado[1]]: "IVA por devoluciones, anulaciones y ajustes en compras",
  [CUENTAS_IVA_RST.descontable[0]]: "IVA descontable",
  [CUENTAS_IVA_RST.descontable[1]]: "IVA por devoluciones, anulaciones y ajustes en ventas",
};

export const CUENTAS_AVISO_REGIMEN_SIMPLE: readonly string[] = [...CUENTAS_IVA_RST.generado, ...CUENTAS_IVA_RST.descontable];

export function AvisoRegimenSimple({ className = "" }: { className?: string }) {
  return (
    <div role="note" className={`flex items-start gap-3 rounded-lg border border-warn-300 bg-warn-50 px-4 py-3 ${className}`}>
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warn-500 text-white">
        <Icon name="warn" size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold uppercase tracking-wide text-warn-800">Cliente de Régimen Simple de Tributación</p>
        <p className="mt-0.5 text-[12.5px] text-ink-700">
          Recuerda homologar el IVA generado, el descontable y el de devoluciones con las cuentas propias del RST:
        </p>
        <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 text-[12.5px] text-ink-700 sm:grid-cols-2">
          {CUENTAS_AVISO_REGIMEN_SIMPLE.map((cuenta) => (
            <li key={cuenta}>
              <span className="font-semibold tabular-nums text-ink-900">{cuenta}</span> {NOMBRES[cuenta]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
