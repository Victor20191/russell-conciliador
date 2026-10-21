"use client";

// «Archivo manual» (21/Oct/2026): qué pasa con el patrón manual del cliente al confirmar el borrador.
//  - igual: el mismo patrón ya guardado → no hay casilla; al confirmar se cuenta el uso.
//  - nuevo / reemplaza: casilla «Guardar este patrón manual para {cliente}», marcada por defecto.
//  - no_guardable: se dice por qué.
import { fmtDate } from "@/lib/format";
import type { FormatoManualBorrador } from "@/lib/modulos/formatos-manuales";

export function CasillaPatronManual({
  formato,
  marcada,
  onCambiar,
}: {
  formato: FormatoManualBorrador;
  marcada: boolean;
  onCambiar: (marcada: boolean) => void;
}) {
  const existente = formato.existente;
  const deQuien = existente
    ? `${existente.guardadoEn ? ` el ${fmtDate(existente.guardadoEn)}` : ""}${existente.guardadoPor ? ` por ${existente.guardadoPor}` : ""}`
    : "";
  if (formato.estado === "igual") {
    return (
      <p className="rounded-md border border-ok-500 bg-ok-100/30 px-3 py-2 text-[11.5px] leading-snug text-ok-700">
        Se leyó con el patrón manual de {formato.cliente}{deQuien ? ` (guardado${deQuien})` : ""}: al confirmar se suma un uso.
      </p>
    );
  }
  if (formato.estado === "no_guardable") {
    return (
      <p className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[11.5px] leading-snug text-ink-600">
        Este formato no se guardará como patrón manual de {formato.cliente}: {formato.motivo}
      </p>
    );
  }
  return (
    <label className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
      <input type="checkbox" checked={marcada} onChange={(e) => onCambiar(e.target.checked)} className="mt-0.5" />
      <span className="leading-snug">
        <b>Guardar este patrón manual para {formato.cliente}</b>
        <span className="block text-[11.5px] text-blue-800">
          {formato.estado === "reemplaza"
            ? `Reemplaza el mapeo del patrón manual guardado${deQuien}${existente?.archivoEjemplo ? ` con «${existente.archivoEjemplo}»` : ""}: los próximos archivos manuales de ${formato.cliente} con estos títulos se leerán con este mapeo.`
            : `Formato nuevo: los próximos archivos manuales de ${formato.cliente} que coincidan con estos títulos (80 % o más, sin importar la hoja) se leerán con este mapeo.`}
        </span>
      </span>
    </label>
  );
}
