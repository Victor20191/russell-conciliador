"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/ui";
import { fmt } from "@/lib/format";
import {
  leerBalance,
  reprocesarBalanceConSpec,
  guardarPerfilDesdeEditor,
  type LeerBalanceState,
  type SugerenciaBalance,
} from "@/app/actions/balance";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { leerHojasParaPreview, columnaLetra, type CeldaCruda, type HojaPreview } from "@/lib/balance/extraccion/hojas-cliente";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";
import { PromptClientePerfil } from "@/app/(app)/balance/prompt-cliente-perfil";
import type { ImportBalanceState } from "@/lib/import/balance";
import type { ConfiguracionIABalanceUI, ProveedorIABalance } from "@/lib/ia/proveedor-balance";

/** Extensiones de Excel que pueden traer varias hojas (inspeccionables en cliente). */
const esExcel = (name: string) => /\.(xlsx|xlsm)$/i.test(name);

/**
 * Umbral para NO inspeccionar el Excel en el navegador. Un xlsx comprime ~6×, así que un
 * archivo de ~500 KB en disco ya trae miles de filas; parsear el libro COMPLETO en el hilo
 * principal (`leerHojasParaPreview`) congela la página. Por encima de esto se omite la vista
 * previa de hojas: el servidor lee el archivo y la IA/perfil elige la hoja (los balances
 * grandes suelen ser de una sola hoja, así que no se pierde nada útil).
 */
const MAX_PREVIEW_BYTES = 500 * 1024;

export type ClienteOpcion = { id: number; name: string; nit: string };

type Excepcion = NonNullable<ImportBalanceState["excepciones"]>[number];

export function CargarBalanceButton({
  clients,
  configuracionIA,
}: {
  clients: ClienteOpcion[];
  configuracionIA: ConfiguracionIABalanceUI | null;
}) {
  const [open, setOpen] = useState(false);
  // `instancia` reinicia el asistente por completo (incluye los useActionState).
  const [instancia, setInstancia] = useState(0);
  const reiniciar = () => setInstancia((n) => n + 1);
  return (
    <>
      <button
        onClick={() => { reiniciar(); setOpen(true); }}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
      >
        <Icon name="upload" size={14} /> Cargar balance
      </button>
      {open && (
        <CargarBalanceModal
          key={instancia}
          clients={clients}
          configuracionIA={configuracionIA}
          onClose={() => setOpen(false)}
          onReiniciar={reiniciar}
        />
      )}
    </>
  );
}

