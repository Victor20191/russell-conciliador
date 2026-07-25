"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { notifyActionState, notifyError, notifySuccess } from "@/lib/client-notifications";
import {
  listarPerfilesCarga,
  eliminarPerfilCarga,
  eliminarCorreccionCarga,
  limpiarCorreccionesCarga,
  guardarAjustesCarga,
  type PerfilesCargaState,
} from "@/app/actions/perfiles-carga";
import type { ActionState } from "@/lib/definitions";
import { fmtDate } from "@/lib/format";

/**
 * Personalización de la CARGA DE BALANCES del cliente (ficha en Configuración ›
 * Clientes): perfiles de estructura guardados automáticamente al asociar una
 * carga y preferencias por defecto (hoja, signo, tercero) que el asistente aplica
 * cuando identifica o se le asigna el cliente.
 */
export function AjustesCargaModal({
  cliente,
  onClose,
}: {
  cliente: { id: number; name: string; nit: string };
  onClose: () => void;
}) {
  const [data, setData] = useState<PerfilesCargaState | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const res = await listarPerfilesCarga(cliente.id);
        if (vivo) setData(res);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [cliente.id]);

  const [saveState, saveAction, guardando] = useActionState<ActionState, FormData>(guardarAjustesCarga, {});
  useEffect(() => {
    notifyActionState(saveState, { success: "Preferencias de carga guardadas.", error: "No se pudieron guardar las preferencias." });
  }, [saveState]);

  const [eliminando, startEliminar] = useTransition();
  const [eliminandoObjetivo, setEliminandoObjetivo] = useState<string | null>(null);
  const eliminar = (id: number) => {
    if (!confirm("¿Eliminar este perfil? La próxima carga con ese formato volverá a detectar la estructura (con IA).")) return;
    setEliminandoObjetivo(`perfil:${id}`);
    startEliminar(async () => {
      try {
        const res = await eliminarPerfilCarga(id);
        if (res.ok) {
          notifySuccess("Perfil eliminado.");
          setData(await listarPerfilesCarga(cliente.id));
        } else {
          notifyError(res.message ?? "No se pudo eliminar el perfil.");
        }
      } finally {
        setEliminandoObjetivo(null);
      }
    });
  };
  const eliminarCorreccion = (id: number) => {
    if (!confirm("¿Eliminar esta corrección? Dejará de aplicarse automáticamente en las próximas cargas de este cliente.")) return;
    setEliminandoObjetivo(`correccion:${id}`);
    startEliminar(async () => {
      try {
        const res = await eliminarCorreccionCarga(id);
        if (res.ok) {
          notifySuccess("Corrección eliminada.");
          setData(await listarPerfilesCarga(cliente.id));
        } else {
          notifyError(res.message ?? "No se pudo eliminar la corrección.");
        }
      } finally {
        setEliminandoObjetivo(null);
      }
    });
  };
  const limpiarCorrecciones = () => {
    if (!confirm("¿Eliminar TODAS las correcciones memorizadas de este cliente? Las próximas cargas no aplicarán ningún ajuste automático por cuenta.")) return;
    setEliminandoObjetivo("correcciones:todas");
    startEliminar(async () => {
      try {
        const res = await limpiarCorreccionesCarga(cliente.id);
        if (res.ok) {
          notifySuccess(res.message ?? "Correcciones eliminadas.");
          setData(await listarPerfilesCarga(cliente.id));
        } else {
          notifyError(res.message ?? "No se pudieron eliminar las correcciones.");
        }
      } finally {
        setEliminandoObjetivo(null);
      }
    });
  };

  const footer = (
    <button onClick={onClose} className="ml-auto rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">
      Cerrar
    </button>
  );

  return (
    <Modal open onClose={onClose} title={`Carga de balances · ${cliente.name}`} size="2xl" footer={footer}>
      {cargando ? (
        <p className="px-1 py-6 text-center text-[12.5px] text-ink-400"><EstadoProcesando>Cargando perfiles y preferencias</EstadoProcesando></p>
      ) : !data?.ok ? (
        <p className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12.5px] text-err-700">
          {data?.message ?? "No se pudo consultar la información."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* ---- Perfiles de estructura guardados ---- */}
          <section className="flex flex-col gap-2">
            <div>
              <h3 className="text-[12.5px] font-semibold text-ink-800">Perfiles de formato guardados</h3>
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                La estructura del archivo memorizada por formato: con perfil, la carga se procesa al instante y{" "}
                <span className="font-semibold">sin IA</span>. Se crean automáticamente en cuanto la lectura queda asociada a este cliente.
              </p>
            </div>
            {data.perfiles.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-3 text-center text-[11.5px] text-ink-400">
                Este cliente aún no tiene un formato tabular memorizado. El próximo se creará automáticamente al asociar la lectura.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-ink-150">
                <table className="w-full text-[11.5px]">
                  <thead className="bg-ink-50 text-ink-500">
                    <tr className="text-left">
                      <th className="px-2.5 py-1.5 font-semibold">Hoja</th>
                      <th className="px-2.5 py-1.5 font-semibold">Columnas</th>
                      <th className="px-2.5 py-1.5 font-semibold">Origen</th>
                      <th className="px-2.5 py-1.5 text-right font-semibold">Usos</th>
                      <th className="px-2.5 py-1.5 font-semibold">Último uso</th>
                      <th className="px-2.5 py-1.5 font-semibold">Archivo ejemplo</th>
                      <th className="px-2.5 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perfiles.map((p) => (
                      <tr key={p.id} className="border-t border-ink-100 align-top">
                        <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-ink-700">{p.hoja}</td>
                        <td className="px-2.5 py-1.5 text-ink-600">{p.resumenColumnas || "—"}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5">
                          <Chip label={p.origen === "manual" ? "Ajustado a mano" : "Detectado (IA)"} tone={p.origen === "manual" ? "blue" : "ai"} />
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-ink-600">{p.vecesUsado}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-ink-500">
                          {fmtDate(p.ultimoUsoEn)}
                        </td>
                        <td className="max-w-[180px] truncate px-2.5 py-1.5 font-mono text-[10.5px] text-ink-500" title={p.archivoEjemplo ?? undefined}>
                          {p.archivoEjemplo ?? "—"}
                        </td>
                        <td className="px-2.5 py-1.5 text-right">
                          <button
                            type="button"
                            disabled={eliminando}
                            onClick={() => eliminar(p.id)}
                            title="Eliminar perfil (la próxima carga volverá a usar IA)"
                            className="rounded p-1 text-ink-400 hover:bg-err-50 hover:text-err-700 disabled:opacity-50"
                          >
                            {eliminandoObjetivo === `perfil:${p.id}` ? (
                              <EstadoProcesando etiqueta="Eliminando perfil" />
                            ) : (
                              <Icon name="x" size={13} />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---- Correcciones por cuenta memorizadas ---- */}
          <section className="flex flex-col gap-2 border-t border-ink-100 pt-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[12.5px] font-semibold text-ink-800">Correcciones por cuenta memorizadas</h3>
                <p className="text-[11.5px] leading-relaxed text-ink-500">
                  Los ajustes hechos en el borrador (reclasificar, desacoplar, omitir y re-parentar) se memorizan al
                  guardar cambios y se <span className="font-semibold">re-aplican solos</span> en cada nueva carga de este cliente.
                </p>
              </div>
              {(data.correcciones ?? []).length > 0 && (
                <button
                  type="button"
                  disabled={eliminando}
                  onClick={limpiarCorrecciones}
                  className="shrink-0 rounded-md border border-err-200 px-2.5 py-1 text-[11.5px] font-semibold text-err-700 hover:bg-err-50 disabled:opacity-50"
                >
                  {eliminandoObjetivo === "correcciones:todas" ? (
                    <EstadoProcesando>Eliminando</EstadoProcesando>
                  ) : (
                    "Borrar todas"
                  )}
                </button>
              )}
            </div>
            {(data.correcciones ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-3 text-center text-[11.5px] text-ink-400">
                Este cliente aún no tiene correcciones memorizadas. Se crearán al pulsar «Guardar cambios» en un borrador de balance.
              </p>
            ) : (
              <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-md border border-ink-150">
                <table className="w-full text-[11.5px]">
                  <thead className="sticky top-0 bg-ink-50 text-ink-500">
                    <tr className="text-left">
                      <th className="px-2.5 py-1.5 font-semibold">Cuenta</th>
                      <th className="px-2.5 py-1.5 font-semibold">Nombre</th>
                      <th className="px-2.5 py-1.5 font-semibold">Corrección</th>
                      <th className="px-2.5 py-1.5 text-right font-semibold">Aplicada</th>
                      <th className="px-2.5 py-1.5 font-semibold">Último uso</th>
                      <th className="px-2.5 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.correcciones ?? []).map((c) => (
                      <tr key={c.id} className="border-t border-ink-100 align-top">
                        <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[10.5px] text-ink-700">{c.cuenta}</td>
                        <td className="max-w-[180px] truncate px-2.5 py-1.5 text-ink-600" title={c.nombre ?? undefined}>{c.nombre ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-ink-600">{c.resumen}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-ink-600">{c.vecesAplicada}×</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-ink-500">{fmtDate(c.ultimoUsoEn)}</td>
                        <td className="px-2.5 py-1.5 text-right">
                          <button
                            type="button"
                            disabled={eliminando}
                            onClick={() => eliminarCorreccion(c.id)}
                            title="Eliminar corrección (deja de aplicarse en las próximas cargas)"
                            className="rounded p-1 text-ink-400 hover:bg-err-50 hover:text-err-700 disabled:opacity-50"
                          >
                            {eliminandoObjetivo === `correccion:${c.id}` ? (
                              <EstadoProcesando etiqueta="Eliminando corrección" />
                            ) : (
                              <Icon name="x" size={13} />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---- Preferencias por defecto ---- */}
          <section className="flex flex-col gap-2 border-t border-ink-100 pt-3">
            <div>
              <h3 className="text-[12.5px] font-semibold text-ink-800">Preferencias de carga</h3>
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                Se aplican automáticamente cuando el asistente detecta o solicita este cliente. «Auto» deja que la lectura decida. El estándar contable es NIF en todas las cargas.
              </p>
            </div>
            <form action={saveAction} className="flex flex-col gap-3">
              <input type="hidden" name="clienteId" value={cliente.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Hoja preferida (nombre exacto en el Excel)</span>
                  <input
                    type="text"
                    name="hojaPreferida"
                    defaultValue={data.ajustes?.hojaPreferida ?? ""}
                    placeholder="Auto (el usuario elige / se detecta)"
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Convención del crédito</span>
                  <select
                    name="convencionCredito"
                    defaultValue={data.ajustes?.convencionCredito ?? ""}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
                  >
                    <option value="">Auto (según el archivo)</option>
                    <option value="firmado">Firmado (crédito negativo)</option>
                    <option value="magnitud">Magnitud (todo positivo)</option>
                  </select>
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Estándar contable</span>
                  <div className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-2 text-[12.5px] font-semibold text-ink-700">
                    NIF (fijo)
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Agregar por tercero</span>
                  <select
                    name="agregarPorTercero"
                    defaultValue={data.ajustes?.agregarPorTercero == null ? "" : data.ajustes.agregarPorTercero ? "si" : "no"}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
                  >
                    <option value="">Auto (según el archivo)</option>
                    <option value="si">Sí (sumar por cuenta)</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-[11px] font-medium text-ink-600">Evitar doble conteo de subtotales (export jerárquico)</span>
                  <select
                    name="imputarSoloHojas"
                    defaultValue={data.ajustes?.imputarSoloHojas == null ? "" : data.ajustes.imputarSoloHojas ? "si" : "no"}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
                  >
                    <option value="">Auto (no)</option>
                    <option value="si">Sí — solo suman las cuentas del último nivel</option>
                    <option value="no">No</option>
                  </select>
                  <span className="text-[10.5px] leading-relaxed text-ink-400">
                    Actívalo si el ERP exporta la cuenta Y sus subcuentas/auxiliares, todas con saldo (p. ej. SIESA): las cuentas que traen detalle debajo pasan a agrupadora y solo suman las del último nivel, evitando que el balance quede al doble. No lo uses en balances mixtos.
                  </span>
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-[11px] font-medium text-ink-600">Notas / observaciones de carga</span>
                  <textarea
                    name="observaciones"
                    defaultValue={data.ajustes?.observaciones ?? ""}
                    rows={3}
                    maxLength={2000}
                    placeholder="Particularidades del formato de este cliente para recordar en cada carga (p. ej. «duplica renglones UC/CU — se omite uno»)."
                    className="resize-y rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-700 outline-none focus:border-blue-400"
                  />
                  <span className="text-[10.5px] leading-relaxed text-ink-400">
                    Texto libre. Aparecen como aviso al cargar y revisar el balance de este cliente. No cambian el cálculo; sirven de memoria para el equipo.
                  </span>
                </label>
              </div>
              {saveState?.message && !saveState.ok && <p className="text-[12px] font-medium text-err-700">{saveState.message}</p>}
              <button
                type="submit"
                disabled={guardando}
                className="w-fit rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
              >
                {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar preferencias"}
              </button>
            </form>
          </section>
        </div>
      )}
    </Modal>
  );
}
