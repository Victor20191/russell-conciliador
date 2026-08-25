"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { notifyActionState, notifyError, notifySuccess } from "@/lib/client-notifications";
import {
  listarPerfilesCarga,
  actualizarPerfilCarga,
  eliminarPerfilCarga,
  eliminarCorreccionCarga,
  limpiarCorreccionesCarga,
  guardarAjustesCarga,
  type PerfilCargaResumen,
  type PerfilesCargaState,
} from "@/app/actions/perfiles-carga";
import type { ActionState } from "@/lib/definitions";
import { fmtDate } from "@/lib/format";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";

type ColumnaSimple = Exclude<keyof SpecCarga["columnas"], "codigoFragmentos">;

const COLUMNAS_PERFIL: {
  key: Exclude<ColumnaSimple, "codigo">;
  nombre: string;
  explicacion: string;
}[] = [
  { key: "nombre", nombre: "Nombre de la cuenta", explicacion: "Descripción contable de la cuenta." },
  { key: "saldoInicial", nombre: "Saldo inicial", explicacion: "Saldo al comienzo del período." },
  { key: "debitos", nombre: "Débitos", explicacion: "Movimientos débito del período." },
  { key: "creditos", nombre: "Créditos", explicacion: "Movimientos crédito del período." },
  { key: "saldoFinal", nombre: "Saldo final único", explicacion: "Saldo final cuando viene en una sola columna." },
  { key: "saldoFinalDebito", nombre: "Saldo final débito", explicacion: "Parte débito cuando el saldo final viene separado." },
  { key: "saldoFinalCredito", nombre: "Saldo final crédito", explicacion: "Parte crédito cuando el saldo final viene separado." },
  { key: "tercero", nombre: "Tercero / NIT", explicacion: "Identificación del tercero para sumar por cuenta." },
];

/**
 * Personalización de la CARGA DE BALANCES de UN cliente, dentro de Configuración
 * › Perfiles de carga (ruta admin-only, permiso `perfiles_carga:administrar`):
 * perfiles de estructura guardados automáticamente al asociar una carga,
 * correcciones por cuenta memorizadas y preferencias por defecto (hoja, signo,
 * tercero) que el asistente aplica cuando identifica o se le asigna el cliente.
 *
 * `modo="ver"`: solo lectura (ojo en el listado). `modo="editar"`: permite
 * cambiar y borrar. Desde «ver» se puede pasar a editar con el botón del pie.
 */