function CargarBalanceModal({
  clients,
  configuracionIA,
  onClose,
  onReiniciar,
}: {
  clients: ClienteOpcion[];
  configuracionIA: ConfiguracionIABalanceUI | null;
  onClose: () => void;
  onReiniciar: () => void;
}) {
  const [leerState, leerAction, leyendo] = useActionState<LeerBalanceState, FormData>(leerBalance, {});
  const [fileName, setFileName] = useState("");
  // El File original se retiene para el EDITOR DE ESTRUCTURA (reproceso sin IA):
  // el input se desmonta al pasar a la fase de revisión.
  const [archivoFile, setArchivoFile] = useState<File | null>(null);
  // Sugerencia REPROCESADA con el editor (pisa a la de la lectura inicial).
  const [sugLocal, setSugLocal] = useState<SugerenciaBalance | null>(null);
  const [reprocesando, startReproceso] = useTransition();
  // Hojas detectadas en el cliente (solo Excel con 2+ hojas) y la elegida por el
  // usuario. Mientras `hojas` esté presente, la elección es obligatoria.
  const [hojas, setHojas] = useState<HojaPreview[] | null>(null);
  const [hojaElegida, setHojaElegida] = useState<string | null>(null);
  const [inspeccionando, setInspeccionando] = useState(false);
  // Excel demasiado grande para inspeccionar en el navegador sin congelar: se omite la vista
  // previa de hojas y lo lee el servidor.
  const [archivoGrande, setArchivoGrande] = useState(false);
  // Identifica el análisis en curso: si el usuario cambia de archivo mientras se
  // lee el anterior, descartamos el resultado tardío (no pisa el estado nuevo).
  const seqRef = useRef(0);

  // Al elegir archivo: si es Excel moderno, leemos sus hojas en el navegador
  // para que el usuario elija cuál cargar cuando haya 2+. Cualquier
  // fallo degrada al flujo normal (la IA elige) sin bloquear.
  async function onArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    const seq = ++seqRef.current;
    setFileName(file?.name ?? "");
    setArchivoFile(file);
    setHojas(null);
    setHojaElegida(null);
    setArchivoGrande(false);
    if (!file || !esExcel(file.name)) {
      setInspeccionando(false);
      return;
    }
    if (file.size > MAX_PREVIEW_BYTES) {
      // Grande: NO se parsea en el navegador (congelaría). Lo lee el servidor.
      setInspeccionando(false);
      setArchivoGrande(true);
      return;
    }
    setInspeccionando(true);
    try {
      const detectadas = await leerHojasParaPreview(file);
      if (seqRef.current !== seq) return; // otro archivo se eligió mientras tanto
      // Con 2+ hojas el usuario elige; con una sola la fijamos directamente. En
      // ambos casos la IA recibe SIEMPRE una hoja ya validada aquí, nunca asume.
      if (detectadas.length >= 2) setHojas(detectadas);
      else if (detectadas.length === 1) setHojaElegida(detectadas[0].nombre);
    } catch {
      /* archivo ilegible en el cliente: seguimos el flujo normal (la IA lee el archivo) */
    } finally {
      if (seqRef.current === seq) setInspeccionando(false);
    }
  }

  // Reproceso determinista (editor de estructura / preferencias del cliente):
  // reenvía el archivo con el spec ajustado; la sugerencia nueva pisa la anterior.
  const reprocesar = (spec: SpecCarga, loteIdAnterior: string, proveedorIA?: ProveedorIABalance) => {
    if (!archivoFile) return;
    startReproceso(async () => {
      try { await archivoFile.arrayBuffer(); } catch { notifyError("No pudimos leer el archivo. Suele pasar cuando está ABIERTO en Excel o sincronizándose en OneDrive: ciérralo e intenta de nuevo."); return; }
      const fd = new FormData();
      fd.set("archivo", archivoFile);
      fd.set("spec", JSON.stringify(spec));
      fd.set("loteIdAnterior", loteIdAnterior);
      if (proveedorIA) fd.set("modeloIA", proveedorIA);
      const res = await reprocesarBalanceConSpec({}, fd);
      if (res.ok && res.sugerencia) {
        setSugLocal(res.sugerencia);
        notifySuccess("Archivo reprocesado con la estructura ajustada (sin IA).");
      } else {
        notifyError(res.message ?? "No se pudo reprocesar el archivo.");
      }
    });
  };

  // Antes de subir: intenta LEER el archivo en el navegador (lo mismo que hará la subida).
  // Si está ABIERTO en Excel o sincronizándose en OneDrive, la lectura falla y el POST daría
  // un críptico "Failed to fetch" que rompe la página. Avisamos claro y NO enviamos.
  const onLeerSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const archivo = formData.get("archivo");
    if (archivo instanceof File && archivo.size > 0) {
      try {
        await archivo.arrayBuffer();
      } catch {
        notifyError("No pudimos leer el archivo. Suele pasar cuando está ABIERTO en Excel o sincronizándose en OneDrive: ciérralo (y espera a que OneDrive termine) y vuelve a intentar.");
        return;
      }
    }
    startTransition(() => leerAction(formData));
  };

  const sug = sugLocal ?? leerState?.sugerencia;
  const fase: "revisar" | "archivo" = sug ? "revisar" : "archivo";

  // Con Excel multi-hoja, no se puede leer hasta elegir una hoja.
  const requiereHoja = !!hojas && hojas.length >= 2;
  const leerDeshabilitado = leyendo || inspeccionando || !fileName || clients.length === 0 || (requiereHoja && !hojaElegida);

  const footer =
    fase === "revisar" ? (
      <div className="flex w-full items-center gap-2">
        <button type="button" onClick={onReiniciar} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">
          ← Otro archivo
        </button>
        {sug && (
          <Link
            href={`/balance/borradores/${sug.payload.loteId}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"
          >
            <Icon name="doc" size={13} /> Ir al borrador
          </Link>
        )}
      </div>
    ) : (
      <button
        type="submit"
        form="leer-form"
        disabled={leerDeshabilitado}
        className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
      >
        {leyendo
          ? "Leyendo…"
          : inspeccionando
            ? "Analizando hojas…"
            : requiereHoja && hojaElegida
              ? `Leer hoja «${recortar(hojaElegida, 22)}»`
              : "Leer archivo"}
      </button>
    );

  return (
    <Modal open onClose={onClose} title="Cargar balance de comprobación" size="2xl" footer={footer}>
      {fase === "revisar" && sug ? (
        <FormRevisar
          key={sug.payload.loteId}
          sug={sug}
          clients={clients}
          excepciones={leerState?.excepciones ?? []}
          archivoFile={archivoFile}
          reprocesando={reprocesando}
          onReprocesar={reprocesar}
        />
      ) : (
        <form id="leer-form" onSubmit={onLeerSubmit} className="flex flex-col gap-3.5">
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Sube el balance en <span className="font-semibold">Excel (.xlsx/.xlsm), CSV, TXT (plano), JSON o PDF</span>. La plataforma
            lo lee (con el <span className="font-semibold">perfil guardado del cliente</span> si el formato ya se conoce, o
            con IA), identifica la estructura y te <span className="font-semibold">sugiere</span> los datos (cliente,
            período, saldos). Al terminar la lectura crea un borrador para que lo revises antes de cargarlo como balance oficial.
          </p>

          {configuracionIA && (
            <div className="rounded-md border border-ai-100 bg-ai-100/30 px-3 py-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-ink-700">Proveedor de IA para esta carga</span>
                <select
                  name="modeloIA"
                  defaultValue={configuracionIA.predeterminado}
                  className="rounded-md border border-ai-100 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-ai-700"
                >
                  {configuracionIA.opciones.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {clients.length === 0 ? (
            <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5 text-[12.5px] text-warn-700">
              No tienes clientes asignados con alcance para cargar balances.
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-ink-600">Archivo (Excel, CSV, TXT, JSON o PDF)</span>
                <input
                  type="file"
                  name="archivo"
                  accept=".xlsx,.xlsm,.csv,.txt,.json,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  onChange={onArchivoChange}
                  className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white"
                />
              </label>

              {/* Hoja elegida en Excel multi-hoja; vacío en archivos de una sola hoja, CSV o PDF. */}
              <input type="hidden" name="hoja" value={hojaElegida ?? ""} />

              {inspeccionando && <p className="text-[12px] text-ink-500">Analizando las hojas del archivo…</p>}
              {archivoGrande && (
                <p className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12px] font-medium text-err-700">
                  <span className="font-semibold">⚠️ ¡Archivo muy pesado!</span> Su carga toma más tiempo de lo normal — no cierres esta operación mientras carga.
                </p>
              )}
              {requiereHoja && hojas && <SelectorHojas hojas={hojas} elegida={hojaElegida} onElegir={setHojaElegida} />}
            </>
          )}

          {leerState?.message && <p className="text-[12px] font-medium text-err-700">{leerState.message}</p>}
          {leerState?.errores && leerState.errores.length > 0 && <ErroresTabla errores={leerState.errores} />}
          {leerState?.excepciones && leerState.excepciones.length > 0 && <ExcepcionesTabla excepciones={leerState.excepciones} />}
        </form>
      )}
    </Modal>
  );
}

/** Chip con el ORIGEN de la estructura aplicada en la lectura. */
function OrigenChip({
  origen,
  proveedor,
}: {
  origen: SugerenciaBalance["payload"]["origenExtraccion"];
  proveedor: SugerenciaBalance["render"]["proveedorIA"];
}) {
  const map = {
    perfil: { label: "Perfil guardado · sin IA", tone: "ok" as const },
    ia: {
      label:
        proveedor === "gemini"
          ? "Estructura detectada · Google"
          : "Estructura detectada · Anthropic",
      tone: "ai" as const,
    },
    plantilla: { label: "Plantilla limpia · sin IA", tone: "ink" as const },
    manual: { label: "Estructura ajustada a mano", tone: "blue" as const },
  };
  const m = map[origen] ?? map.ia;
  return <Chip label={m.label} tone={m.tone} />;
}

function FormRevisar({
  sug,
  clients,
  excepciones,
  archivoFile,
  reprocesando,
  onReprocesar,
}: {
  sug: SugerenciaBalance;
  clients: ClienteOpcion[];
  excepciones: Excepcion[];
  archivoFile: File | null;
  reprocesando: boolean;
  onReprocesar: (spec: SpecCarga, loteIdAnterior: string, proveedorIA?: ProveedorIABalance) => void;
}) {
  // El editor de estructura solo aplica si aún tenemos el File (reproceso) y la
  // lectura produjo un spec (tabular). PDF/plantilla no traen spec.
  const puedeEditar = !!archivoFile && !!sug.render.spec;

  // Guardar el spec ajustado como PERFIL del cliente SIN reprocesar (para futuras cargas).
  // Si no hay cliente (ni por NIT ni en el lote), se pide elegirlo para concluir el guardado.
  const [guardandoPerfil, startGuardarPerfil] = useTransition();
  const [promptPerfilSpec, setPromptPerfilSpec] = useState<SpecCarga | null>(null);
  const onGuardarPerfil = (spec: SpecCarga) => {
    startGuardarPerfil(async () => {
      const r = await guardarPerfilDesdeEditor(sug.payload.loteId, spec);
      if (r.ok) { notifySuccess(r.message ?? "Perfil guardado."); return; }
      if (r.needsClient) { setPromptPerfilSpec(spec); return; }
      notifyError(r.message ?? "No se pudo guardar el perfil.");
    });
  };
  const guardarPerfilConCliente = (clientId: number) => {
    const spec = promptPerfilSpec;
    if (!spec) return;
    startGuardarPerfil(async () => {
      const r = await guardarPerfilDesdeEditor(sug.payload.loteId, spec, clientId);
      if (r.ok) { notifySuccess(r.message ?? "Perfil guardado."); setPromptPerfilSpec(null); }
      else notifyError(r.message ?? "No se pudo guardar el perfil.");
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-2 rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2.5 text-[12.5px] text-ok-700">
        <span>
          Leí <span className="font-semibold">{sug.payload.cuentas} cuenta(s)</span> de{" "}
          <span className="font-mono">{sug.payload.archivoNombre}</span>. El archivo ya quedó guardado como borrador; continúa allí para completar la revisión antes de cargarlo.
        </span>
        <OrigenChip origen={sug.payload.origenExtraccion} proveedor={sug.render.proveedorIA} />
      </div>

      {/* La validación contable completa y el resumen de detección se muestran en
          el borrador persistente. Aquí dejamos el cuadre y el movimiento. */}
      <CuadreBanner c={sug.render.cuadre} />
      <DetalleMovimiento cuentas={sug.render.importReady} />

      {puedeEditar && sug.render.spec && (
        <EditorEstructura
          spec={sug.render.spec}
          encabezados={sug.render.encabezados}
          hojas={sug.render.hojas}
          reprocesando={reprocesando}
          onAplicar={(s) => onReprocesar(s, sug.payload.loteId, sug.payload.proveedorIA)}
          onGuardar={onGuardarPerfil}
          guardando={guardandoPerfil}
        />
      )}

      {promptPerfilSpec && (
        <PromptClientePerfil clientes={clients} guardando={guardandoPerfil} onElegir={guardarPerfilConCliente} onClose={() => setPromptPerfilSpec(null)} />
      )}
      {excepciones.length > 0 && <ExcepcionesTabla excepciones={excepciones} />}
    </div>
  );
}

// Roles de columna del editor (0 = la columna no existe en el archivo).
type RolColumna = Exclude<keyof SpecCarga["columnas"], "codigoFragmentos">;
const ROLES_COLUMNA: { key: RolColumna; label: string; requerida?: boolean }[] = [
  { key: "codigo", label: "Código de cuenta", requerida: true },
  { key: "nombre", label: "Nombre de la cuenta" },
  { key: "saldoInicial", label: "Saldo inicial" },
  { key: "debitos", label: "Débitos" },
  { key: "creditos", label: "Créditos" },
  { key: "saldoFinal", label: "Saldo final (una columna)" },
  { key: "saldoFinalDebito", label: "Saldo final · débito" },
  { key: "saldoFinalCredito", label: "Saldo final · crédito" },
  { key: "tercero", label: "Tercero / NIT" },
];

/**
 * Editor de ESTRUCTURA del archivo: muestra el mapa aplicado (hoja, filas,
 * columnas por rol, signo, regla de detalle) y permite corregirlo. «Aplicar»
 * reprocesa el archivo de forma DETERMINISTA (sin IA) con el spec ajustado.
 */
export function EditorEstructura({
  spec,
  encabezados,
  hojas,
  reprocesando,
  onAplicar,
  onGuardar,
  guardando,
  notasCliente,
  onGuardarNotas,
  guardandoNotas,
}: {
  spec: SpecCarga;
  encabezados: string[];
  hojas: string[];
  reprocesando: boolean;
  onAplicar: (spec: SpecCarga) => void;
  onGuardar?: (spec: SpecCarga) => void;
  guardando?: boolean;
  // Notas / observaciones de carga del cliente (per-cliente, no del formato). El
  // padre resuelve el cliente y persiste; aquí solo se edita y se dispara el guardado.
  notasCliente?: string | null;
  onGuardarNotas?: (texto: string) => void;
  guardandoNotas?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [ed, setEd] = useState<SpecCarga>(spec);
  const [fragmentosTexto, setFragmentosTexto] = useState(spec.columnas.codigoFragmentos.join(", "));
  const [notas, setNotas] = useState(notasCliente ?? "");
  // Sincroniza las notas locales cuando cambia el cliente (o tras guardar/refrescar).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNotas(notasCliente ?? ""); }, [notasCliente]);

  // Opciones de columna: hasta donde llegue el encabezado o la columna más alta ya asignada.
  const columnasAsignadas = Object.values(ed.columnas).flatMap((v) => Array.isArray(v) ? v : [v]);
  const maxCol = Math.max(encabezados.length, ...columnasAsignadas, ed.reglaDetalle.columna ?? 0, 6);
  const opciones = Array.from({ length: maxCol }, (_, i) => i + 1);
  const etiquetaCol = (n: number) => {
    const enc = encabezados[n - 1];
    return enc ? `${columnaLetra(n - 1)} — ${recortar(enc, 24)}` : columnaLetra(n - 1);
  };

  const setCol = (key: RolColumna, v: number) => {
    if (key === "codigo" && v > 0) setFragmentosTexto("");
    setEd((s) => ({
      ...s,
      columnas: {
        ...s.columnas,
        [key]: v,
        ...(key === "codigo" && v > 0 ? { codigoFragmentos: [] } : {}),
      },
    }));
  };
  const setCodigoFragmentos = (texto: string) => {
    setFragmentosTexto(texto);
    const fragmentos = [...new Set(texto.split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    setEd((s) => ({
      ...s,
      columnas: { ...s.columnas, codigo: fragmentos.length > 0 ? 0 : s.columnas.codigo, codigoFragmentos: fragmentos },
    }));
  };
  const sinCambios = JSON.stringify(ed) === JSON.stringify(spec);

  return (
    <div className="rounded-md border border-ink-150">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-semibold text-ink-600 hover:bg-ink-50"
      >
        <span className="inline-flex items-center gap-1.5">
          <Icon name="doc" size={13} /> Ajustar estructura del archivo
        </span>
        <span className="text-ink-400">{abierto ? "▲" : "▼"}</span>
      </button>
      {abierto && (
        <div className="flex flex-col gap-3 border-t border-ink-100 px-3 py-3">
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            Corrige qué columna corresponde a cada dato y reprocesa al instante — <span className="font-semibold">sin IA</span>.
            Marca «no existe» cuando el archivo no trae esa columna.
          </p>

          <button
            type="button"
            onClick={() => setAyudaAbierta((v) => !v)}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Icon name="doc" size={12} /> Guía detallada de los campos {ayudaAbierta ? "▲" : "▼"}
          </button>
          {ayudaAbierta && (
            <div className="flex flex-col gap-3 rounded-md border border-blue-100 bg-blue-50/40 px-3 py-3 text-[11.5px] leading-relaxed text-ink-600">
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Para qué sirve</div>
                <p>Reprocesa el archivo con el mapa de columnas corregido, <span className="font-semibold">sin IA y al instante</span>. Úsalo cuando la lectura automática asignó mal una columna, la fila del encabezado, el signo del crédito o cómo se detecta el detalle. No modifica el archivo original: genera una lectura nueva que reemplaza a la anterior.</p>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Dónde están los datos</div>
                <dl className="flex flex-col gap-1">
                  <div><dt className="inline font-semibold">Hoja:</dt> <dd className="inline">la pestaña del Excel donde está el balance. En archivos con varias hojas, elige la correcta.</dd></div>
                  <div><dt className="inline font-semibold">Fila del encabezado:</dt> <dd className="inline">número de fila (empezando en 1) donde están los <span className="italic">títulos</span> de las columnas («Código», «Nombre», «Débito»…). Si el archivo trae logo o título arriba, no es la fila 1.</dd></div>
                  <div><dt className="inline font-semibold">Primera fila de datos:</dt> <dd className="inline">la primera fila con una cuenta real, justo debajo del encabezado.</dd></div>
                </dl>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Columnas por rol (elige la letra, o «no existe»)</div>
                <dl className="flex flex-col gap-1">
                  <div><dt className="inline font-semibold">Código de cuenta *:</dt> <dd className="inline">(obligatoria) la columna con el código PUC (<span className="font-mono">1105</span>, <span className="font-mono">110505</span>…). Si el código viene partido en varias columnas, déjala en «usa columnas fragmentadas» y usa el campo de más abajo.</dd></div>
                  <div><dt className="inline font-semibold">Nombre de la cuenta:</dt> <dd className="inline">la descripción de la cuenta («CAJA GENERAL»).</dd></div>
                  <div><dt className="inline font-semibold">Saldo inicial:</dt> <dd className="inline">el saldo anterior, al inicio del período.</dd></div>
                  <div><dt className="inline font-semibold">Débitos / Créditos:</dt> <dd className="inline">los movimientos débito y crédito del período.</dd></div>
                  <div><dt className="inline font-semibold">Saldo final (una columna):</dt> <dd className="inline">úsala cuando el saldo final viene en <span className="font-semibold">una sola</span> columna. En ese caso deja «no existe» las dos de abajo.</dd></div>
                  <div><dt className="inline font-semibold">Saldo final · débito / · crédito:</dt> <dd className="inline">úsalas cuando el saldo final viene en <span className="font-semibold">dos</span> columnas separadas (una para saldos débito y otra para crédito). Entonces deja «no existe» el «saldo final (una columna)».</dd></div>
                  <div><dt className="inline font-semibold">Tercero / NIT:</dt> <dd className="inline">la columna del NIT/cédula del tercero (en balances por tercero). «no existe» si el archivo no la trae.</dd></div>
                </dl>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Casos especiales</div>
                <dl className="flex flex-col gap-1">
                  <div><dt className="inline font-semibold">Columnas del código fragmentado:</dt> <dd className="inline">cuando el código no está en una columna, sino repartido (col 1 = «11», col 2 = «05», col 3 = «05»). Escribe los números de columna separados por coma (<span className="font-mono">1, 2, 3</span>): se concatenan en orden para formar el código.</dd></div>
                  <div><dt className="inline font-semibold">Convención del crédito:</dt> <dd className="inline"><span className="font-semibold">Magnitud</span> = débitos y créditos vienen como positivos (lo normal). <span className="font-semibold">Firmado</span> = el archivo trae los créditos con signo negativo.</dd></div>
                  <div><dt className="inline font-semibold">Detección de cuentas de detalle:</dt> <dd className="inline"><span className="font-semibold">Por jerarquía de códigos (auto)</span> decide qué cuenta es de movimiento por la longitud/jerarquía del código PUC. <span className="font-semibold">Por columna marcadora</span> se usa cuando el archivo tiene una columna que marca el detalle (p. ej. «I» o «1»): eliges la columna y el valor que lo marca. <span className="font-semibold">Todas son movimiento</span> cuando el archivo trae una lista plana de cuentas imputables sin agrupadoras (ninguna se agrupa).</dd></div>
                  <div><dt className="inline font-semibold">Agregar por tercero:</dt> <dd className="inline">en balances abiertos por tercero, suma los terceros y deja el saldo a nivel de cuenta.</dd></div>
                </dl>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Cómo aplicarlo</div>
                <p>Ajusta lo que esté mal y pulsa <span className="font-semibold">«Reprocesar sin IA»</span>: el resultado se recalcula al instante, sin costo de IA. <span className="font-semibold">«Guardar perfil (sin reprocesar)»</span> memoriza esta estructura como perfil del cliente para futuras cargas del mismo layout, sin volver a leer el archivo (útil cuando el resultado ya está bien y solo quieres dejar el ajuste). <span className="font-semibold">«Restablecer»</span> vuelve al mapa detectado originalmente. En la página del borrador, además debes <span className="font-semibold">re-adjuntar el archivo original</span> antes de reprocesar (esa página no conserva el archivo).</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Hoja</span>
              <select
                value={ed.hoja}
                onChange={(e) => setEd((s) => ({ ...s, hoja: e.target.value }))}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              >
                {(hojas.length > 0 ? hojas : [ed.hoja]).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Fila del encabezado</span>
              <input
                type="number" min={1} value={ed.filaEncabezado}
                onChange={(e) => setEd((s) => ({ ...s, filaEncabezado: Math.max(1, Number(e.target.value) || 1) }))}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Primera fila de datos</span>
              <input
                type="number" min={2} value={ed.primeraFilaDatos}
                onChange={(e) => setEd((s) => ({ ...s, primeraFilaDatos: Math.max(1, Number(e.target.value) || 1) }))}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {ROLES_COLUMNA.map((rol) => (
              <label key={rol.key} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">
                  {rol.label}
                  {rol.requerida && <span className="text-err-600"> *</span>}
                </span>
                <select
                  value={ed.columnas[rol.key]}
                  onChange={(e) => setCol(rol.key, Number(e.target.value))}
                  className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
                >
                  {(!rol.requerida || rol.key === "codigo") && (
                    <option value={0}>{rol.key === "codigo" ? "— usa columnas fragmentadas —" : "— no existe —"}</option>
                  )}
                  {opciones.map((n) => (
                    <option key={n} value={n}>{etiquetaCol(n)}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-ink-600">Columnas del código fragmentado</span>
              <input
                type="text"
                value={fragmentosTexto}
                onChange={(e) => setCodigoFragmentos(e.target.value)}
                placeholder="Ej.: 1, 2, 3, 4, 5"
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              />
              <span className="text-[10.5px] text-ink-400">Úsalo cuando GRUPO, CUENTA, SUBCUENTA y AUXILIAR vienen en columnas separadas.</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Convención del crédito</span>
              <select
                value={ed.signoCredito}
                onChange={(e) => setEd((s) => ({ ...s, signoCredito: e.target.value === "magnitud" ? "magnitud" : "firmado" }))}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              >
                <option value="firmado">Firmado (crédito negativo)</option>
                <option value="magnitud">Magnitud (todo positivo)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Detección de cuentas de detalle</span>
              <select
                value={ed.reglaDetalle.tipo}
                onChange={(e) => setEd((s) => {
                  const v = e.target.value;
                  const reglaDetalle = v === "columna"
                    ? { tipo: "columna" as const, columna: s.reglaDetalle.columna ?? 1, valor: s.reglaDetalle.valor ?? "" }
                    : v === "movimiento"
                      ? { tipo: "movimiento" as const, columna: null, valor: null }
                      : { tipo: "prefijo" as const, columna: null, valor: null };
                  return { ...s, reglaDetalle };
                })}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              >
                <option value="prefijo">Por jerarquía de códigos (auto)</option>
                <option value="columna">Por columna marcadora</option>
                <option value="movimiento">Todas son movimiento (lista plana, sin agrupadoras)</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1.5">
              <input
                type="checkbox"
                checked={ed.agregarPorTercero}
                onChange={(e) => setEd((s) => ({ ...s, agregarPorTercero: e.target.checked }))}
              />
              <span className="text-[11.5px] text-ink-600">Agregar por tercero (sumar por cuenta)</span>
            </label>
          </div>

          {ed.reglaDetalle.tipo === "columna" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">Columna marcadora</span>
                <select
                  value={ed.reglaDetalle.columna ?? 1}
                  onChange={(e) => setEd((s) => ({ ...s, reglaDetalle: { ...s.reglaDetalle, columna: Number(e.target.value) } }))}
                  className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
                >
                  {opciones.map((n) => (
                    <option key={n} value={n}>{etiquetaCol(n)}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">Valor que marca el detalle (p. ej. «I», «1»)</span>
                <input
                  type="text" value={ed.reglaDetalle.valor ?? ""}
                  onChange={(e) => setEd((s) => ({ ...s, reglaDetalle: { ...s.reglaDetalle, valor: e.target.value } }))}
                  className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
                />
              </label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={reprocesando || sinCambios}
              onClick={() => onAplicar(ed)}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
            >
              {reprocesando ? "Reprocesando…" : "Reprocesar sin IA"}
            </button>
            {onGuardar && (
              <button
                type="button"
                disabled={guardando || reprocesando}
                onClick={() => onGuardar(ed)}
                title="Guarda esta estructura como perfil del cliente (para futuras cargas del mismo layout), sin reprocesar el archivo."
                className="rounded-md border border-ok-300 bg-ok-100/40 px-3 py-1.5 text-[12px] font-semibold text-ok-700 hover:bg-ok-100 disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar perfil (sin reprocesar)"}
              </button>
            )}
            <button
              type="button"
              disabled={reprocesando || sinCambios}
              onClick={() => setEd(spec)}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60"
            >
              Restablecer
            </button>
          </div>

          {onGuardarNotas && (
            <div className="mt-3 border-t border-ink-100 pt-3">
              <div className="text-[12px] font-semibold text-ink-700">Notas / observaciones de carga del cliente</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                Particularidades del formato de este cliente para recordar en cada carga (p. ej. «duplica renglones UC/CU — se omite uno»). Se guardan por cliente y aparecen al cargar y revisar; no cambian el cálculo.
              </p>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Sin notas para este cliente."
                className="mt-1.5 w-full resize-y rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-700 outline-none focus:border-blue-400"
              />
              <button
                type="button"
                disabled={guardandoNotas || notas.trim() === (notasCliente ?? "").trim()}
                onClick={() => onGuardarNotas(notas.trim())}
                className="mt-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
              >
                {guardandoNotas ? "Guardando…" : "Guardar notas del cliente"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Resultado del cuadre de las cuentas de movimiento (hojas) contra la fila
 * TOTALES del archivo. Si no se detectó fila de totales, queda informativo; si no
 * cuadra, es bloqueante (rojo) y el botón de carga se desactiva.
 */
function CuadreBanner({ c }: { c: SugerenciaBalance["render"]["cuadre"] }) {
  if (!c) return null;
  // 1) Partida doble (lo más importante): Σ débitos debe ser EXACTAMENTE igual a Σ
  // créditos, sin tolerancia de %. Si no, se alerta aunque coincida con TOTALES.
  if (!c.partidaDobleCuadra) {
    return (
      <div className="rounded-md border border-warn-200 bg-warn-50 px-3 py-2.5 text-[12px] text-warn-700">
        <div className="font-semibold">Débitos y créditos no coinciden (partida doble).</div>
        <div className="mt-1">Débitos {fmt(c.sumaDebitos)} vs créditos {fmt(c.sumaCreditos)} · diferencia <span className="font-semibold">{fmt(c.diferenciaPartidaDoble)}</span>. Deben ser exactamente iguales.</div>
        {c.detectado && c.cuadra && <div className="mt-1 text-warn-600">Cada columna sí coincide con la fila TOTALES del archivo, pero entre sí no cuadran: revisa el archivo origen.</div>}
        <div className="mt-1">Puedes cargarlo igual: quedará <span className="font-semibold">marcado como descuadrado</span> (novedad) para revisión.</div>
      </div>
    );
  }
  // 2) Partida doble OK pero sin fila TOTALES en el archivo.
  if (!c.detectado) {
    return (
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2 text-[12px] text-ok-700">
        <span className="font-semibold">Cuadre por partida doble: OK.</span> Débitos {fmt(c.sumaDebitos)} y créditos {fmt(c.sumaCreditos)} son iguales. (El archivo no trae fila TOTALES.)
      </div>
    );
  }
  // 3) Partida doble OK y coincide con la fila TOTALES.
  if (c.cuadra) {
    return (
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2 text-[12px] text-ok-700">
        <span className="font-semibold">Cuadre: OK.</span> Débitos {fmt(c.sumaDebitos)} y créditos {fmt(c.sumaCreditos)} coinciden entre sí y con la fila TOTALES del archivo.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12px] text-err-700">
      <div className="font-semibold">No cuadra contra la fila TOTALES del archivo.</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Débitos: hojas {fmt(c.sumaDebitos)} vs TOTALES {fmt(c.totalDebitos)} (Δ {fmt(c.diferenciaDebitos)})</li>
        <li>Créditos: hojas {fmt(c.sumaCreditos)} vs TOTALES {fmt(c.totalCreditos)} (Δ {fmt(c.diferenciaCreditos)})</li>
      </ul>
      <div className="mt-1">Puedes cargarlo igual: quedará <span className="font-semibold">marcado como descuadrado</span> (novedad) para revisión, o revisa la jerarquía de cuentas (padres/auxiliares) y vuelve a leer el archivo — o corrige la estructura con «Ajustar estructura del archivo».</div>
    </div>
  );
}

/** Tabla scrollable con TODAS las cuentas de movimiento del borrador. */
function DetalleMovimiento({ cuentas }: { cuentas: SugerenciaBalance["render"]["importReady"] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Movimiento en borrador · {cuentas.length} cuenta(s)</div>
      <div className="max-h-72 overflow-auto rounded-md border border-ink-150">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-semibold">Código</th>
              <th className="px-2 py-1.5 font-semibold">Cuenta</th>
              <th className="px-2 py-1.5 text-right font-semibold">Saldo ant.</th>
              <th className="px-2 py-1.5 text-right font-semibold">Débito</th>
              <th className="px-2 py-1.5 text-right font-semibold">Crédito</th>
              <th className="px-2 py-1.5 text-right font-semibold">Saldo act.</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c, i) => (
              <tr key={`${c.code}-${i}`} className="border-t border-ink-100">
                <td className="whitespace-nowrap px-2 py-1 font-mono text-ink-500">{c.code}</td>
                <td className="max-w-[220px] truncate px-2 py-1 text-ink-700" title={c.name}>{c.name}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.prevBalance)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.debitos ?? 0)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.creditos ?? 0)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums text-ink-800">{fmt(c.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExcepcionesTabla({ excepciones }: { excepciones: Excepcion[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-warn-700">{excepciones.length} excepción(es) — filas/datos que la lectura marcó para revisar:</span>
      <div className="max-h-60 overflow-y-auto rounded-md border border-ink-150">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2.5 py-1.5 font-semibold">Fila</th>
              <th className="px-2.5 py-1.5 font-semibold">Regla / conflicto</th>
              <th className="px-2.5 py-1.5 font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {excepciones.map((e, i) => (
              <tr key={i} className="border-t border-ink-100 align-top">
                <td className="px-2.5 py-1.5 font-mono text-ink-500">{e.fila ?? "—"}</td>
                <td className="px-2.5 py-1.5 text-ink-700">
                  {e.regla}
                  {e.valor && <span className="block font-mono text-[10.5px] text-ink-400">{e.valor}</span>}
                </td>
                <td className="px-2.5 py-1.5 text-ink-500">{e.accion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ErroresTabla({ errores }: { errores: NonNullable<ImportBalanceState["errores"]> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-err-700">{errores.length} problema(s) en el archivo — nada se leyó:</span>
      <div className="max-h-60 overflow-y-auto rounded-md border border-ink-150">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2.5 py-1.5 font-semibold">Fila</th>
              <th className="px-2.5 py-1.5 font-semibold">Problema</th>
            </tr>
          </thead>
          <tbody>
            {errores.map((e, i) => (
              <tr key={i} className="border-t border-ink-100">
                <td className="px-2.5 py-1.5 font-mono text-ink-500">{e.fila || "—"}</td>
                <td className="px-2.5 py-1.5 text-ink-700">{e.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Selector de hoja (Excel multi-hoja): pestañas + vista previa de la elegida. */
function SelectorHojas({
  hojas,
  elegida,
  onElegir,
}: {
  hojas: HojaPreview[];
  elegida: string | null;
  onElegir: (nombre: string) => void;
}) {
  const activa = hojas.find((h) => h.nombre === elegida) ?? null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-warn-100 bg-warn-100/30 px-3 py-2.5">
      <p className="text-[12px] leading-relaxed text-warn-700">
        Este archivo tiene <span className="font-semibold">{hojas.length} hojas</span>. Selecciona cuál es el balance
        que quieres cargar — <span className="font-semibold">la IA no elegirá por ti</span>.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {hojas.map((h) => {
          const on = h.nombre === elegida;
          return (
            <button
              key={h.nombre}
              type="button"
              onClick={() => onElegir(h.nombre)}
              className={`rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition ${
                on ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {h.nombre} <span className={on ? "text-white/70" : "text-ink-400"}>· {h.totalFilas} fila(s)</span>
            </button>
          );
        })}
      </div>
      {activa ? (
        <PreviewHoja hoja={activa} />
      ) : (
        <p className="rounded-md border border-dashed border-ink-200 bg-white px-3 py-4 text-center text-[11.5px] text-ink-400">
          Elige una hoja para ver su contenido y poder cargarla.
        </p>
      )}
    </div>
  );
}

