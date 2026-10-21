"use client";

// «Archivo manual» (21/Oct/2026): con qué patrón manual del cliente coincidió el archivo. El patrón
// se aplica al mapeo y el usuario lo revisa; puede no usarlo (vuelve la sugerencia automática) y
// volver a usarlo. Al confirmar el cargue se guarda o se cuenta su uso (casilla del borrador).
import { fmtDate } from "@/lib/format";
import type { FormatoManualAnalisis } from "@/lib/modulos/formatos-manuales";

const boton = "rounded-md border px-2.5 py-1 text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function AvisoPatronManual({
  formato,
  cliente,
  sinFormato,
  ocupado,
  onNoUsar,
  onUsar,
}: {
  formato: FormatoManualAnalisis | null;
  cliente: string;
  /** El usuario pidió no usar el patrón manual: el mapeo es la sugerencia automática. */
  sinFormato: boolean;
  ocupado: boolean;
  onNoUsar: () => void;
  onUsar: () => void;
}) {
  if (formato) {
    const usos = formato.vecesUsado === 1 ? "usado 1 vez" : `usado ${formato.vecesUsado} veces`;
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-ok-500 bg-ok-100/30 px-3 py-2 text-[11.5px] leading-relaxed">
        <span className="font-semibold text-ok-700">
          Patrón manual de {cliente} · {formato.anterior ? "coincide con su encabezado exacto" : `${formato.porcentaje} % de coincidencia`}
        </span>
        <span className="text-ink-600">
          Guardado{formato.guardadoEn ? ` el ${fmtDate(formato.guardadoEn)}` : ""}{formato.guardadoPor ? ` por ${formato.guardadoPor}` : ""} · {usos}
          {formato.archivoEjemplo ? <> · ejemplo «{formato.archivoEjemplo}»</> : null}. Se aplicó su mapeo: revísalo y ajústalo si hace falta.
        </span>
        {formato.advertencias.length > 0 && (
          <ul className="list-disc pl-4 text-warn-700">
            {formato.advertencias.map((aviso) => <li key={aviso}>{aviso}</li>)}
          </ul>
        )}
        <div>
          <button type="button" disabled={ocupado} onClick={onNoUsar} className={`${boton} border-ink-200 bg-white text-ink-700 hover:bg-ink-50`}>
            No usar este patrón
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11.5px] leading-relaxed text-blue-800">
      <span>
        Archivo manual: indica qué es cada columna.{" "}
        {sinFormato
          ? `No se usó el patrón manual de ${cliente}: el mapeo es la sugerencia automática.`
          : `${cliente} no tiene un patrón manual que coincida con este archivo; al confirmar el cargue podrás guardarlo como patrón manual.`}
      </span>
      {sinFormato && (
        <div>
          <button type="button" disabled={ocupado} onClick={onUsar} className={`${boton} border-blue-300 bg-white text-blue-800 hover:bg-blue-50`}>
            Usar el patrón guardado
          </button>
        </div>
      )}
    </div>
  );
}
