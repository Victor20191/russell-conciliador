import { Card } from "@/components/ui";
import { EstadoProcesando } from "@/components/estado-procesando";

const FILAS_ESQUELETO = 6;

export default function LoadingBorradores() {
  return (
    <div aria-busy="true" aria-label="Cargando balances borrador" className="animate-pulse">
      <div className="mb-4 text-[12.5px] font-medium text-ink-500">
        <EstadoProcesando>Cargando balances borrador</EstadoProcesando>
      </div>
      <div className="mb-6">
        <div className="h-7 w-56 rounded bg-ink-150" />
        <div className="mt-2 h-3.5 w-full max-w-3xl rounded bg-ink-100" />
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[2fr_1.4fr_1fr_0.6fr_0.8fr_0.8fr_1fr] gap-4 border-b border-ink-100 bg-ink-50 px-3 py-3">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="h-3 rounded bg-ink-150" />
          ))}
        </div>
        {Array.from({ length: FILAS_ESQUELETO }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[2fr_1.4fr_1fr_0.6fr_0.8fr_0.8fr_1fr] gap-4 border-b border-ink-100 px-3 py-3 last:border-0"
          >
            {Array.from({ length: 7 }, (__, column) => (
              <div key={column} className="h-3 rounded bg-ink-100" />
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
