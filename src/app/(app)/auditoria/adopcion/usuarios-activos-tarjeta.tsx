import { Card } from "@/components/ui";
import {
  NOTA_USUARIOS_ACTIVOS,
  textoFraccionUsuariosActivos,
  textoNuncaIngresaron,
  textoUsuariosActivos,
  type UsuariosActivos,
} from "@/lib/auditoria/reporte-ejecutivo/usuarios-activos";

/**
 * «Usuarios activos: X de Y (Z %)» y «Nunca han ingresado: N» del tablero.
 *
 * Mide cuántas personas del equipo usan la plataforma frente a cuántas cuentas
 * hay; es distinto de «Usuarios con operaciones», que solo cuenta a quienes
 * dejaron acciones auditadas. El texto sale del mismo módulo que usa el reporte
 * generado, para que las dos pantallas digan lo mismo.
 */
export function TarjetaUsuariosActivos({ indicador }: { indicador: UsuariosActivos }) {
  const { total, activos } = indicador;
  // Mínimo visible de 3 % cuando hay al menos un activo, como en las demás barras del tablero.
  const ancho = total > 0 && activos > 0 ? Math.max(3, Math.round((activos / total) * 100)) : 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Usuarios activos
          </div>
          <div className="mt-1.5 break-words text-2xl font-semibold tabular-nums text-blue-600">
            {textoFraccionUsuariosActivos(indicador)}
          </div>
        </div>
        <div className="text-[13px] font-semibold tabular-nums text-ink-700">
          {textoNuncaIngresaron(indicador)}
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={textoUsuariosActivos(indicador)}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={activos}
        className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"
      >
        <div className="h-full rounded-full bg-navy-700" style={{ width: `${ancho}%` }} />
      </div>
      <p className="mt-2 text-[12px] text-ink-500">{NOTA_USUARIOS_ACTIVOS}</p>
    </Card>
  );
}
