// Detalle inline de la cuenta comparada: los cuatro componentes (SI/Db/Cr/SF) del
// balance contra los consolidados EFECTIVOS del lado tercero, para el mismo lote.
// Puramente presentacional (sin estado): se monta dentro de `TercerosClient`, que ya
// es un Client Component, por lo que no necesita su propia directiva "use client".
//
// Cualquier centavo de diferencia se muestra (sin umbral de materialidad, ver
// `src/lib/balance/montos-cruce.ts`): incluye los casos donde débito y crédito se
// compensan y el saldo final coincide, que antes pasaban inadvertidos.
import { fmt } from "@/lib/format";
import { CAMPOS_MONTOS, type Montos4 } from "@/lib/balance/montos-cruce";

const ETIQUETAS_MONTO: Record<(typeof CAMPOS_MONTOS)[number], string> = {
  saldoInicial: "Saldo anterior",
  debitos: "Débito",
  creditos: "Crédito",
  saldoFinal: "Saldo final",
};

/** Comparación de los cuatro componentes de una cuenta. `null` cuando no hay nada que mostrar. */
export function ComparacionImportes({ montosBalance, montosTercero, diferenciasMontos, enBalance, enTercero, sinDesglose }: {
  montosBalance: Montos4;
  montosTercero: Montos4;
  diferenciasMontos: Montos4;
  enBalance: boolean;
  enTercero: boolean;
  /** La cuenta no tiene terceros reales (solo la fila «propia»): no hay nada que desglosar. */
  sinDesglose?: boolean;
}) {
  if (!enBalance || !enTercero) return null; // el estado "incompleto" ya se señala aparte
  const componentesConDiferencia = CAMPOS_MONTOS.filter((campo) => diferenciasMontos[campo] !== 0);
  if (!componentesConDiferencia.length) {
    if (sinDesglose) return <div className="mt-0.5 text-[11px] font-normal text-ink-400">Sin desglose por tercero: los cuatro importes cuadran contra la fila propia.</div>;
    return null;
  }
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-normal text-warn-700">
      {componentesConDiferencia.map((campo) => (
        <span key={campo} title={`${ETIQUETAS_MONTO[campo]} — balance: ${fmt(montosBalance[campo])} · terceros: ${fmt(montosTercero[campo])}`}>
          {ETIQUETAS_MONTO[campo]} difiere: {fmt(diferenciasMontos[campo])}
        </span>
      ))}
    </div>
  );
}
