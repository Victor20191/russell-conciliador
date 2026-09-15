"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { notifyActionState } from "@/lib/client-notifications";
import {
  CATEGORIAS,
  ENTORNOS,
  proveedorPorClave,
  proveedoresDeCategoria,
  valorPorDefecto,
  type CampoDefinicion,
  type ProveedorDefinicion,
} from "@/lib/conexiones/tipos";
import {
  actualizarConexion,
  crearConexion,
  type ConexionActionState,
} from "@/app/actions/conexiones";

export type ConexionVista = {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  proveedor: string;
  entorno: string;
  activa: boolean;
  configuracion: Record<string, unknown>;
  credencialesDefinidas: string[];
  ultimaPruebaEn: Date | null;
  ultimaPruebaOk: boolean | null;
  ultimaPruebaMensaje: string | null;
  ultimaPruebaMs: number | null;
  ultimoUsoEn: Date | null;
  ultimaEjecucionEstado: string | null;
  ultimaEjecucionMensaje: string | null;
  updatedAt: Date;
};

type ValorCampo = string | boolean;

function porDefectos(proveedor: ProveedorDefinicion | null): Record<string, ValorCampo> {
  const salida: Record<string, ValorCampo> = {};
  if (!proveedor) return salida;
  for (const campo of proveedor.camposConfiguracion) {
    salida[campo.clave] = valorPorDefecto(campo);
  }
  return salida;
}

function valoresIniciales(
  conexion: ConexionVista | undefined,
  proveedor: ProveedorDefinicion | null,
): Record<string, ValorCampo> {
  const base = porDefectos(proveedor);
  if (!conexion || !proveedor) return base;
  for (const campo of proveedor.camposConfiguracion) {
    const guardado = conexion.configuracion[campo.clave];
    if (guardado === undefined || guardado === null) continue;
    if (campo.tipo === "booleano") base[campo.clave] = guardado === true || guardado === "true";
    else base[campo.clave] = String(guardado);
  }
  return base;
}

function slug(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 60);
}

function firstError(state: ConexionActionState | undefined): string | undefined {
  if (state?.message) return state.message;
  if (!state?.errors) return undefined;
  return Object.values(state.errors).flat().filter(Boolean)[0];
}

