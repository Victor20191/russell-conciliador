"use client";

// Crear o editar una versión de patrón de archivo. El mapeo se hace sobre la MUESTRA del
// aplicativo (obligatoria para guardar); puede partir del archivo de un cliente que no coincidió
// o de otra versión, y se traslada por rótulo a las columnas de la muestra.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import {
  actualizarVersionPatron,
  analizarMuestraDeVersion,
  analizarMuestraPatron,
  analizarOriginalParaPatron,
  crearVersionPatron,
  type AnalisisPatron,
} from "@/app/actions/patrones-modulo";
import { EditorMapeoModulo, type RolModulo } from "../editor-mapeo-modulo";

export type BasePatron = { version: number; specJson: string; encabezadoJson: string };
export type EdicionPatron = { id: number; version: number; erpNombre: string; nota: string; actualizadoEn: string; muestraNombre: string };

const claseCampo = "w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400";

export default function EditorPatronClient({
  moduloCodigo,
  moduloLabel,
  roles,
  clasificadorRol,
  conNivelCartera,
  erps,
  erpInicial,
  recepcionLoteId,
  base,
  edicion,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  conNivelCartera: boolean;
  erps: { id: number; nombre: string }[];
  erpInicial?: number | null;
  /** Archivo de un cliente que no coincidió: prellena el mapeo (no es la muestra). */
  recepcionLoteId?: string | null;
  /** Otra versión de la que se parte («Nueva a partir de esta»). */
  base?: BasePatron | null;
  edicion?: EdicionPatron | null;
}) {
  const router = useRouter();
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}/patrones`;
  const [erpId, setErpId] = useState<number | null>(edicion ? null : (erpInicial ?? null));
  const [analisis, setAnalisis] = useState<AnalisisPatron | null>(null);
  const [spec, setSpec] = useState<SpecModulo | null>(null);
  const [nota, setNota] = useState(edicion?.nota ?? "");
  const [muestraLista, setMuestraLista] = useState(edicion != null);
  const muestraRef = useRef<File | null>(null);
  const [analizando, startAnalizar] = useTransition();
  const [guardando, startGuardar] = useTransition();

  const aplicar = (r: AnalisisPatron, esMuestra: boolean) => {
    if (!r.ok || !r.spec) {
      notifyError(r.message ?? "No se pudo analizar el archivo.");
      return;
    }
    setAnalisis(r);
    setSpec({ ...r.spec, subtotalesFila: undefined, fechaCorte: undefined, trmCierre: undefined });
    setMuestraLista(esMuestra);
  };

  // Edición: el mapeo se muestra sobre la muestra guardada. Nueva desde un archivo de cliente:
  // se prellena con ese archivo mientras llega la muestra.
  const idEdicion = edicion?.id ?? null;
  useEffect(() => {
    let vivo = true;
    if (idEdicion != null) {
      startAnalizar(async () => {
        const r = await analizarMuestraDeVersion({ id: idEdicion });
        if (vivo) aplicar(r, true);
      });
    } else if (recepcionLoteId) {
      startAnalizar(async () => {
        const r = await analizarOriginalParaPatron({ recepcionLoteId, moduloCodigo });
        if (vivo) aplicar(r, false);
      });
    }
    return () => { vivo = false; };
  }, [idEdicion, recepcionLoteId, moduloCodigo]);

  const analizarMuestra = (archivo: File, hoja?: string) => {
    startAnalizar(async () => {
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("archivo", archivo);
      if (hoja) fd.set("hoja", hoja);
      // El mapeo que ya hay (del archivo del cliente o de otra versión) se traslada por rótulo.
      if (!hoja && analisis && spec && !muestraLista) {
        fd.set("baseSpecJson", JSON.stringify(spec));
        fd.set("baseEncabezadoJson", JSON.stringify(analisis.encabezado ?? []));
      } else if (!hoja && base && !analisis) {
        fd.set("baseSpecJson", base.specJson);
        fd.set("baseEncabezadoJson", base.encabezadoJson);
      }
      const r = await analizarMuestraPatron(fd);
      aplicar(r, true);
      if (r.ok && r.coincidenciaBase != null) {
        notifySuccess(`El mapeo de partida se trasladó a la muestra (${r.coincidenciaBase} % de coincidencia). Revísalo.`);
      }
    });
  };

  const onMuestra = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    muestraRef.current = archivo;
    analizarMuestra(archivo);
  };

  const cambiarHoja = (hoja: string) => {
    if (edicion) {
      startAnalizar(async () => aplicar(await analizarMuestraDeVersion({ id: edicion.id, hoja }), true));
      return;
    }
    if (!muestraRef.current) {
      notifyError("Sube la muestra del aplicativo para elegir otra hoja.");
      return;
    }
    analizarMuestra(muestraRef.current, hoja);
  };

  const guardar = (aprobar: boolean) => {
    if (!spec) return;
    startGuardar(async () => {
      if (edicion) {
        const r = await actualizarVersionPatron({ id: edicion.id, actualizadoEn: edicion.actualizadoEn, specJson: JSON.stringify(spec), nota });
        if (!r.ok) { notifyError(r.message ?? "No se pudo guardar la versión."); return; }
        notifySuccess(r.message ?? "Versión actualizada.");
        router.push(ruta);
        return;
      }
      if (erpId == null) { notifyError("Elige el aplicativo del patrón."); return; }
      if (!muestraRef.current || !muestraLista) { notifyError("Sube el archivo de muestra del aplicativo."); return; }
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("erpId", String(erpId));
      fd.set("specJson", JSON.stringify(spec));
      fd.set("archivo", muestraRef.current);
      fd.set("nota", nota);
      if (aprobar) fd.set("aprobar", "1");
      const r = await crearVersionPatron(fd);
      if (!r.ok) { notifyError(r.message ?? "No se pudo guardar la versión."); return; }
      notifySuccess(r.message ?? "Versión guardada.");
      router.push(ruta);
    });
  };

  const erpNombre = edicion?.erpNombre ?? erps.find((e) => e.id === erpId)?.nombre ?? "";
  const puedeGuardar = spec != null && muestraLista && (edicion != null || erpId != null) && !analizando && !guardando;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 text-[12.5px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Aplicativo <span className="text-err-600">*</span></span>
            {edicion ? (
              <span className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 font-semibold text-ink-700">{edicion.erpNombre} · versión {edicion.version}</span>
            ) : (
              <select value={erpId ?? ""} onChange={(e) => setErpId(e.target.value ? Number(e.target.value) : null)} className={claseCampo}>
                <option value="">— elige el aplicativo —</option>
                {erps.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            )}
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Archivo de muestra {edicion ? "" : <span className="text-err-600">*</span>}</span>
            {edicion ? (
              <span className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-700">{edicion.muestraNombre}</span>
            ) : (
              <input type="file" accept=".xlsx,.xlsm,.xls,.xlsb,.csv,.txt" onChange={onMuestra} className="text-[12px] text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink-700 hover:file:bg-ink-200" />
            )}
            {!edicion && (
              <span className="text-[11px] leading-snug text-ink-400">
                Un archivo del aplicativo con el formato de {moduloLabel.toLowerCase()}. Queda guardado con la versión y lo ven los demás administradores: usa uno sin datos sensibles si es posible.
              </span>
            )}
          </label>
        </div>
        {analizando && <p className="text-[11.5px] text-ink-500">Analizando el archivo…</p>}
        {analisis?.referencia && !muestraLista && (
          <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
            Mapeo prellenado con «{analisis.referencia.nombreArchivo}» de {analisis.referencia.cliente}. Ese archivo no se guarda: sube la muestra
            del aplicativo y el mapeo se trasladará a sus columnas.
          </p>
        )}
        {base && !analisis && (
          <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
            Se parte de la versión {base.version}. Sube la muestra del nuevo formato y su mapeo se trasladará a las columnas de la muestra.
          </p>
        )}
        {!edicion && !analisis && !base && !recepcionLoteId && (
          <p className="text-[11.5px] text-ink-500">Sube la muestra para ver sus columnas y configurar cómo se lee.</p>
        )}
      </Card>

      {analisis && spec && (
        <Card className="p-4 text-[12.5px]">
          <EditorMapeoModulo
            analisis={analisis}
            spec={spec}
            setSpec={setSpec}
            roles={roles}
            clasificadorRol={clasificadorRol}
            conNivelCartera={conNivelCartera}
            modo="patron"
            onCambiarHoja={cambiarHoja}
          />
          <label className="mt-4 flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Nota (opcional)</span>
            <textarea value={nota} maxLength={2000} rows={3} onChange={(e) => setNota(e.target.value)} placeholder="Versión del ERP, informe del que sale el archivo, particularidades…" className={claseCampo} />
          </label>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={ruta} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">Volver a patrones</Link>
        <button type="button" disabled={!puedeGuardar} onClick={() => guardar(false)} className="rounded-md border border-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 hover:bg-blue-50 disabled:opacity-50">
          {guardando ? "Guardando…" : edicion ? "Guardar cambios" : "Guardar como pendiente"}
        </button>
        {!edicion && (
          <button type="button" disabled={!puedeGuardar} onClick={() => guardar(true)} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50">
            {guardando ? "Guardando…" : `Guardar y aprobar${erpNombre ? ` para ${erpNombre}` : ""}`}
          </button>
        )}
      </div>
    </div>
  );
}
