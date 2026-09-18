"use client";

// NOMBRE DEL AGRUPADOR en el borrador: las filas que el sistema dejó como «(sin clasificar)» (el
// archivo no trae la columna del clasificador) o «GLOBAL» (modo único para todo el archivo) se
// pueden nombrar antes de confirmar, para conciliarlas como un renglón propio del Consolidado. En
// un anexo, un nombre que ya usa la versión vigente junta las filas en ese renglón.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtContable, fmtNum } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { nombrarAgrupadorBorrador } from "@/app/actions/modulos-datos";
import {
  ETIQUETA_GRUPO_SIN_NOMBRE,
  MAX_NOMBRE_CLASIFICADOR,
  nombreParecido,
  type GrupoSinNombre,
  type OpcionNombreClasificador,
} from "@/lib/modulos/nombre-clasificador";

export type GrupoSinNombreVm = { grupo: GrupoSinNombre; filas: number; total: number };

export function NombreAgrupador({
  loteId,
  grupos,
  opciones,
  clasificadorEtiqueta,
  anexo,
  bloqueado,
}: {
  loteId: string;
  grupos: GrupoSinNombreVm[];
  opciones: OpcionNombreClasificador[];
  clasificadorEtiqueta: string;
  /** Anexo a la versión vigente: sus agrupadores se ofrecen para juntar las filas. */
  anexo: { version: number; periodo: string; vigente: boolean } | null;
  /** Hay cambios del borrador sin guardar: primero se guardan o descartan. */
  bloqueado: boolean;
}) {
  if (grupos.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-ink-100 pt-3">
      {grupos.map((g) => (
        <BloqueGrupo key={g.grupo} loteId={loteId} grupo={g} opciones={opciones} clasificadorEtiqueta={clasificadorEtiqueta} anexo={anexo} bloqueado={bloqueado} />
      ))}
    </div>
  );
}

function BloqueGrupo({
  loteId,
  grupo,
  opciones,
  clasificadorEtiqueta,
  anexo,
  bloqueado,
}: {
  loteId: string;
  grupo: GrupoSinNombreVm;
  opciones: OpcionNombreClasificador[];
  clasificadorEtiqueta: string;
  anexo: { version: number; periodo: string; vigente: boolean } | null;
  bloqueado: boolean;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [guardando, startGuardar] = useTransition();
  const etiqueta = ETIQUETA_GRUPO_SIN_NOMBRE[grupo.grupo];
  const delDestino = anexo?.vigente ? opciones.filter((o) => o.enDestino) : [];
  const parecido = nombreParecido(nombre, opciones);
  const listaId = `nombres-agrupador-${grupo.grupo}`;
  const filas = `${fmtNum(grupo.filas)} fila${grupo.filas === 1 ? "" : "s"} (${fmtContable(grupo.total)})`;

  const aplicar = () => {
    startGuardar(async () => {
      const r = await nombrarAgrupadorBorrador({ loteId, grupo: grupo.grupo, nombre });
      if (!r.ok) { notifyError(r.message ?? "No se pudo poner el nombre."); return; }
      notifySuccess(r.message ?? "Nombre aplicado.");
      setNombre("");
      router.refresh();
    });
  };

  return (
    <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2.5 text-[12px] text-ink-700">
      <div className="font-semibold text-warn-700">
        {grupo.grupo === "global" ? `Agrupador «${etiqueta}»` : `Filas sin ${clasificadorEtiqueta.toLowerCase()}`}
      </div>
      <p className="mt-0.5 leading-snug">
        {grupo.grupo === "global"
          ? <>Todo el archivo quedó como «{etiqueta}»: {filas}. Puedes cambiarle el nombre (p. ej. «BODEGA NORTE»).</>
          : <>{filas} no traen {clasificadorEtiqueta.toLowerCase()} y quedaron «{etiqueta}». Ponles un nombre para conciliarlas como un renglón propio del Consolidado.</>}
        {" "}Un nombre que ya tiene cuenta en meses anteriores la trae sola.
      </p>
      {delDestino.length > 0 && anexo && (
        <p className="mt-1 leading-snug text-ink-600">
          Con un nombre que ya está en la v{anexo.version} de {anexo.periodo} estas filas se juntan con las suyas y comparten la
          cuenta; con uno nuevo quedan en un renglón aparte, con su propia cuenta.
          <span className="mt-1 flex flex-wrap gap-1.5">
            {delDestino.map((o) => (
              <button
                key={o.nombre}
                type="button"
                onClick={() => setNombre(o.nombre)}
                title={o.detalle}
                className={`rounded border px-2 py-0.5 text-[11.5px] font-semibold ${nombre === o.nombre ? "border-navy-600 bg-blue-50 text-navy-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}
              >
                {o.nombre}
              </button>
            ))}
          </span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          list={listaId}
          value={nombre}
          maxLength={MAX_NOMBRE_CLASIFICADOR}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && nombre.trim() && !bloqueado && !guardando) aplicar(); }}
          placeholder={grupo.grupo === "global" ? "Nuevo nombre del agrupador…" : "Nombre del agrupador (letras o números)…"}
          aria-label={`Nombre para las filas «${etiqueta}»`}
          className="min-w-[16rem] rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-800 outline-none focus:border-blue-400"
        />
        <datalist id={listaId}>
          {opciones.map((o) => <option key={o.nombre} value={o.nombre}>{o.detalle}</option>)}
        </datalist>
        <button
          type="button"
          disabled={!nombre.trim() || bloqueado || guardando}
          onClick={aplicar}
          className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Aplicando…" : "Poner nombre"}
        </button>
      </div>
      {parecido && (
        <p className="mt-1 text-[11.5px] font-medium text-warn-700">
          Ya existe «{parecido}», escrito distinto: serían dos renglones del Consolidado. Si es el mismo, elígelo de la lista.
        </p>
      )}
      {bloqueado && (
        <p className="mt-1 text-[11.5px] text-ink-500">Guarda o descarta los cambios pendientes del borrador antes de ponerle nombre.</p>
      )}
    </div>
  );
}
