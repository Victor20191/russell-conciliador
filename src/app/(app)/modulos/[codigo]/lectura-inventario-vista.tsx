"use client";

import { fmtContable } from "@/lib/format";
import type { EjemploLecturaInventario, EvidenciaCeldaInventario, ResumenLecturaInventario } from "@/lib/modulos/asistencia/tipos";

function nombreCelda(columna: number, fila: number): string {
  let letras = "";
  for (let n = columna; n > 0; n = Math.floor((n - 1) / 26)) letras = String.fromCharCode(65 + (n - 1) % 26) + letras;
  return `${letras}${fila}`;
}

export function CeldasOrigen({ celdas }: { celdas: EvidenciaCeldaInventario[] }) {
  return <ul className="space-y-1 text-[11px] text-ink-500">{celdas.map((celda, i) => (
    <li key={`${celda.hoja}-${celda.fila}-${celda.columna}-${i}`} className="break-words">
      <span className="font-medium text-ink-700">{celda.hoja} · {nombreCelda(celda.columna, celda.fila)}</span>
      <span className="ml-1.5 whitespace-pre-wrap">{celda.texto}</span>
    </li>
  ))}</ul>;
}

const nombresRoles: Record<string, string> = {
  referencia: "Referencia", descripcion: "Descripción", tipo: "Tipo de inventario",
  cantidad: "Cantidad", valorUnitario: "Valor unitario", valorTotal: "Valor total",
};

export function EjemplosLectura({ ejemplos }: { ejemplos: EjemploLecturaInventario[] }) {
  if (!ejemplos.length) return null;
  return <section className="space-y-3 rounded-md border border-blue-200 bg-blue-50/20 p-3" aria-label="Ejemplos de interpretación del archivo">
    <div>
      <p className="font-semibold text-ink-800">Así interpretamos tu archivo</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-600">Comprueba estos ejemplos antes de continuar. Cada campo muestra la celda de donde se tomó; si algo no corresponde, explícalo abajo para ajustar la lectura.</p>
    </div>
    {ejemplos.map((ejemplo) => <div key={ejemplo.fila} className="overflow-x-auto rounded-md border border-ink-150 bg-white">
      <table className="w-full table-fixed text-[11.5px]">
        <caption className="border-b border-ink-100 px-3 py-2 text-left font-medium text-ink-700">Producto desde la fila {ejemplo.fila}</caption>
        <thead className="border-b border-ink-100 text-left text-[10px] uppercase tracking-wide text-ink-500"><tr>
          <th className="w-1/4 px-3 py-2 font-medium">Campo</th><th className="w-1/4 px-3 py-2 font-medium">Dato leído</th><th className="w-1/2 px-3 py-2 font-medium">Origen en el archivo</th>
        </tr></thead>
        <tbody>{ejemplo.campos.map((dato) => <tr key={dato.rol} className="border-b border-ink-100 last:border-0">
          <th scope="row" className="break-words px-3 py-2 text-left align-top font-normal text-ink-600">{nombresRoles[dato.rol] ?? dato.rol}</th>
          <td className="break-words px-3 py-2 align-top font-medium text-ink-800">{dato.valor == null ? "Sin dato" : String(dato.valor)}</td>
          <td className="px-3 py-2 align-top"><CeldasOrigen celdas={dato.fuentes} /></td>
        </tr>)}</tbody>
      </table>
    </div>)}
  </section>;
}

export function ResumenAsistencia({ actual, anterior }: { actual: ResumenLecturaInventario; anterior?: ResumenLecturaInventario | null }) {
  const filas: { etiqueta: string; actual: string; anterior?: string }[] = [
    { etiqueta: "Registros incluidos", actual: actual.filasIncluidas.toLocaleString("es-CO"), anterior: anterior?.filasIncluidas.toLocaleString("es-CO") },
    { etiqueta: "Filas excluidas", actual: actual.filasExcluidas.toLocaleString("es-CO"), anterior: anterior?.filasExcluidas.toLocaleString("es-CO") },
    { etiqueta: "Valor leído", actual: fmtContable(actual.valorLeido), anterior: anterior ? fmtContable(anterior.valorLeido) : undefined },
    { etiqueta: "Total del archivo", actual: actual.totalDeclarado == null ? "No identificado" : fmtContable(actual.totalDeclarado), anterior: anterior ? anterior.totalDeclarado == null ? "No identificado" : fmtContable(anterior.totalDeclarado) : undefined },
    { etiqueta: "Diferencia", actual: actual.diferencia == null ? "Sin control independiente" : fmtContable(actual.diferencia), anterior: anterior ? anterior.diferencia == null ? "Sin control independiente" : fmtContable(anterior.diferencia) : undefined },
  ];
  return (
    <div className="overflow-hidden rounded-md border border-ink-150">
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-ink-100 bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
        {actual.hoja && <span>Hoja <b className="text-ink-800">{actual.hoja}</b></span>}
        {actual.tipoInventario && <span>Tipo <b className="text-ink-800">{actual.tipoInventario}</b></span>}
      </div>
      <table className="w-full text-[11.5px]">
        <caption className="sr-only">{anterior ? "Comparación de la lectura actual y la propuesta" : "Resumen de la lectura completa"}</caption>
        <thead className="border-b border-ink-100 text-[10px] uppercase tracking-wide text-ink-500">
          <tr><th className="px-3 py-2 text-left font-medium">Control</th>{anterior && <th className="px-3 py-2 text-right font-medium">Actual</th>}<th className="px-3 py-2 text-right font-medium">{anterior ? "Propuesta" : "Resultado"}</th></tr>
        </thead>
        <tbody>{filas.map((fila) => (
          <tr key={fila.etiqueta} className="border-b border-ink-100 last:border-0">
            <th scope="row" className="px-3 py-2 text-left font-normal text-ink-600">{fila.etiqueta}</th>
            {anterior && <td className="px-3 py-2 text-right tabular-nums text-ink-500">{fila.anterior}</td>}
            <td className={`px-3 py-2 text-right font-medium tabular-nums ${anterior && fila.actual !== fila.anterior ? "bg-blue-50/40 text-navy-800" : "text-ink-800"}`}>{fila.actual}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

