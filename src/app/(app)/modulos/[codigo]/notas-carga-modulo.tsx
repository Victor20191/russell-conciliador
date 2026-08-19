"use client";

/**
 * Notas / observaciones de carga del cliente para un módulo (texto libre que el
 * equipo guarda en Configuración › Perfiles de carga › preferencias del módulo):
 * se muestran como aviso al cargar el archivo y al revisar el borrador. No cambian
 * el cálculo; son memoria para el equipo, igual que las notas de carga del balance.
 */
export function NotasCargaModulo({ notas }: { notas: string }) {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
      <div className="mb-0.5 flex items-center gap-1.5 font-semibold"><span aria-hidden>📌</span> Notas de carga de este cliente</div>
      <p className="whitespace-pre-wrap leading-relaxed">{notas}</p>
    </div>
  );
}
