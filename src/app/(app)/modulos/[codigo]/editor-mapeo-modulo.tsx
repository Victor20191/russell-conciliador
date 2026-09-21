"use client";

// Editor del MAPEO de columnas de un archivo de módulo. Lo comparten la carga con «Archivo
// manual» (modo «carga») y la interfaz de patrones por aplicativo (modo «patron»). En modo patrón
// no se piden los datos de un cargue (TRM, fecha de corte, fila del total): son de cada archivo.
import { useTransition, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { notifyError } from "@/lib/client-notifications";
import { columnaLetra } from "@/lib/balance/extraccion/hojas-cliente";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import type { ModoSubtotales } from "@/lib/modulos/subtotales";
import {
  esTipoFormatoCartera,
  faltantesTipoFormato,
  INFO_TIPO_FORMATO,
  nivelCarteraDeSpec,
  nivelDeTipoFormato,
  tipoFormatoSugerido,
  TIPOS_FORMATO_CARTERA,
} from "@/lib/modulos/cartera/tipo-formato";
import { sugerirTrmCierre, type AnalisisModulo } from "@/app/actions/modulos-datos";
import type { CeldaMuestra } from "@/lib/modulos/extraccion/vista-analisis";

export type RolModulo = { nombre: string; etiqueta: string; tipo: string; requerido: boolean };
type ModoClasificador = "columna" | "arrastrar" | "seccion" | "global";

export const celdaTxt = (v: CeldaMuestra): string => (v == null ? "" : typeof v === "number" ? String(v) : v);

const claseCampo = "w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400";

/** Etiquetas de columna para los selectores: «C · Encabezado», con la letra real de Excel. */
export function opcionesColumnaAnalisis(analisis: AnalisisModulo): { index1: number; label: string }[] {
  const ancho = analisis.ancho ?? analisis.encabezado?.length ?? 0;
  return Array.from({ length: ancho }, (_, c) => {
    const enc = celdaTxt(analisis.encabezado?.[c] ?? null);
    return { index1: c + 1, label: `${columnaLetra(c + (analisis.columnaInicial ?? 0))}${enc ? ` · ${enc.slice(0, 28)}` : ""}` };
  });
}

/** TRM de cierre y fecha de corte: datos de ESTE cargue (Cartera y CxP). */
export function CamposCargueCartera({
  spec,
  setSpec,
  fechaCorteSugerida,
}: {
  spec: SpecModulo;
  setSpec: Dispatch<SetStateAction<SpecModulo | null>>;
  fechaCorteSugerida: string;
}) {
  const monedaArchivo = spec.monedaArchivo ?? "COP";
  const fechaCorte = spec.fechaCorte ?? fechaCorteSugerida;
  const [consultandoTrm, startConsultarTrm] = useTransition();
  const usarTrmOficial = () => {
    if (!fechaCorte) return;
    startConsultarTrm(async () => {
      const r = await sugerirTrmCierre({ fecha: fechaCorte });
      if (r.ok && r.trm) setSpec((s) => (s ? { ...s, trmCierre: Math.round((r.trm as number) * 100) / 100 } : s));
      else notifyError(r.message ?? "No se pudo consultar la TRM oficial.");
    });
  };
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-medium text-ink-600">TRM de cierre{monedaArchivo !== "COP" ? " (obligatoria)" : ""}</span>
        <span className="flex min-w-0 gap-1">
          <input
            type="number"
            min="0"
            step="0.01"
            value={spec.trmCierre ?? ""}
            onChange={(e) => setSpec((s) => (s ? { ...s, trmCierre: Number(e.target.value) > 0 ? Number(e.target.value) : undefined } : s))}
            placeholder="Pesos por unidad"
            className={claseCampo}
          />
          <button
            type="button"
            onClick={usarTrmOficial}
            disabled={consultandoTrm || !fechaCorte}
            title="Consultar la TRM oficial de la fecha de corte"
            className="shrink-0 rounded-md border border-ink-200 bg-white px-2 text-[11px] font-semibold text-ink-600 hover:border-navy-700 hover:text-navy-700 disabled:opacity-50"
          >
            {consultandoTrm ? "…" : "Oficial"}
          </button>
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-medium text-ink-600">Fecha de corte</span>
        <input
          type="date"
          value={fechaCorte}
          onChange={(e) => setSpec((s) => (s ? { ...s, fechaCorte: e.target.value || undefined } : s))}
          className={claseCampo}
        />
      </label>
      <span className="text-[11px] leading-snug text-ink-500 sm:col-span-2">
        {monedaArchivo !== "COP"
          ? `Los importes se leen en ${monedaArchivo} y se convierten a pesos con la TRM de cierre; la divisa queda en cada fila.`
          : "La TRM de cierre solo se usa si el archivo trae importes con su divisa escrita («USD (54,323.40)»). Contra la fecha de corte se miden los días vencidos y las edades."}
      </span>
    </div>
  );
}

