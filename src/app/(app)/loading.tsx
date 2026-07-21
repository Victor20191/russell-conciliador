import { Card } from "@/components/ui";
import { EstadoProcesando } from "@/components/estado-procesando";

const FILAS = 6;

/**
 * Estado de carga compartido por todas las páginas autenticadas. Next lo
 * prefiere junto con los enlaces del menú y lo muestra mientras el Server
 * Component de destino termina, por lo que el clic siempre tiene respuesta
 * visual inmediata y la navegación sigue siendo interrumpible.
 */
export default function AppRouteLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando página"
      className="animate-pulse"
    >
      <div className="mb-4 text-[12.5px] font-medium text-ink-500">
        <EstadoProcesando>Cargando página</EstadoProcesando>
      </div>
      <div className="mb-6">
        <div className="h-7 w-64 max-w-2/3 rounded bg-ink-150" />
        <div className="mt-2 h-3.5 w-full max-w-3xl rounded bg-ink-100" />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="p-4">
            <div className="h-3 w-24 rounded bg-ink-100" />
            <div className="mt-3 h-6 w-28 rounded bg-ink-150" />
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-5 gap-4 border-b border-ink-100 bg-ink-50 px-4 py-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-3 rounded bg-ink-150" />
          ))}
        </div>
        {Array.from({ length: FILAS }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-5 gap-4 border-b border-ink-100 px-4 py-3 last:border-0"
          >
            {Array.from({ length: 5 }, (__, column) => (
              <div key={column} className="h-3 rounded bg-ink-100" />
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
