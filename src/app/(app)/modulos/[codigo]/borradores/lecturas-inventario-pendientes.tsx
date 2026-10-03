"use client";

import { Card } from "@/components/ui";
import { CorregirLecturaInventario } from "../corregir-lectura-inventario";
import type { RolModulo } from "../editor-mapeo-modulo";

export type LecturaInventarioPendiente = {
  loteId: string;
  nombreArchivo: string;
  nombreCliente: string;
  periodo: string;
  fecha: string;
  estado: string;
};

export function LecturasInventarioPendientes({ lecturas, roles }: { lecturas: LecturaInventarioPendiente[]; roles: RolModulo[] }) {
  if (lecturas.length === 0) return null;
  return (
    <Card className="mb-5 overflow-hidden">
      <div className="border-b border-ink-100 bg-blue-50/40 px-4 py-3">
        <h2 className="text-[12px] font-semibold text-navy-800">Lecturas por completar <span className="ml-1 rounded-full bg-blue-100 px-1.5 text-[10px]">{lecturas.length}</span></h2>
        <p className="mt-1 text-[11.5px] text-ink-500">Los originales están guardados. Retoma las preguntas o reintenta la lectura sin subir de nuevo el archivo.</p>
      </div>
      <ul className="divide-y divide-ink-100">
        {lecturas.map((lectura) => (
          <li key={lectura.loteId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <p className="break-words text-[12px] font-medium text-ink-800">{lectura.nombreArchivo}</p>
              <p className="mt-0.5 break-words text-[11px] text-ink-500">{lectura.nombreCliente} · {lectura.periodo} · {lectura.fecha}</p>
              <p className="mt-1 text-[10.5px] text-navy-700">{lectura.estado === "analizando" ? "Lectura en curso" : lectura.estado === "error_recuperable" ? "Lista para reintentar" : "Necesita una respuesta"}</p>
            </div>
            <CorregirLecturaInventario loteId={lectura.loteId} periodo={lectura.periodo} roles={roles} bloqueado={false} continuar />
          </li>
        ))}
      </ul>
    </Card>
  );
}