/** Mini-tabla tipo Excel: primeras filas × columnas (A, B, C…) de la hoja. */
function PreviewHoja({ hoja }: { hoja: HojaPreview }) {
  const numCols = Math.min(8, Math.max(1, hoja.totalColumnas));
  const cols = Array.from({ length: numCols }, (_, j) => j);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Vista previa de «{hoja.nombre}»</div>
      <div className="max-h-56 overflow-auto rounded-md border border-ink-150 bg-white">
        <table className="border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-ink-50 text-ink-400">
            <tr>
              <th className="border-b border-r border-ink-100 px-2 py-1 text-right font-semibold">#</th>
              {cols.map((j) => (
                <th key={j} className="border-b border-ink-100 px-2 py-1 text-left font-semibold">{columnaLetra(j)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hoja.muestra.map((fila, i) => (
              <tr key={i} className="even:bg-ink-50/40">
                <td className="border-r border-ink-100 px-2 py-1 text-right font-mono text-ink-400">{i + 1}</td>
                {cols.map((j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-1 text-ink-700">{celdaTexto(fila[j] ?? null)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10.5px] text-ink-400">
        Mostrando {hoja.muestra.length} de {hoja.totalFilas} fila(s)
        {hoja.totalColumnas > numCols && ` · ${hoja.totalColumnas} columnas en total`}
      </div>
    </div>
  );
}

function celdaTexto(c: CeldaCruda): string {
  if (c == null || c === "") return "";
  const s = String(c).replace(/\s+/g, " ").trim();
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}

function recortar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
