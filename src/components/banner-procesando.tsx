// Aviso de trabajo en curso: spinner + qué se está haciendo + barra indeterminada.
// Para operaciones largas (leer un archivo, consultar la IA) donde un texto suelto no basta.
export function BannerProcesando({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div role="status" aria-live="polite" className="overflow-hidden rounded-md border border-blue-300 bg-blue-50">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span aria-hidden className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-navy-700 border-r-transparent motion-reduce:animate-none" />
        <div className="min-w-0">
          <p className="break-words text-[12.5px] font-semibold text-navy-700">{titulo}</p>
          {detalle && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{detalle}</p>}
        </div>
      </div>
      <div aria-hidden className="h-1 w-full overflow-hidden bg-blue-100">
        <div className="barra-indeterminada h-full w-[30%] rounded-full bg-navy-700" />
      </div>
    </div>
  );
}
