import { Card } from "@/components/ui";
import { EstadoProcesando } from "@/components/estado-procesando";

export default function LoadingPatronesModulo() {
  return (
    <div aria-busy="true" aria-label="Cargando patrones de archivo" className="animate-pulse">
      <div className="mb-4 text-[12.5px] font-medium text-ink-500">
        <EstadoProcesando>Cargando patrones de archivo</EstadoProcesando>
      </div>
      <div className="mb-6">
        <div className="h-7 w-56 rounded bg-ink-150" />
        <div className="mt-2 h-3.5 w-full max-w-3xl rounded bg-ink-100" />
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <Card key={i} className="mb-4 overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="h-4 w-40 rounded bg-ink-150" />
          </div>
          {Array.from({ length: 3 }, (_, j) => (
            <div key={j} className="flex gap-4 border-b border-ink-100 px-4 py-3 last:border-b-0">
              <div className="h-3 w-12 rounded bg-ink-100" />
              <div className="h-3 flex-1 rounded bg-ink-100" />
              <div className="h-3 w-24 rounded bg-ink-100" />
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