export function AjustesCargaModal({
  cliente,
  modo = "editar",
  onPasarAEditar,
  onClose,
}: {
  cliente: { id: number; name: string; nit: string };
  modo?: "ver" | "editar";
  onPasarAEditar?: () => void;
  onClose: () => void;
}) {
  const soloLectura = modo === "ver";
  const [data, setData] = useState<PerfilesCargaState | null>(null);
  const [cargando, setCargando] = useState(true);
  const [perfilAbierto, setPerfilAbierto] = useState<number | null>(null);

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
    // React 19 reinicia el <form action> al terminar la acción: sin recargar, los
    // campos volverían a los valores VIEJOS aunque el guardado haya sido exitoso.
    if (saveState?.ok) void listarPerfilesCarga(cliente.id).then(setData);
  }, [saveState, cliente.id]);

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

  return (
    <Modal
      open
      onClose={onClose}
      title={`${soloLectura ? "Ver" : "Editar"} perfiles en memoria · ${cliente.name} · Balance`}
      size="4xl"
      footer={
        // No hay botón «Cerrar»: el modal ya se cierra con la X del header
        // (convención del proyecto en `src/components/modal.tsx` / CLAUDE.md).
        soloLectura ? (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[11.5px] text-ink-400">Solo lectura · no se guarda ningún cambio</span>
            {onPasarAEditar && (
              <button
                type="button"
                onClick={onPasarAEditar}
                className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
              >
                <Icon name="edit" size={13} />
                Editar
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {cargando ? (
        <p className="px-1 py-6 text-center text-[12.5px] text-ink-400"><EstadoProcesando>Cargando perfiles y preferencias</EstadoProcesando></p>
      ) : !data?.ok ? (
        <p className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12.5px] text-err-700">
          {data?.message ?? "No se pudo consultar la información."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {soloLectura && (
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
              Estás viendo la memoria de carga en solo lectura. Usa <strong>Editar</strong> si necesitas
              cambiar formatos, correcciones o preferencias.
            </p>
          )}
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
              <div className="flex flex-col gap-2">
                {data.perfiles.map((p, indice) => {
                  const abierto = perfilAbierto === p.id;
                  return (
                    <article
                      key={p.id}
                      className={`overflow-hidden rounded-lg border transition ${
                        abierto
                          ? "border-blue-300 bg-white shadow-sm"
                          : "border-ink-150 bg-white hover:border-ink-200"
                      }`}
                    >
                      <div className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => setPerfilAbierto((actual) => actual === p.id ? null : p.id)}
                          aria-expanded={abierto}
                          aria-controls={`perfil-carga-${p.id}`}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                            abierto ? "bg-blue-100 text-blue-600" : "bg-ink-50 text-ink-500"
                          }`}>
                            <Icon name={abierto ? "eye" : "doc"} size={15} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[12.5px] font-semibold text-ink-800">
                                Formato {indice + 1} · hoja «{p.hoja}»
                              </span>
                              <Chip
                                label={p.origen === "manual" ? "Revisado manualmente" : "Detectado por IA"}
                                tone={p.origen === "manual" ? "blue" : "ai"}
                              />
                            </span>
                            <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-500">
                              {p.resumenColumnas || "Solo contiene la configuración básica del formato."}
                            </span>
                            <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-400">
                              <span>{p.vecesUsado} {p.vecesUsado === 1 ? "uso" : "usos"}</span>
                              <span>Último uso: {fmtDate(p.ultimoUsoEn)}</span>
                              <span className="max-w-[280px] truncate font-mono" title={p.archivoEjemplo ?? undefined}>
                                Archivo: {p.archivoEjemplo ?? "sin ejemplo"}
                              </span>
                            </span>
                          </span>
                        </button>

                        <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => setPerfilAbierto((actual) => actual === p.id ? null : p.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <Icon name={abierto ? "eye-off" : "eye"} size={13} />
                            {abierto
                              ? "Ocultar estructura"
                              : soloLectura
                                ? "Ver estructura"
                                : "Ver y editar"}
                          </button>
                          {!soloLectura && (
                            <button
                              type="button"
                              disabled={eliminando}
                              onClick={() => eliminar(p.id)}
                              title="Eliminar perfil (la próxima carga volverá a detectar este formato)"
                              aria-label={`Eliminar formato ${indice + 1}`}
                              className="rounded-md border border-transparent p-1.5 text-ink-400 hover:border-err-200 hover:bg-err-50 hover:text-err-700 disabled:opacity-50"
                            >
                              {eliminandoObjetivo === `perfil:${p.id}` ? (
                                <EstadoProcesando etiqueta="Eliminando perfil" />
                              ) : (
                                <Icon name="trash" size={14} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {abierto && (
                        <div id={`perfil-carga-${p.id}`} className="border-t border-blue-100 bg-blue-50/20 px-3.5 py-3.5">
                          <PerfilCargaDetalle
                            key={`${p.id}:${p.actualizadoEn}:${modo}`}
                            perfil={p}
                            soloLectura={soloLectura}
                            onActualizado={async () => {
                              const siguiente = await listarPerfilesCarga(cliente.id);
                              setData(siguiente);
                            }}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
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
              {!soloLectura && (data.correcciones ?? []).length > 0 && (
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
                      {!soloLectura && <th className="px-2.5 py-1.5"></th>}
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
                        {!soloLectura && (
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
                        )}
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
            <form
              // Remonta el formulario cuando cambian las preferencias cargadas para
              // que los `defaultValue` reflejen lo último guardado.
              key={JSON.stringify(data.ajustes ?? null)}
              action={soloLectura ? undefined : saveAction}
              onSubmit={soloLectura ? (e) => e.preventDefault() : undefined}
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="clienteId" value={cliente.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Hoja preferida (nombre exacto en el Excel)</span>
                  <input
                    type="text"
                    name="hojaPreferida"
                    defaultValue={data.ajustes?.hojaPreferida ?? ""}
                    placeholder="Auto (el usuario elige / se detecta)"
                    readOnly={soloLectura}
                    disabled={soloLectura}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-600"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Convención del crédito</span>
                  <select
                    name="convencionCredito"
                    defaultValue={data.ajustes?.convencionCredito ?? ""}
                    disabled={soloLectura}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-600"
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
                    disabled={soloLectura}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-600"
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
                    disabled={soloLectura}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-600"
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
                    readOnly={soloLectura}
                    disabled={soloLectura}
                    placeholder="Particularidades del formato de este cliente para recordar en cada carga (p. ej. «duplica renglones UC/CU — se omite uno»)."
                    className="resize-y rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-700 outline-none focus:border-blue-400 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-600"
                  />
                  <span className="text-[10.5px] leading-relaxed text-ink-400">
                    Texto libre. Aparecen como aviso al cargar y revisar el balance de este cliente. No cambian el cálculo; sirven de memoria para el equipo.
                  </span>
                </label>
              </div>
              {!soloLectura && saveState?.message && !saveState.ok && (
                <p className="text-[12px] font-medium text-err-700">{saveState.message}</p>
              )}
              {!soloLectura && (
                <button
                  type="submit"
                  disabled={guardando}
                  className="w-fit rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
                >
                  {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar preferencias"}
                </button>
              )}
            </form>
          </section>
        </div>
      )}
    </Modal>
  );
}

function letraColumna(numero: number): string {
  if (!Number.isInteger(numero) || numero <= 0) return "—";
  let restante = numero;
  let etiqueta = "";
  while (restante > 0) {
    const modulo = (restante - 1) % 26;
    etiqueta = String.fromCharCode(65 + modulo) + etiqueta;
    restante = Math.floor((restante - 1) / 26);
  }
  return etiqueta;
}

function ubicacionColumna(numero: number): string {
  return numero > 0 ? `Columna ${letraColumna(numero)} · posición ${numero}` : "No se lee en este formato";
}

function reglaDetalleLegible(spec: SpecCarga): string {
  if (spec.reglaDetalle.tipo === "movimiento") {
    return "Todas las cuentas son de movimiento (archivo plano)";
  }
  if (spec.reglaDetalle.tipo === "columna") {
    return `Columna ${letraColumna(spec.reglaDetalle.columna ?? 0)} con el valor «${spec.reglaDetalle.valor || "sin definir"}»`;
  }
  return "Por jerarquía del código (las cuentas con hijos agrupan)";
}

function PerfilCargaDetalle({
  perfil,
  soloLectura = false,
  onActualizado,
}: {
  perfil: PerfilCargaResumen;
  soloLectura?: boolean;
  onActualizado: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [estructura, setEstructura] = useState<SpecCarga>(perfil.estructura);
  const [fragmentosTexto, setFragmentosTexto] = useState(
    perfil.estructura.columnas.codigoFragmentos.join(", "),
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const codigoFragmentado = estructura.columnas.codigoFragmentos.length > 0;
  const cambiarColumna = (key: ColumnaSimple, valor: number) => {
    const normalizado = Number.isInteger(valor) && valor >= 0 ? valor : 0;
    setEstructura((actual) => ({
      ...actual,
      columnas: { ...actual.columnas, [key]: normalizado },
    }));
  };

  const cambiarFragmentos = (texto: string) => {
    setFragmentosTexto(texto);
    const columnas = [
      ...new Set(
        texto
          .split(/[\s,;]+/)
          .map(Number)
          .filter((valor) => Number.isInteger(valor) && valor > 0),
      ),
    ];
    setEstructura((actual) => ({
      ...actual,
      columnas: {
        ...actual.columnas,
        codigo: 0,
        codigoFragmentos: columnas,
      },
    }));
  };

  const cancelar = () => {
    setEstructura(perfil.estructura);
    setFragmentosTexto(perfil.estructura.columnas.codigoFragmentos.join(", "));
    setError(null);
    setEditando(false);
  };

  const guardar = () => {
    setError(null);
    startGuardar(async () => {
      const respuesta = await actualizarPerfilCarga({
        id: perfil.id,
        actualizadoEn: perfil.actualizadoEn,
        estructura,
      });
      if (!respuesta.ok) {
        setError(respuesta.message ?? "No se pudo actualizar el perfil.");
        notifyError(respuesta.message ?? "No se pudo actualizar el perfil.");
        return;
      }
      notifySuccess(respuesta.message ?? "Perfil actualizado.");
      setEditando(false);
      await onActualizado();
    });
  };

  const fuenteCodigo = codigoFragmentado
    ? perfil.estructura.columnas.codigoFragmentos.map((numero) => `Columna ${letraColumna(numero)}`).join(" + ")
    : ubicacionColumna(perfil.estructura.columnas.codigo);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-blue-700">
            Estructura completa del formato
          </div>
          <h4 className="mt-0.5 font-serif text-lg text-ink-900">Así leerá la plataforma este archivo</h4>
          <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-500">
            Cada fila muestra el dato contable y la columna exacta que se tomará. “No se lee” significa que
            este formato no trae ese dato y la plataforma aplicará su regla de cálculo.
          </p>
        </div>
        {!soloLectura && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600"
          >
            <Icon name="settings" size={13} />
            Editar estructura
          </button>
        )}
      </div>

      {!editando ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Hoja del archivo</div>
              <div className="mt-1 break-words text-[12.5px] font-semibold text-ink-800">{perfil.estructura.hoja}</div>
            </div>
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Fila del encabezado</div>
              <div className="mt-1 text-[12.5px] font-semibold tabular-nums text-ink-800">
                Fila {perfil.estructura.filaEncabezado}
              </div>
              <div className="mt-0.5 text-[10.5px] text-ink-400">Donde están los títulos de columna</div>
            </div>
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Inicio de las cuentas</div>
              <div className="mt-1 text-[12.5px] font-semibold tabular-nums text-ink-800">
                Fila {perfil.estructura.primeraFilaDatos}
              </div>
              <div className="mt-0.5 text-[10.5px] text-ink-400">Primera fila con datos contables</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-ink-150 bg-white">
            <table className="w-full min-w-[650px] text-[11.5px]">
              <thead className="bg-ink-50 text-left text-ink-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Dato que se busca</th>
                  <th className="px-3 py-2 font-semibold">Ubicación guardada</th>
                  <th className="px-3 py-2 font-semibold">Uso dentro del balance</th>
                  <th className="px-3 py-2 text-center font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-ink-100">
                  <td className="px-3 py-2 font-semibold text-ink-700">Código de cuenta</td>
                  <td className="px-3 py-2 font-mono text-[10.5px] text-ink-700">{fuenteCodigo}</td>
                  <td className="px-3 py-2 text-ink-500">
                    {codigoFragmentado
                      ? "Concatena los fragmentos en el orden indicado para formar el PUC."
                      : "Identifica la cuenta PUC en una sola columna."}
                  </td>
                  <td className="px-3 py-2 text-center"><Chip label="Obligatoria" tone="blue" /></td>
                </tr>
                {COLUMNAS_PERFIL.map((columna) => {
                  const numero = perfil.estructura.columnas[columna.key];
                  const usada = numero > 0;
                  return (
                    <tr key={columna.key} className="border-t border-ink-100">
                      <td className="px-3 py-2 font-medium text-ink-700">{columna.nombre}</td>
                      <td className={`px-3 py-2 font-mono text-[10.5px] ${usada ? "text-ink-700" : "text-ink-400"}`}>
                        {ubicacionColumna(numero)}
                      </td>
                      <td className="px-3 py-2 text-ink-500">{columna.explicacion}</td>
                      <td className="px-3 py-2 text-center">
                        <Chip label={usada ? "Se lee" : "No se lee"} tone={usada ? "ok" : "ink"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Signo de créditos</div>
              <div className="mt-1 text-[11.5px] font-semibold text-ink-700">
                {perfil.estructura.signoCredito === "magnitud"
                  ? "Magnitud · valores positivos"
                  : "Firmado · créditos negativos"}
              </div>
            </div>
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Cuentas de movimiento</div>
              <div className="mt-1 text-[11.5px] font-semibold leading-relaxed text-ink-700">
                {reglaDetalleLegible(perfil.estructura)}
              </div>
            </div>
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Consolidación por tercero</div>
              <div className="mt-1 text-[11.5px] font-semibold text-ink-700">
                {perfil.estructura.agregarPorTercero ? "Sí · suma terceros por cuenta" : "No · conserva cada fila"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-2 text-[10.5px] text-ink-400">
            <span>Identificador del formato: <span className="font-mono">{perfil.huella}</span></span>
            <span>Actualizado: {fmtDate(perfil.actualizadoEn)}</span>
            <span>Los cambios aplican a cargas futuras; no modifican balances ya cargados.</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-white p-3.5">
          <div className="flex items-start gap-2 rounded-md border border-warn-200 bg-warn-100/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-warn-700">
            <Icon name="info" size={14} className="mt-0.5 shrink-0" />
            <p>
              Estás cambiando cómo se interpretarán las <span className="font-semibold">próximas cargas</span> de
              este mismo formato. Los balances ya cargados no se alteran. Usa 0 únicamente cuando el archivo no
              trae una columna.
            </p>
          </div>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-[12px] font-semibold text-ink-800">1. Ubicación de la tabla</legend>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Nombre exacto de la hoja</span>
              <input
                type="text"
                value={estructura.hoja}
                maxLength={120}
                onChange={(evento) => setEstructura((actual) => ({ ...actual, hoja: evento.target.value }))}
                className="rounded-md border border-ink-200 px-2.5 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Fila del encabezado</span>
              <input
                type="number"
                min={1}
                value={estructura.filaEncabezado}
                onChange={(evento) => setEstructura((actual) => ({
                  ...actual,
                  filaEncabezado: Number(evento.target.value) || 0,
                }))}
                className="rounded-md border border-ink-200 px-2.5 py-2 text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Primera fila con cuentas</span>
              <input
                type="number"
                min={2}
                value={estructura.primeraFilaDatos}
                onChange={(evento) => setEstructura((actual) => ({
                  ...actual,
                  primeraFilaDatos: Number(evento.target.value) || 0,
                }))}
                className="rounded-md border border-ink-200 px-2.5 py-2 text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400"
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-ink-100 pt-3">
            <legend className="pr-2 text-[12px] font-semibold text-ink-800">2. Mapa completo de columnas</legend>

            <div className="grid grid-cols-1 gap-3 rounded-md border border-blue-100 bg-blue-50/40 p-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">Cómo viene el código de cuenta</span>
                <select
                  value={codigoFragmentado ? "fragmentado" : "unico"}
                  onChange={(evento) => {
                    if (evento.target.value === "fragmentado") {
                      setFragmentosTexto(estructura.columnas.codigoFragmentos.join(", ") || "1, 2");
                      setEstructura((actual) => ({
                        ...actual,
                        columnas: {
                          ...actual.columnas,
                          codigo: 0,
                          codigoFragmentos:
                            actual.columnas.codigoFragmentos.length > 0
                              ? actual.columnas.codigoFragmentos
                              : [1, 2],
                        },
                      }));
                    } else {
                      setFragmentosTexto("");
                      setEstructura((actual) => ({
                        ...actual,
                        columnas: {
                          ...actual.columnas,
                          codigo: actual.columnas.codigo > 0 ? actual.columnas.codigo : 1,
                          codigoFragmentos: [],
                        },
                      }));
                    }
                  }}
                  className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                >
                  <option value="unico">Una sola columna con el código completo</option>
                  <option value="fragmentado">Varias columnas que se concatenan</option>
                </select>
              </label>

              {codigoFragmentado ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Columnas fragmentadas, en orden</span>
                  <input
                    type="text"
                    value={fragmentosTexto}
                    onChange={(evento) => cambiarFragmentos(evento.target.value)}
                    placeholder="Ej.: 1, 2, 3, 4"
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                  />
                  <span className="text-[10.5px] text-ink-400">
                    Resultado actual: {estructura.columnas.codigoFragmentos.map(letraColumna).join(" + ") || "sin columnas"}
                  </span>
                </label>
              ) : (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Número de columna del código</span>
                  <input
                    type="number"
                    min={1}
                    value={estructura.columnas.codigo}
                    onChange={(evento) => cambiarColumna("codigo", Number(evento.target.value))}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400"
                  />
                  <span className="text-[10.5px] text-ink-400">{ubicacionColumna(estructura.columnas.codigo)}</span>
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {COLUMNAS_PERFIL.map((columna) => {
                const numero = estructura.columnas[columna.key];
                return (
                  <label key={columna.key} className="flex flex-col gap-1 rounded-md border border-ink-150 p-2.5">
                    <span className="text-[11px] font-semibold text-ink-700">{columna.nombre}</span>
                    <span className="min-h-8 text-[10.5px] leading-relaxed text-ink-400">{columna.explicacion}</span>
                    <input
                      type="number"
                      min={0}
                      value={numero}
                      onChange={(evento) => cambiarColumna(columna.key, Number(evento.target.value))}
                      aria-label={`Número de columna para ${columna.nombre}`}
                      className="rounded-md border border-ink-200 px-2 py-1.5 text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400"
                    />
                    <span className={`text-[10px] ${numero > 0 ? "font-medium text-blue-600" : "text-ink-400"}`}>
                      {ubicacionColumna(numero)}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 border-t border-ink-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-2 pr-2 text-[12px] font-semibold text-ink-800">3. Reglas de interpretación</legend>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Convención de créditos</span>
              <select
                value={estructura.signoCredito}
                onChange={(evento) => setEstructura((actual) => ({
                  ...actual,
                  signoCredito: evento.target.value === "magnitud" ? "magnitud" : "firmado",
                }))}
                className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400"
              >
                <option value="magnitud">Magnitud · débitos y créditos positivos</option>
                <option value="firmado">Firmado · créditos con signo negativo</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Cómo reconocer cuentas de movimiento</span>
              <select
                value={estructura.reglaDetalle.tipo}
                onChange={(evento) => {
                  const tipo = evento.target.value;
                  setEstructura((actual) => ({
                    ...actual,
                    reglaDetalle:
                      tipo === "columna"
                        ? { tipo: "columna", columna: actual.reglaDetalle.columna ?? 1, valor: actual.reglaDetalle.valor ?? "" }
                        : tipo === "movimiento"
                          ? { tipo: "movimiento", columna: null, valor: null }
                          : { tipo: "prefijo", columna: null, valor: null },
                  }));
                }}
                className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400"
              >
                <option value="prefijo">Por jerarquía del código</option>
                <option value="columna">Por una columna marcadora</option>
                <option value="movimiento">Todas son cuentas de movimiento</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-md border border-ink-150 px-3 py-2.5">
              <input
                type="checkbox"
                checked={estructura.agregarPorTercero}
                onChange={(evento) => setEstructura((actual) => ({
                  ...actual,
                  agregarPorTercero: evento.target.checked,
                }))}
              />
              <span>
                <span className="block text-[11px] font-semibold text-ink-700">Sumar por tercero</span>
                <span className="block text-[10.5px] text-ink-400">Consolida las filas por código de cuenta</span>
              </span>
            </label>

            {estructura.reglaDetalle.tipo === "columna" && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Número de columna marcadora</span>
                  <input
                    type="number"
                    min={1}
                    value={estructura.reglaDetalle.columna ?? 0}
                    onChange={(evento) => setEstructura((actual) => ({
                      ...actual,
                      reglaDetalle: {
                        ...actual.reglaDetalle,
                        columna: Number(evento.target.value) || 0,
                      },
                    }))}
                    className="rounded-md border border-ink-200 px-2.5 py-2 text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Valor que significa “movimiento”</span>
                  <input
                    type="text"
                    value={estructura.reglaDetalle.valor ?? ""}
                    onChange={(evento) => setEstructura((actual) => ({
                      ...actual,
                      reglaDetalle: {
                        ...actual.reglaDetalle,
                        valor: evento.target.value,
                      },
                    }))}
                    placeholder="Ej.: I, 1 o Movimiento"
                    className="rounded-md border border-ink-200 px-2.5 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                  />
                </label>
              </>
            )}
          </fieldset>

          {error && (
            <p role="alert" className="rounded-md border border-err-200 bg-err-50 px-3 py-2 text-[11.5px] font-medium text-err-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-3">
            <button
              type="button"
              disabled={guardando}
              onClick={cancelar}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={guardar}
              className="rounded-md bg-navy-700 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
            >
              {guardando ? <EstadoProcesando>Guardando perfil</EstadoProcesando> : "Guardar estructura del perfil"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
