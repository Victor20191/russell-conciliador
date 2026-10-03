"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { consultarAsistenciaInventario } from "@/app/actions/asistencia-inventario";
import { Modal } from "@/components/modal";
import { notifySuccess } from "@/lib/client-notifications";
import type { RolModulo } from "./editor-mapeo-modulo";
import type { ResultadoAsistenciaVista } from "./asistencia-inventario-panel";

const AsistenciaInventarioPanel = dynamic(() => import("./asistencia-inventario-panel").then((m) => m.AsistenciaInventarioPanel));

export function CorregirLecturaInventario({ loteId, periodo, roles, bloqueado, continuar = false }: {
  loteId: string;
  periodo: string;
  roles: RolModulo[];
  bloqueado: boolean;
  /** Recepción que aún no ha llegado a crear staging: se recupera desde Borradores. */
  continuar?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAsistenciaVista | null>(null);
  const [errorConsulta, setErrorConsulta] = useState(false);
  const [consultando, startConsulta] = useTransition();
  const abrir = () => {
    setAbierto(true);
    setResultado(null);
    setErrorConsulta(false);
    startConsulta(async () => {
      try {
        const guardada = await consultarAsistenciaInventario({ recepcionLoteId: loteId });
        if (continuar && guardada.ok && guardada.estado === "borrador_preparado") {
          router.push(`/modulos/inv/borradores/${loteId}`);
          return;
        }
        setResultado(guardada);
      } catch {
        setErrorConsulta(true);
      }
    });
  };
  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={bloqueado || consultando}
        title={bloqueado ? "Guarda o descarta tus cambios antes de corregir la lectura." : continuar ? "Retomar la lectura del archivo conservado, sin volver a subirlo." : "Volver a leer el original con asistencia y comparar el resultado."}
        className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-navy-700 hover:bg-blue-50 disabled:opacity-50"
      >
        {continuar ? "Continuar lectura" : "Corregir lectura"}
      </button>
      {abierto && (
        <Modal open onClose={() => { setAbierto(false); router.refresh(); }} title={`${continuar ? "Continuar" : "Corregir"} lectura · inventarios`} size="2xl">
          {errorConsulta ? (
            <div className="flex flex-col gap-3 text-[12px]">
              <p role="alert" className="text-err-700">No pudimos recuperar la lectura guardada. El borrador no cambió.</p>
              <button type="button" onClick={abrir} disabled={consultando} className="self-end rounded-md bg-navy-700 px-3 py-2 font-semibold text-white disabled:opacity-50">Reintentar consulta</button>
            </div>
          ) : resultado ? (
            <AsistenciaInventarioPanel
              recepcionLoteId={loteId}
              periodo={periodo}
              resultadoInicial={resultado}
              roles={roles}
              correccion={!continuar}
              onPreparado={(preparadoId) => {
                setAbierto(false);
                notifySuccess(continuar ? "Borrador preparado" : "Lectura actualizada", "Revisa el borrador antes de confirmar la carga.");
                if (continuar) router.push(`/modulos/inv/borradores/${preparadoId}`);
                else router.refresh();
              }}
            />
          ) : <p role="status" className="py-4 text-[12px] text-ink-500">Recuperando el original y la lectura actual…</p>}
        </Modal>
      )}
    </>
  );
}
