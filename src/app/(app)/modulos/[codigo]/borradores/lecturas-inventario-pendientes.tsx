"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { descartarLecturaInventario } from "@/app/actions/asistencia-inventario";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { CorregirLecturaInventario } from "../corregir-lectura-inventario";
import { BOTON_ACCION } from "../listado-compartido";
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
  const router = useRouter();
  const [descartando, startDescartar] = useTransition();
  // Descartar se confirma en la misma fila, como en la lista de borradores.
  const [confirmar, setConfirmar] = useState<string | null>(null);

  if (lecturas.length === 0) return null;

  const descartar = (loteId: string) => {
    startDescartar(async () => {
      const r = await descartarLecturaInventario({ recepcionLoteId: loteId });
      if (r.ok) notifySuccess(r.message);
      else notifyError(r.message);
      setConfirmar(null);
      router.refresh();
    });
  };

  return (
    <Card className="mb-5 overflow-hidden">
      <div className="border-b border-ink-100 bg-blue-100 px-4 py-3">
        <h2 className="text-[12px] font-semibold text-navy-800">Lecturas por completar <span className="ml-1 rounded-full bg-blue-100 px-1.5 text-[10px]">{lecturas.length}</span></h2>
        <p className="mt-1 text-[11.5px] text-ink-500">Los originales están guardados. Retoma las preguntas o reintenta la lectura sin subir de nuevo el archivo, o descarta la que ya no necesites.</p>
      </div>
      <ul className="divide-y divide-ink-100">
        {lecturas.map((lectura) => {
          const enCurso = lectura.estado === "analizando";
          return (
            <li key={lectura.loteId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-[12px] font-medium text-ink-800">{lectura.nombreArchivo}</p>
                <p className="mt-0.5 break-words text-[11px] text-ink-500">{lectura.nombreCliente} · {lectura.periodo} · {lectura.fecha}</p>
                <p className="mt-1 text-[10.5px] text-navy-700">{enCurso ? "Lectura en curso" : lectura.estado === "error_recuperable" ? "Lista para reintentar" : "Necesita una respuesta"}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <CorregirLecturaInventario loteId={lectura.loteId} periodo={lectura.periodo} roles={roles} bloqueado={false} continuar />
                {confirmar === lectura.loteId ? (
                  <>
                    <span className="ml-1 text-[11px] font-medium text-err-700">¿Descartar?</span>
                    <button
                      type="button"
                      onClick={() => descartar(lectura.loteId)}
                      disabled={descartando}
                      title="Confirmar descarte"
                      aria-label="Confirmar descarte"
                      className={`${BOTON_ACCION} border-err-300 bg-err-100 text-err-700 hover:bg-err-200 disabled:opacity-60`}
                    >
                      <Icon name="check" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmar(null)}
                      disabled={descartando}
                      title="Cancelar"
                      aria-label="Cancelar descarte"
                      className={`${BOTON_ACCION} border-ink-200 text-ink-500 hover:bg-ink-50 hover:text-ink-800 disabled:opacity-60`}
                    >
                      <Icon name="x" size={15} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmar(lectura.loteId)}
                    disabled={enCurso || descartando}
                    title={enCurso ? "La lectura sigue en curso: espera a que termine para descartarla" : "Descartar lectura: el archivo sale de la lista y el original queda en la bitácora como descartado"}
                    aria-label="Descartar lectura"
                    className={`${BOTON_ACCION} border-err-200 text-err-600 hover:bg-err-50 hover:text-err-700 disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