function CampoFormulario({
  campo,
  nombre,
  valor,
  onChange,
  error,
}: {
  campo: CampoDefinicion;
  nombre: string;
  valor: ValorCampo;
  onChange: (valor: ValorCampo) => void;
  error?: string[];
}) {
  if (campo.tipo === "booleano") {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-[13px] text-ink-800">
          <input
            type="checkbox"
            name={nombre}
            checked={valor === true}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
          />
          {campo.label}
        </span>
        {campo.ayuda && <span className="text-[11px] text-ink-500">{campo.ayuda}</span>}
        {error?.[0] && <span className="text-[11px] text-err-700">{error[0]}</span>}
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink-700">
        {campo.label}
        {campo.requerido && <span className="ml-0.5 text-err-700">*</span>}
      </span>
      <input
        type={campo.tipo === "numero" ? "number" : "text"}
        name={nombre}
        value={String(valor ?? "")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={campo.placeholder}
        className="rounded-md border border-ink-200 px-3 py-2 font-mono text-[13px]"
      />
      {campo.ayuda && <span className="text-[11px] text-ink-500">{campo.ayuda}</span>}
      {error?.[0] && <span className="text-[11px] text-err-700">{error[0]}</span>}
    </label>
  );
}

export function ConexionModal({
  conexion,
  onClose,
}: {
  conexion?: ConexionVista;
  onClose: () => void;
}) {
  const editando = conexion != null;
  const action = editando ? actualizarConexion : crearConexion;
  const [state, formAction, pending] = useActionState(action, undefined);

  // El "tipo de conexión" es el proveedor: la categoría se deriva de él, así el
  // formulario se adapta automáticamente a los requisitos del servicio elegido.
  const [proveedorClave, setProveedorClave] = useState(
    conexion?.proveedor ?? proveedoresDeCategoria("ALMACENAMIENTO")[0]?.clave ?? "",
  );
  const proveedor = proveedorPorClave(proveedorClave);
  const categoria = proveedor?.categoria ?? "ALMACENAMIENTO";
  const [valoresConfig, setValoresConfig] = useState<Record<string, ValorCampo>>(() =>
    valoresIniciales(conexion, proveedorPorClave(proveedorClave)),
  );
  const [valoresCred, setValoresCred] = useState<Record<string, string>>({});
  const [codigo, setCodigo] = useState(conexion?.codigo ?? "");
  const [codigoTocado, setCodigoTocado] = useState(editando);
  const [nombre, setNombre] = useState(conexion?.nombre ?? "");

  const formId = editando ? `editar-conexion-${conexion.id}` : "crear-conexion";

  useEffect(() => {
    notifyActionState(state, {
      success: editando ? "Conexión actualizada." : "Conexión creada.",
      error: "No se pudo guardar la conexión.",
    });
    if (state?.ok) onClose();
  }, [state, onClose, editando]);

  function cambiarProveedor(clave: string) {
    setProveedorClave(clave);
    setValoresConfig(porDefectos(proveedorPorClave(clave)));
    setValoresCred({});
  }

  function cambiarNombre(valor: string) {
    setNombre(valor);
    if (!codigoTocado) setCodigo(slug(valor));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editando ? "Editar conexión" : "Crear conexión"}
      size="2xl"
      footer={
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
        </button>
      }
    >
      <form id={formId} action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {editando && <input type="hidden" name="id" value={conexion.id} />}
        <input type="hidden" name="categoria" value={categoria} />

        <div className="sm:col-span-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-700">
              Tipo de conexión <span className="text-err-700">*</span>
            </span>
            <select
              name="proveedor"
              value={proveedorClave}
              onChange={(event) => cambiarProveedor(event.target.value)}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px]"
            >
              {CATEGORIAS.map((cat) => (
                <optgroup key={cat.clave} label={cat.label}>
                  {proveedoresDeCategoria(cat.clave).map((p) => (
                    <option key={p.clave} value={p.clave}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="text-[11px] text-ink-500">
              Selecciona el servicio que quieres conectar. El formulario se adapta a sus requisitos.
            </span>
            {proveedor && <span className="text-[11px] text-ink-500">{proveedor.descripcion}</span>}
            {state?.errors?.proveedor?.[0] && (
              <span className="text-[11px] text-err-700">{state.errors.proveedor[0]}</span>
            )}
            {state?.errors?.categoria?.[0] && (
              <span className="text-[11px] text-err-700">{state.errors.categoria[0]}</span>
            )}
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-700">Nombre</span>
          <input
            name="nombre"
            value={nombre}
            onChange={(event) => cambiarNombre(event.target.value)}
            placeholder="Facturas Zarazal"
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
          {state?.errors?.nombre?.[0] && (
            <span className="text-[11px] text-err-700">{state.errors.nombre[0]}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-700">Identificador</span>
          <input
            name="codigo"
            value={codigo}
            onChange={(event) => {
              setCodigoTocado(true);
              setCodigo(event.target.value);
            }}
            placeholder="facturas_zarazal"
            className="rounded-md border border-ink-200 px-3 py-2 font-mono text-[13px]"
          />
          <span className="text-[11px] text-ink-500">
            Único, en minúsculas. Se usa para referenciar la conexión.
          </span>
          {state?.errors?.codigo?.[0] && (
            <span className="text-[11px] text-err-700">{state.errors.codigo[0]}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[12px] font-medium text-ink-700">Descripción</span>
          <textarea
            name="descripcion"
            defaultValue={conexion?.descripcion ?? ""}
            rows={2}
            placeholder="Para qué se usa esta conexión en la operación."
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
          {state?.errors?.descripcion?.[0] && (
            <span className="text-[11px] text-err-700">{state.errors.descripcion[0]}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-700">Entorno</span>
          <select
            name="entorno"
            defaultValue={conexion?.entorno ?? "PRODUCCION"}
            className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px]"
          >
            {ENTORNOS.map((e) => (
              <option key={e.clave} value={e.clave}>
                {e.label}
              </option>
            ))}
          </select>
          {state?.errors?.entorno?.[0] && (
            <span className="text-[11px] text-err-700">{state.errors.entorno[0]}</span>
          )}
        </label>

        <label className="mt-6 flex items-center gap-2 text-[13px] text-ink-800">
          <input
            type="checkbox"
            name="activa"
            defaultChecked={conexion?.activa ?? true}
            className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
          />
          Conexión activa
        </label>

        {proveedor && proveedor.camposConfiguracion.length > 0 && (
          <div className="sm:col-span-2">
            <div className="mb-2 border-t border-ink-100 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Configuración
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {proveedor.camposConfiguracion.map((campo) => (
                <CampoFormulario
                  key={campo.clave}
                  campo={campo}
                  nombre={`config_${campo.clave}`}
                  valor={valoresConfig[campo.clave] ?? valorPorDefecto(campo)}
                  onChange={(valor) =>
                    setValoresConfig((previos) => ({ ...previos, [campo.clave]: valor }))
                  }
                  error={state?.errors?.[`config_${campo.clave}`]}
                />
              ))}
            </div>
          </div>
        )}

        {proveedor && proveedor.camposCredenciales.length > 0 && (
          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center gap-1.5 border-t border-ink-100 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              <Icon name="eye-off" size={12} />
              Credenciales (cifradas)
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {proveedor.camposCredenciales.map((campo) => {
                const definida = conexion?.credencialesDefinidas.includes(campo.clave) ?? false;
                return (
                  <label key={campo.clave} className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-ink-700">
                      {campo.label}
                      {campo.requerido && !definida && <span className="ml-0.5 text-err-700">*</span>}
                      {definida && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-ok-100 px-2 py-0.5 text-[10px] font-semibold text-ok-700">
                          Definida
                        </span>
                      )}
                    </span>
                    <input
                      type="password"
                      name={`cred_${campo.clave}`}
                      value={valoresCred[campo.clave] ?? ""}
                      onChange={(event) =>
                        setValoresCred((previos) => ({ ...previos, [campo.clave]: event.target.value }))
                      }
                      placeholder={definida ? "•••••• (conservar actual)" : campo.placeholder}
                      autoComplete="new-password"
                      className="rounded-md border border-ink-200 px-3 py-2 font-mono text-[13px]"
                    />
                    {definida && (
                      <span className="text-[11px] text-ink-500">
                        Déjalo vacío para conservar el secreto actual.
                      </span>
                    )}
                    {state?.errors?.[`cred_${campo.clave}`]?.[0] && (
                      <span className="text-[11px] text-err-700">
                        {state.errors[`cred_${campo.clave}`][0]}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {firstError(state) && (
          <p className="text-[12px] text-err-700 sm:col-span-2">{firstError(state)}</p>
        )}
      </form>
    </Modal>
  );
}
