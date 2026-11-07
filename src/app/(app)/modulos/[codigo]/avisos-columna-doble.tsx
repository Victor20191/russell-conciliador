// Aviso de COLUMNA DOBLE en el mapeo: dos importes que el módulo suma leen la misma columna y el
// valor quedará duplicado (`src/lib/modulos/columna-doble.ts`). No bloquea nada. Lo comparten el
// editor de mapeo, la carga con patrón y los perfiles de carga de Configuración.
import { Icon } from "@/components/icons";
import type { AvisoColumnaDoble } from "@/lib/modulos/columna-doble";

export function AvisosColumnaDoble({ avisos, consejo }: { avisos: readonly AvisoColumnaDoble[]; consejo?: string }) {
  if (avisos.length === 0) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-md border border-warn-500 bg-warn-100 px-3 py-2 text-[11.5px] leading-relaxed text-warn-700">
      <Icon name="warn" size={14} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        {avisos.map((a) => <p key={`${a.columna}:${a.roles.join(",")}`} className="font-medium">{a.mensaje}</p>)}
        {consejo && <p>{consejo}</p>}
      </div>
    </div>
  );
}