export function EditorMapeoModulo({
  analisis,
  spec,
  setSpec,
  roles,
  clasificadorRol,
  conNivelCartera,
  modo: modoEditor,
  onCambiarHoja,
  fechaCorteSugerida = "",
  onCambioMarcaTotales,
  marcaTotalesCarga,
}: {
  analisis: AnalisisModulo;
  spec: SpecModulo;
  setSpec: Dispatch<SetStateAction<SpecModulo | null>>;
  roles: RolModulo[];
  clasificadorRol: string;
  conNivelCartera: boolean;
  modo: "carga" | "patron";
  onCambiarHoja: (hoja: string) => void;
  /** Carga: fin del período, valor por defecto de la fecha de corte. */
  fechaCorteSugerida?: string;
  /** Se invoca cuando cambia el modo o la columna de los totales (la celda ubicada deja de valer). */
  onCambioMarcaTotales?: () => void;
  /** Carga: número de fila + «Ubicar celda» del total manual. */
  marcaTotalesCarga?: ReactNode;
}) {
  const esCarga = modoEditor === "carga";
  const setCol = (rol: string, col: number) => setSpec((s) => (s ? { ...s, columnas: { ...s.columnas, [rol]: col } } : s));
  const setEnc = (v: number) => setSpec((s) => (s ? { ...s, filaEncabezado: v } : s));
  const setDat = (v: number) => setSpec((s) => (s ? { ...s, primeraFilaDatos: v } : s));
  const modo: ModoClasificador = spec.clasificadorModo ?? (spec.arrastrarClasificador ? "arrastrar" : "columna");
  const setModo = (m: ModoClasificador) =>
    setSpec((s) => (s ? { ...s, clasificadorModo: m, arrastrarClasificador: m === "arrastrar" ? true : undefined, seccionColumnaVaciaRol: m === "seccion" ? s.seccionColumnaVaciaRol ?? "descripcion" : undefined } : s));
  // Selección del clasificador: -1 = un solo valor global; ≥1 = columna.
  const onSelectClasificador = (v: number) => {
    if (v === -1) { setModo("global"); return; }
    setCol(clasificadorRol, v);
    if (modo === "global") setModo("columna");
  };
  const setSeccionRol = (rol: string) => setSpec((s) => (s ? { ...s, seccionColumnaVaciaRol: rol } : s));
  // Qué representa una fila de ESTE archivo y de dónde viene su cartera. El archivo no siempre
  // lo dice: un mismo cliente entrega un mes el resumen por tercero y otro el detalle por
  // documento, y de eso depende qué suma y qué es control.
  const nivelCartera = nivelCarteraDeSpec(spec);
  // El tipo de formato fija el nivel y decide qué controles se validan en cada cargue.
  const tipoSugerido = tipoFormatoSugerido(spec);
  const faltanTipo = faltantesTipoFormato(spec);
  const setTipoFormato = (valor: string) =>
    setSpec((s) => {
      if (!s) return s;
      if (!esTipoFormatoCartera(valor)) return { ...s, tipoFormato: undefined };
      return { ...s, tipoFormato: valor, nivel: nivelDeTipoFormato(valor) };
    });
  const origenCartera = spec.origenCartera ?? "nacional";
  const monedaArchivo = spec.monedaArchivo ?? "COP";
  const setMonedaArchivo = (m: string) =>
    setSpec((s) => (s ? { ...s, monedaArchivo: m === "COP" ? undefined : m, ...(m !== "COP" && !s.origenCartera ? { origenCartera: "exterior" as const } : {}) } : s));
  const rangosDetectados = spec.familias?.edades ?? [];
  const modoSubtotales: ModoSubtotales = spec.subtotales ?? "auto";
  const setModoSubtotales = (m: ModoSubtotales) => {
    onCambioMarcaTotales?.();
    setSpec((s) =>
      s
        ? {
            ...s,
            subtotales: m === "auto" ? undefined : m,
            // La columna marcadora solo existe en el modo manual; al salir se retira.
            subtotalesColumna: m === "manual" ? (s.subtotalesColumna ?? 0) : undefined,
            subtotalesTexto: m === "manual" ? s.subtotalesTexto : undefined,
            subtotalesFila: undefined,
          }
        : s,
    );
  };
  const setColumnaMarcaTotales = (columna: number) => {
    onCambioMarcaTotales?.();
    setSpec((s) => (s ? { ...s, subtotalesColumna: columna || undefined, subtotalesFila: undefined, subtotalesTexto: esCarga ? undefined : s.subtotalesTexto } : s));
  };

  const opciones = opcionesColumnaAnalisis(analisis);
  const preview = (rol: string): string[] => {
    const col = spec.columnas[rol] ?? 0;
    if (col < 1) return [];
    return (analisis.muestraFilas ?? []).slice(0, 6).map((f) => celdaTxt(f[col - 1] ?? null));
  };
  // ¿La columna del clasificador viene mayormente vacía? (señal de agrupación → arrastrar).
  const clasifEsparso = (() => {
    const col = spec.columnas[clasificadorRol] ?? 0;
    if (col < 1) return false;
    const vals = (analisis.muestraFilas ?? []).map((f) => celdaTxt(f[col - 1] ?? null));
    if (vals.length < 3) return false;
    return vals.filter((v) => !v).length / vals.length >= 0.3;
  })();
  const clasificadorEtiqueta = roles.find((rol) => rol.nombre === clasificadorRol)?.etiqueta ?? "clasificador";
  const colSubtotales = spec.subtotalesColumna ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {analisis.advertenciaValor && (
        <p className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[11.5px] font-medium leading-relaxed text-warn-700">
          {analisis.advertenciaValor}
        </p>
      )}
      {analisis.advertenciaHojas && (
        <p className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[11.5px] font-medium leading-relaxed text-warn-700">
          {analisis.advertenciaHojas}
        </p>
      )}
      {/* Nómina: los meses que trae el archivo, para declarar el período viendo lo que hay. */}
      {analisis.periodosDetectados && analisis.periodosDetectados.length > 0 && (
        <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
          <b>Períodos en el archivo:</b>{" "}
          {analisis.periodosDetectados.map((p) => `${p.periodo} (${p.filas.toLocaleString("es-CO")} filas · $ ${p.valor.toLocaleString("es-CO", { maximumFractionDigits: 0 })})`).join(" · ")}.
          {esCarga && analisis.periodosDetectados.length > 1 && " Entran al cargue las filas del año hasta el período declarado; las posteriores y las de años anteriores quedan fuera."}
        </p>
      )}

      {(analisis.hojas?.length ?? 0) > 1 && (
        <label className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="shrink-0 text-[11px] font-medium text-ink-600">Hoja</span>
          <select value={spec.hoja} onChange={(e) => onCambiarHoja(e.target.value)} className="min-w-0 max-w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-ink-700 outline-none focus:border-blue-400">
            {analisis.hojas?.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="shrink-0 text-[11px] text-ink-400">{analisis.totalFilas} filas</span>
        </label>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-600">Fila de encabezado</span>
          <input type="number" min={1} value={spec.filaEncabezado} onChange={(e) => setEnc(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 tabular-nums text-ink-700 outline-none focus:border-blue-400" />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-600">Primera fila de datos</span>
          <input type="number" min={1} value={spec.primeraFilaDatos} onChange={(e) => setDat(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 tabular-nums text-ink-700 outline-none focus:border-blue-400" />
        </label>
      </div>

      <div className="overflow-hidden rounded-md border border-ink-150">
        <div className="border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Mapeo de columnas</div>
        <div className="flex flex-col divide-y divide-ink-100">
          {roles.map((rc) => {
            const muestras = preview(rc.nombre);
            const muestraTxt = muestras.filter(Boolean).slice(0, 2).join(" · ") || "—";
            return (
              <div key={rc.nombre} className="flex flex-col gap-1.5 px-3 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-medium leading-snug text-ink-700">
                    {rc.etiqueta}
                    {rc.requerido && <span className="text-err-700"> *</span>}
                  </span>
                  {rc.nombre === clasificadorRol && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-blue-700">clasifica</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <select
                    value={rc.nombre === clasificadorRol && modo === "global" ? -1 : spec.columnas[rc.nombre] ?? 0}
                    onChange={(e) => (rc.nombre === clasificadorRol ? onSelectClasificador(Number(e.target.value)) : setCol(rc.nombre, Number(e.target.value)))}
                    className={`${claseCampo} flex-1`}
                  >
                    <option value={0}>— sin mapear —</option>
                    {rc.nombre === clasificadorRol && <option value={-1}>🌐 Un único clasificador para todo el archivo</option>}
                    {opciones.map((o) => (
                      <option key={o.index1} value={o.index1}>{o.label}</option>
                    ))}
                  </select>
                  <span className="min-w-0 truncate text-[11px] leading-snug text-ink-400 sm:w-36 sm:shrink-0" title={muestras.join(" · ")}>
                    {muestraTxt}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {conNivelCartera && (
        <div className="flex flex-col gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">
              Tipo de formato{modoEditor === "patron" && <span className="text-err-600"> *</span>}
            </span>
            <select value={spec.tipoFormato ?? ""} onChange={(e) => setTipoFormato(e.target.value)} className={claseCampo}>
              {!spec.tipoFormato && (
                <option value="">
                  {modoEditor === "patron" ? "— elige el tipo —" : "Sin declarar"} (sugerido: {INFO_TIPO_FORMATO[tipoSugerido].etiqueta.toLowerCase()})
                </option>
              )}
              {TIPOS_FORMATO_CARTERA.map((t) => (
                <option key={t} value={t}>{INFO_TIPO_FORMATO[t].etiqueta} — {INFO_TIPO_FORMATO[t].fila.toLowerCase()}</option>
              ))}
            </select>
            <span className="text-[11px] leading-snug text-ink-500">
              {spec.tipoFormato
                ? `Se valida: ${INFO_TIPO_FORMATO[spec.tipoFormato].controles.join("; ").toLowerCase()}.`
                : `Cada fila se toma como ${nivelCartera === "documento" ? "un documento" : "un tercero"}.`}
              {" "}Un período suma por UN solo nivel: si además cargas el otro, entra como control y se compara tercero por tercero.
            </span>
            {faltanTipo.length > 0 && <span className="text-[11px] font-medium leading-snug text-err-700">{faltanTipo.join(" ")}</span>}
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">¿De dónde es esta cartera?</span>
            <select value={origenCartera} onChange={(e) => setSpec((s) => (s ? { ...s, origenCartera: e.target.value as "nacional" | "exterior" | "mixta" } : s))} className={claseCampo}>
              <option value="nacional">Nacional</option>
              <option value="exterior">Del exterior (se factura en divisa)</option>
              <option value="mixta">Mixta: lo dice la cuenta de cada fila</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:max-w-xs">
            <span className="text-[11px] font-medium text-ink-600">Moneda de los importes</span>
            <select value={monedaArchivo} onChange={(e) => setMonedaArchivo(e.target.value)} className={claseCampo}>
              <option value="COP">Pesos (COP)</option>
              <option value="USD">Dólares (USD)</option>
              <option value="EUR">Euros (EUR)</option>
            </select>
          </label>
          {esCarga && <CamposCargueCartera spec={spec} setSpec={setSpec} fechaCorteSugerida={fechaCorteSugerida} />}
          <div className="border-t border-ink-150 pt-2">
            <span className="text-[11px] font-medium text-ink-600">Rangos de vencimiento detectados</span>
            {rangosDetectados.length === 0 ? (
              <p className="mt-1 text-[11px] leading-snug text-ink-500">Ninguno. El saldo saldrá de la columna de total.</p>
            ) : (
              <>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {rangosDetectados.map((r) => (
                    <li key={r.columna} className={`rounded border px-1.5 py-0.5 text-[10.5px] ${r.clase === "excluir" ? "border-warn-500 bg-warn-100/40 text-warn-700" : "border-ink-200 bg-white text-ink-600"}`}>
                      {r.etiqueta}{r.clase === "excluir" ? " · no suma" : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] leading-snug text-ink-500">El saldo de cada fila es la SUMA de estos rangos; si el archivo trae además una columna de total y no coincide, manda la suma y la diferencia se avisa.</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
        {modo === "global" ? (
          <span className="text-[11.5px] leading-snug text-ink-600">🌐 <b>Clasificador global</b>: todo el archivo se carga bajo un único valor de {clasificadorEtiqueta.toLowerCase()}. En el consolidado le asignas una cuenta.</span>
        ) : (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">¿Cómo viene el {clasificadorEtiqueta.toLowerCase()}?</span>
            <select value={modo} onChange={(e) => setModo(e.target.value as ModoClasificador)} className={claseCampo}>
              <option value="columna">En su propia columna, en cada fila</option>
              <option value="arrastrar">Agrupado en su columna (una vez por bloque; se arrastra){clasifEsparso ? " · recomendado" : ""}</option>
              <option value="seccion">En renglones de sección (encabezados de grupo) intercalados con los ítems</option>
            </select>
          </label>
        )}
        {modo === "seccion" && (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">El renglón de sección se reconoce porque está vacía la columna:</span>
            <select value={spec.seccionColumnaVaciaRol ?? "descripcion"} onChange={(e) => setSeccionRol(e.target.value)} className={claseCampo}>
              {roles.filter((r) => r.nombre !== clasificadorRol).map((r) => <option key={r.nombre} value={r.nombre}>{r.etiqueta}</option>)}
            </select>
            <span className="text-[11px] leading-snug text-ink-500">El tipo va en la misma columna que otro campo (p. ej. el código): mapea ese campo a la misma columna del tipo. Si el archivo trae negrita, también se detecta por negrita.</span>
            {(() => {
              const rolSenal = spec.seccionColumnaVaciaRol ?? "descripcion";
              const colSenal = spec.columnas[rolSenal] ?? 0;
              const colTipo = spec.columnas[clasificadorRol] ?? 0;
              if (colSenal < 1)
                return <span className="text-[11px] font-semibold leading-snug text-err-700">⚠ Esa columna está «sin mapear»: mapéala arriba, o elige otra que esté vacía en los renglones de sección. Si no, no se detectaría ninguna sección.</span>;
              if (colSenal === colTipo)
                return <span className="text-[11px] font-semibold leading-snug text-err-700">⚠ Esa es la MISMA columna del tipo (nunca está vacía): elige otra —normalmente la Descripción— que sí venga vacía en los renglones de sección.</span>;
              return null;
            })()}
          </label>
        )}
        <label className="flex min-w-0 flex-col gap-1 border-t border-ink-150 pt-2">
          <span className="text-[11px] font-medium text-ink-600">¿El archivo trae filas de TOTAL (al pie, o por {clasificadorEtiqueta.toLowerCase()})?</span>
          <select value={modoSubtotales} onChange={(e) => setModoSubtotales(e.target.value as ModoSubtotales)} className={claseCampo}>
            <option value="auto">Detectarlas automáticamente (rótulo «Total», cuadro de cierre al pie, o suma del bloque + fila sin detalle / en negrita)</option>
            <option value="rotulo">Solo las que digan «Total» / «Subtotal»</option>
            <option value="nunca">No trae totales: no detectar ninguna</option>
            <option value="manual">Indicarlas yo: señalo la celda del archivo que las marca</option>
          </select>
          <span className="text-[11px] leading-snug text-ink-500">
            Las filas de total NO se cargan: el borrador las compara con la suma de los movimientos y avisa si no cuadran.
            {esCarga ? " El perfil recuerda el modo y la columna; la fila exacta se ubica de nuevo en cada archivo." : " El patrón recuerda el modo y la columna; la fila exacta se pide en cada carga."}
          </span>
        </label>
        {modoSubtotales === "manual" && (
          <div className="flex flex-col gap-2 rounded-md border border-ink-200 bg-white px-3 py-2.5">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Columna que marca la fila de total <span className="text-err-600">*</span></span>
              <select value={colSubtotales} onChange={(e) => setColumnaMarcaTotales(Number(e.target.value))} className={claseCampo}>
                <option value={0}>— elige —</option>
                {opciones.map((opcion) => (
                  <option key={opcion.index1} value={opcion.index1}>{opcion.label}</option>
                ))}
              </select>
            </label>
            {esCarga ? marcaTotalesCarga : (
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">Texto que marca el total (opcional)</span>
                <input
                  type="text"
                  maxLength={80}
                  value={spec.subtotalesTexto ?? ""}
                  onChange={(e) => setSpec((s) => (s ? { ...s, subtotalesTexto: e.target.value || undefined } : s))}
                  placeholder="Vacío = cualquier valor en esa columna"
                  className={claseCampo}
                />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
