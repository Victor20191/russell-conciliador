"use client";

// LECTURA POR EJEMPLO: el usuario enseña cómo se lee el archivo con UN producto. Al elegir una
// fila, el texto de su celda se separa solo en partes («Ref: PP-004», «Cant: 60»…) que se
// arrastran —o se eligen en una lista— al campo que corresponde; el sistema propone el campo de
// cada parte por su rótulo. Lo asignado viaja al servidor, que deduce la regla, la aplica al
// archivo completo y, si los ejemplos no alcanzan, se los da a la asistencia como contexto
// obligatorio. Los datos solo se SEÑALAN: nada se escribe a mano ni se reordena el archivo.
import { useEffect, useMemo, useState } from "react";
import { BotonPantallaCompleta, propsRegionPantallaCompleta, usePantallaCompletaTabla } from "@/components/tabla-pantalla-completa";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { ROLES_LECTURA_INVENTARIO, type RolLecturaInventario } from "@/lib/modulos/extraccion/lectura-estructurada";
import {
  agregarProducto,
  asignarPartesSugeridas,
  filasConProblemas,
  marcarInicioProducto,
  modeloParaEnviar,
  quitarProducto,
  soltarDato,
  type DatoArrastrado,
  type DestinoDato,
} from "@/lib/modulos/asistencia/constructor-estado";
import {
  ETIQUETA_ROL,
  INICIAL_ROL,
  MAX_PRODUCTOS_EJEMPLO,
  ModeloUsuarioSchema,
  nucleoTramo,
  quitarDeProducto,
  type AvisoAsignacion,
  type ModeloUsuarioInventario,
  type ProductoEjemplo,
} from "@/lib/modulos/asistencia/modelo-usuario";
import { partesDeCelda, type ParteCelda } from "@/lib/modulos/asistencia/partes-celda";
import type { VentanaMuestra } from "@/lib/modulos/asistencia/ventana-muestra";
import { claseBoton, claseBotonPrimario, claseCampo, COLOR_ROL, letraColumna, MIME_DATO } from "./estilos";
import { GrillaMuestra, type SeleccionGrilla } from "./grilla-muestra";

export type ConsultaVentana = { hoja: string; filaDesde: number; spec: SpecModulo | null };
export type RespuestaVentana = { ok: true; ventana: VentanaMuestra } | { ok: false; message: string };

const FILAS_CONTEXTO = 3;
const MOTIVO_MINIMO = 8;
const clave = (fila: number, columna: number) => `${fila}:${columna}`;
type Tramo = { inicio: number; fin: number };

export function ConstructorLectura({ modelo, onModelo, spec, filasSugeridas, trabajando, cargarVentana, onReprocesar }: {
  modelo: ModeloUsuarioInventario;
  onModelo: (modelo: ModeloUsuarioInventario) => void;
  /** La lectura vigente: la grilla la superpone para ver qué quedó leído. */
  spec: SpecModulo | null;
  filasSugeridas?: { fila: number; mensaje: string }[];
  trabajando: boolean;
  cargarVentana: (consulta: ConsultaVentana) => Promise<RespuestaVentana>;
  onReprocesar: (modelo: ModeloUsuarioInventario) => void;
}) {
  const [ventana, setVentana] = useState<VentanaMuestra | null>(null);
  const [cargada, setCargada] = useState<{ clave: string; error: string | null } | null>(null);
  const [filaDesde, setFilaDesde] = useState(1);
  const [irA, setIrA] = useState("");
  const [productoActivo, setProductoActivo] = useState(0);
  // undefined = el usuario aún no eligió (se abre la celda inicial); null = quitó la selección a propósito.
  const [seleccionElegida, setSeleccion] = useState<SeleccionGrilla | null | undefined>(undefined);
  const [tramo, setTramo] = useState<Tramo | null>(null);
  const [aviso, setAviso] = useState<AvisoAsignacion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [filaTitulos, setFilaTitulos] = useState<number>(modelo.columnas[0]?.filaTitulos ?? 1);
  // Pantalla completa: el archivo y los campos ocupan todo el viewport (mismo modo que las tablas largas).
  const { pantallaCompleta, alternar: alternarPantallaCompleta } = usePantallaCompletaTabla();
  const region = propsRegionPantallaCompleta(pantallaCompleta, "rounded-md border border-blue-200 bg-blue-50/20 p-3");
  // Texto de cada celda vista, para mostrar el valor de lo asignado aunque ya no esté en pantalla.
  const [textos, setTextos] = useState<ReadonlyMap<string, string>>(() => new Map());
  const specClave = useMemo(() => (spec ? JSON.stringify(spec) : ""), [spec]);
  // La ventana pedida se identifica por hoja, tramo y lectura; mientras no llegue, se ve la anterior.
  const consulta = `${modelo.hoja}|${filaDesde}|${specClave}`;
  const cargando = cargada?.clave !== consulta;
  const errorVentana = cargando ? null : cargada?.error ?? null;

  useEffect(() => {
    let vigente = true;
    cargarVentana({ hoja: modelo.hoja, filaDesde, spec: specClave ? JSON.parse(specClave) as SpecModulo : null })
      .then((r) => {
        if (!vigente) return;
        if (!r.ok) { setCargada({ clave: consulta, error: r.message }); return; }
        setTextos((previos) => {
          const siguientes = new Map(previos);
          for (const f of r.ventana.filas) f.celdas.forEach((c, i) => { if (c.t) siguientes.set(clave(f.fila, i + 1 + r.ventana.columnaInicial), c.t); });
          return siguientes;
        });
        setVentana(r.ventana);
        setCargada({ clave: consulta, error: null });
      })
      .catch(() => { if (vigente) setCargada({ clave: consulta, error: "No pudimos mostrar el archivo. Reintenta." }); });
    return () => { vigente = false; };
  }, [cargarVentana, modelo.hoja, filaDesde, specClave, consulta]);

  const producto = modelo.productos[productoActivo] ?? modelo.productos[0];
  // Sin nada elegido, se abre la celda del producto que se está armando o, si no hay, la primera
  // celda del archivo que trae varios datos: así las partes se ven sin buscar nada.
  const seleccion = seleccionElegida === undefined ? seleccionInicial(producto, ventana) : seleccionElegida;

  const actualizar = (siguiente: ModeloUsuarioInventario) => { onModelo(siguiente); };
  const elegir = (s: SeleccionGrilla | null) => { setSeleccion(s); setTramo(null); setAviso(null); setMotivo(""); };
  // Un clic sobre lo que ya está elegido (celda, columna o fila) lo deselecciona.
  const alternarSeleccion = (s: SeleccionGrilla) => elegir(mismaSeleccion(seleccion, s) ? null : s);
  const soltar = (destino: DestinoDato, dato: DatoArrastrado) => {
    const r = soltarDato(modelo, productoActivo, destino, dato, filaTitulos);
    if (dato.tipo === "celda" && !textos.has(clave(dato.fila, dato.columna))) setTextos((previos) => new Map(previos).set(clave(dato.fila, dato.columna), dato.texto));
    if (r.mostrarPartes) elegir({ tipo: "celda", ...r.mostrarPartes });
    setAviso(r.aviso);
    if (r.modelo !== modelo) { actualizar(r.modelo); setTramo(null); }
  };

  const textoSeleccionado = seleccion?.tipo === "celda" ? textos.get(clave(seleccion.fila, seleccion.columna)) ?? "" : "";
  const datoSeleccionado: DatoArrastrado | null = seleccion?.tipo === "celda" && textoSeleccionado
    ? { tipo: "celda", fila: seleccion.fila, columna: seleccion.columna, texto: textoSeleccionado, ...(tramo ?? {}) }
    : seleccion?.tipo === "columna" ? { tipo: "columna", columna: seleccion.columna } : null;

  const ir = (fila: number) => setFilaDesde(Math.max(1, fila - FILAS_CONTEXTO));
  const armarEnFila = (fila: number) => {
    const conProducto = modelo.productos.at(-1)?.asignaciones.length ? agregarProducto(modelo) : modelo;
    if (conProducto !== modelo) actualizar(conProducto);
    setProductoActivo(conProducto.productos.length - 1);
    ir(fila);
    elegir({ tipo: "fila", fila });
  };

  const validacion = ModeloUsuarioSchema.safeParse(modeloParaEnviar(modelo));
  const problemaModelo = validacion.success ? null : validacion.error.issues[0]?.message ?? "Revisa el ejemplo.";
  const problemas = useMemo(() => filasConProblemas([
    ...(filasSugeridas ?? []).map((f) => ({ fila: f.fila, tipo: "registro" as const, mensaje: f.mensaje })),
    ...(ventana?.lectura?.todas ?? []),
  ]), [filasSugeridas, ventana?.lectura?.todas]);

  return (
    <section aria-label="Enseñar la lectura con un producto" data-balance-table-fullscreen={region["data-balance-table-fullscreen"]} className={`@container flex min-w-0 flex-col gap-3 text-[12px] ${pantallaCompleta ? `${region.className} p-4` : region.className}`} aria-busy={trabajando || cargando}>
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink-800">Enseña cómo se lee el archivo con un producto</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 leading-relaxed text-ink-700">
            <li>Haz clic en una fila del archivo que sea un producto.</li>
            <li>Su texto aparece separado en partes. Arrastra cada parte al campo que le corresponde, o elígelo en la lista de la parte. Ya te proponemos el campo de cada una.</li>
            <li>Pulsa <b>Aplicar a todo el archivo</b>. Con lo que asignaste leemos el resto; si no alcanza, se lo damos a la asistencia como ejemplo.</li>
          </ol>
        </div>
        <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternarPantallaCompleta} />
      </div>

      {problemas.length > 0 && (
        <details className="shrink-0 rounded-md border border-err-200 bg-err-100/30" open>
          <summary className="cursor-pointer px-3 py-2 font-medium text-err-700">Lo que la lectura todavía no entiende ({problemas.length}{problemas.length >= 20 ? "+" : ""})</summary>
          <ul className="max-h-40 space-y-1 overflow-auto border-t border-err-200 px-3 py-2">
            {problemas.map((p) => (
              <li key={p.fila} className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-700">
                <span className="min-w-0 flex-1 break-words"><b className="text-err-700">Fila {p.fila}</b> · {p.mensaje}</span>
                <button type="button" className={claseBoton} onClick={() => ir(p.fila)}>Ver</button>
                <button type="button" className={claseBoton} disabled={modelo.productos.length >= MAX_PRODUCTOS_EJEMPLO && !!modelo.productos.at(-1)?.asignaciones.length} onClick={() => armarEnFila(p.fila)}>Armar como ejemplo</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className={pantallaCompleta ? "min-h-0 flex-1 overflow-y-auto @5xl:overflow-hidden" : undefined}>
      <div className={`flex min-w-0 flex-col gap-3 @5xl:flex-row ${pantallaCompleta ? "@5xl:h-full" : ""}`}>
        {/* Archivo */}
        <div className={`flex min-w-0 flex-col gap-2 @5xl:flex-[3] ${pantallaCompleta ? "@5xl:min-h-0" : ""}`}>
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-600">
            {ventana && ventana.hojas.length > 1 && (
              <label className="flex items-center gap-1.5">Hoja
                <select className={`${claseCampo} w-auto`} value={modelo.hoja} disabled={trabajando} onChange={(e) => { actualizar({ ...modelo, hoja: e.target.value, productos: [{ asignaciones: [] }], columnas: [], secciones: [], totales: [], ignorarFilas: [], ignorarColumnas: [] }); setFilaDesde(1); setSeleccion(undefined); setProductoActivo(0); }}>
                  {ventana.hojas.map((h) => <option key={h.nombre} value={h.nombre}>{h.nombre}{h.oculta ? " (oculta)" : ""}</option>)}
                </select>
              </label>
            )}
            <button type="button" className={claseBoton} disabled={cargando || !ventana || ventana.indiceDesde === 0} onClick={() => setFilaDesde(Math.max(1, (ventana?.filas[0]?.fila ?? 1) - 80))}>Anteriores</button>
            <button type="button" className={claseBoton} disabled={cargando || !ventana || ventana.indiceDesde + ventana.filas.length >= ventana.totalFilas} onClick={() => setFilaDesde((ventana?.filas.at(-1)?.fila ?? 0) + 1)}>Siguientes</button>
            <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const n = Number(irA); if (n > 0) ir(n); }}>
              <label className="flex items-center gap-1.5">Ir a la fila <input inputMode="numeric" value={irA} onChange={(e) => setIrA(e.target.value.replace(/\D/g, ""))} className={`${claseCampo} w-20`} /></label>
              <button type="submit" className={claseBoton}>Ir</button>
            </form>
            {ventana && <span className="ml-auto tabular-nums">Filas {ventana.filas[0]?.fila ?? 0}–{ventana.filas.at(-1)?.fila ?? 0}{ventana.lectura ? ` · la lectura reconoce ${ventana.lectura.registros.toLocaleString("es-CO")} producto(s)` : ""}</span>}
          </div>
          {ventana && ventana.columnasTotales > ventana.columnas && <p className="text-[11px] text-warn-700">Se muestran las primeras {ventana.columnas} de {ventana.columnasTotales} columnas.</p>}
          {errorVentana && <p role="alert" className="rounded-md bg-err-100/50 px-3 py-2 text-err-700">{errorVentana}</p>}
          {cargando && !ventana && <p role="status" className="text-ink-500">Abriendo el archivo…</p>}
          {ventana && <GrillaMuestra ventana={ventana} modelo={modelo} seleccion={seleccion} onSeleccion={alternarSeleccion} llena={pantallaCompleta} />}
          <p className="text-[11px] text-ink-500">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-blue-100 align-middle ring-1 ring-blue-400" /> Producto leído
            <span className="ml-3 mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-ok-100 align-middle ring-1 ring-ok-500" /> Total
            <span className="ml-3 mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-err-100 align-middle shadow-[inset_0_0_0_2px_var(--color-err-500)]" /> Sin interpretar
          </p>
        </div>

        {/* Partes y campos */}
        <div className={`flex min-w-0 flex-col gap-3 @5xl:flex-[2] ${pantallaCompleta ? "@5xl:min-h-0 @5xl:overflow-y-auto" : ""}`}>
          {seleccion?.tipo === "celda" ? (
            <PartesDeCelda
              fila={seleccion.fila}
              columna={seleccion.columna}
              texto={textoSeleccionado}
              producto={producto}
              modelo={modelo}
              tramo={tramo}
              onTramo={setTramo}
              trabajando={trabajando}
              onSoltar={soltar}
              onAsignarSugeridas={() => {
                const r = asignarPartesSugeridas(modelo, productoActivo, { fila: seleccion.fila, columna: seleccion.columna, texto: textoSeleccionado });
                setAviso(r.aviso);
                if (r.modelo !== modelo) actualizar(r.modelo);
              }}
            />
          ) : (
            <OtraSeleccion
              seleccion={seleccion}
              dato={datoSeleccionado}
              trabajando={trabajando}
              filaTitulos={filaTitulos}
              onFilaTitulos={setFilaTitulos}
              motivo={motivo}
              onMotivo={setMotivo}
              productoActivo={productoActivo}
              inicioActual={producto?.filaInicio}
              onSoltar={soltar}
              onInicio={(fila) => actualizar(marcarInicioProducto(modelo, productoActivo, fila))}
              onIgnorarFila={(fila) => { actualizar({ ...modelo, ignorarFilas: [...modelo.ignorarFilas.filter((f) => f.fila !== fila), { fila, motivo: motivo.trim() }] }); setMotivo(""); }}
              onIgnorarColumna={(columna) => { actualizar({ ...modelo, ignorarColumnas: [...modelo.ignorarColumnas.filter((c) => c.columna !== columna), { columna, motivo: motivo.trim() }] }); setMotivo(""); }}
            />
          )}
          {aviso && <p role={aviso.nivel === "error" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-[11.5px] ${aviso.nivel === "error" ? "bg-err-100/50 text-err-700" : "bg-warn-100/50 text-warn-700"}`}>{aviso.mensaje}</p>}

          <div className="rounded-md border border-ink-150 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Productos de ejemplo">
              <span className="mr-1 text-[11.5px] font-medium text-ink-700">Campos del producto</span>
              {modelo.productos.length > 1 && modelo.productos.map((p, i) => (
                <span key={i} className="inline-flex items-center">
                  <button type="button" role="tab" aria-selected={i === productoActivo} onClick={() => setProductoActivo(i)} className={`rounded-l-md border px-2 py-0.5 text-[11px] font-semibold ${i === productoActivo ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>{i + 1}</button>
                  <button type="button" aria-label={`Quitar el producto ${i + 1}`} onClick={() => { actualizar(quitarProducto(modelo, i)); setProductoActivo(0); }} className="rounded-r-md border border-l-0 border-ink-200 bg-white px-1.5 py-0.5 text-[11px] text-ink-500 hover:bg-err-100/40 hover:text-err-700">×</button>
                </span>
              ))}
              {modelo.productos.length < MAX_PRODUCTOS_EJEMPLO && <button type="button" className="ml-auto text-[11px] font-medium text-blue-700 underline" title="Útil si el formato varía entre productos" onClick={() => { actualizar(agregarProducto(modelo)); setProductoActivo(modelo.productos.length); }}>+ otro producto de ejemplo</button>}
            </div>
            <ul className="flex flex-col gap-1.5">
              {ROLES_LECTURA_INVENTARIO.map((rol) => (
                <CampoDestino
                  key={rol}
                  rol={rol}
                  producto={producto}
                  columna={modelo.columnas.find((c) => c.rol === rol)?.columna}
                  porSeccion={rol === "tipo" && modelo.secciones.length > 0}
                  textos={textos}
                  hayDato={!!datoSeleccionado}
                  trabajando={trabajando}
                  onSoltar={(dato) => soltar({ tipo: "rol", rol }, dato)}
                  onSinDato={() => setAviso({ nivel: "aviso", mensaje: "Arrastra aquí una parte de la celda, o elige el campo en la lista de la parte." })}
                  onUsarSeleccion={() => datoSeleccionado && soltar({ tipo: "rol", rol }, datoSeleccionado)}
                  onQuitar={() => actualizar({
                    ...modelo,
                    productos: modelo.productos.map((p, i) => i === productoActivo ? quitarDeProducto(p, rol) : p),
                    columnas: producto?.asignaciones.some((a) => a.rol === rol) ? modelo.columnas : modelo.columnas.filter((c) => c.rol !== rol),
                  })}
                />
              ))}
            </ul>
            <label className="mt-2 flex items-start gap-2 text-[11.5px] text-ink-700">
              <input type="checkbox" className="mt-0.5" checked={modelo.tipoUnico === true} disabled={trabajando} onChange={(e) => actualizar({ ...modelo, tipoUnico: e.target.checked || undefined })} />
              <span>Todo el archivo es un solo inventario (no trae tipo).</span>
            </label>
          </div>

          <Marcas modelo={modelo} textos={textos} trabajando={trabajando} hayDato={!!datoSeleccionado} onSoltar={soltar} dato={datoSeleccionado} onModelo={actualizar} />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-3">
            {problemaModelo && <span role="status" className="mr-auto text-[11.5px] text-warn-700">{problemaModelo}</span>}
            <button type="button" className={claseBotonPrimario} disabled={trabajando || !!problemaModelo} onClick={() => validacion.success && onReprocesar(validacion.data)}>
              {trabajando ? "Leyendo el archivo…" : "Aplicar a todo el archivo"}
            </button>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

function mismaSeleccion(a: SeleccionGrilla | null, b: SeleccionGrilla): boolean {
  if (!a || a.tipo !== b.tipo) return false;
  if (a.tipo === "celda" && b.tipo === "celda") return a.fila === b.fila && a.columna === b.columna;
  if (a.tipo === "columna" && b.tipo === "columna") return a.columna === b.columna;
  return a.tipo === "fila" && b.tipo === "fila" && a.fila === b.fila;
}

function seleccionInicial(producto: ProductoEjemplo | undefined, ventana: VentanaMuestra | null): SeleccionGrilla | null {
  const armada = producto?.asignaciones[0];
  if (armada) return { tipo: "celda", fila: armada.fila, columna: armada.columna };
  for (const f of ventana?.filas ?? []) {
    const i = f.celdas.findIndex((c) => partesDeCelda(c.t).length > 1);
    if (i >= 0) return { tipo: "celda", fila: f.fila, columna: i + 1 + (ventana?.columnaInicial ?? 0) };
  }
  return null;
}

/** El texto de la celda elegida, separado en partes que se arrastran a cada campo. */
function PartesDeCelda({ fila, columna, texto, producto, modelo, tramo, onTramo, trabajando, onSoltar, onAsignarSugeridas }: {
  fila: number;
  columna: number;
  texto: string;
  producto?: ProductoEjemplo;
  modelo: ModeloUsuarioInventario;
  tramo: Tramo | null;
  onTramo: (t: Tramo | null) => void;
  trabajando: boolean;
  onSoltar: (destino: DestinoDato, dato: DatoArrastrado) => void;
  onAsignarSugeridas: () => void;
}) {
  const partes = useMemo(() => partesDeCelda(texto), [texto]);
  if (!texto) return <p className="rounded-md bg-ink-50 px-3 py-2.5 text-[11.5px] text-ink-600">La celda {letraColumna(columna)}{fila} está vacía. Haz clic en una fila que sea un producto.</p>;
  const misma = (p: ParteCelda) => (m: { fila: number; columna: number; inicio?: number; fin?: number }) => m.fila === fila && m.columna === columna && m.inicio != null && nucleoTramo(texto, m.inicio, m.fin)[0] === p.inicio;
  // A qué quedó asignada cada parte: un campo del producto, un total o un título de sección.
  const destinoDe = (p: ParteCelda): string => {
    const rol = producto?.asignaciones.find(misma(p))?.rol;
    if (rol) return rol;
    const total = modelo.totales.find(misma(p));
    if (total) return total.tipo === "general" ? "total" : "subtotal";
    return modelo.secciones.some(misma(p)) ? "seccion" : "";
  };
  const propuesta = (p: ParteCelda) => p.rolSugerido ?? p.marcaSugerida ?? "";
  const ETIQUETA_MARCA: Record<string, string> = { seccion: "Título de sección", total: "Total general", subtotal: "Subtotal" };
  const etiquetaDestino = (v: string) => ETIQUETA_MARCA[v] ?? ETIQUETA_ROL[v as RolLecturaInventario];
  const pendientesSugeridas = partes.filter((p) => propuesta(p) && destinoDe(p) !== propuesta(p)).length;
  const dato = (p: ParteCelda | null): DatoArrastrado => ({ tipo: "celda", fila, columna, texto, ...(p ? { inicio: p.inicio, fin: p.fin } : {}) });
  const especial = texto.includes("\r");
  const capturar = (t: HTMLTextAreaElement) => {
    if (especial) return;
    onTramo(t.selectionStart !== t.selectionEnd ? { inicio: t.selectionStart, fin: t.selectionEnd } : null);
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-ink-150 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-ink-800">Fila {fila} · {partes.length > 1 ? `su texto tiene ${partes.length} partes` : "un solo dato"}</p>
        <span className="text-[11px] text-ink-500">Celda {letraColumna(columna)}{fila}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {partes.map((p) => {
          const destino = destinoDe(p);
          const rol = destino && !ETIQUETA_MARCA[destino] ? destino as RolLecturaInventario : null;
          const elegida = tramo?.inicio === p.inicio && tramo?.fin === p.fin;
          return (
            <li key={`${p.inicio}-${p.fin}`}
              draggable={!trabajando}
              onDragStart={(e) => { e.dataTransfer.setData(MIME_DATO, JSON.stringify(dato(p))); e.dataTransfer.setData("text/plain", p.valor); e.dataTransfer.effectAllowed = "copy"; }}
              className={`flex min-w-0 cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 active:cursor-grabbing ${destino ? "border-ok-500 bg-ok-100/40" : elegida ? "border-navy-600 bg-blue-50" : "border-ink-200 bg-ink-50/40 hover:border-blue-400"}`}
            >
              <span aria-hidden className="text-ink-400">⠿</span>
              <button type="button" onClick={() => onTramo(elegida ? null : { inicio: p.inicio, fin: p.fin })} className="min-w-0 flex-1 text-left" title="Arrástrala a un campo o elige el campo en la lista">
                {p.rotulo && <span className="mr-1.5 text-[10.5px] uppercase tracking-wide text-ink-500">{p.rotulo}</span>}
                <span className="break-words font-medium text-ink-800">{p.valor}</span>
              </button>
              <select
                aria-label={`Campo de «${p.valor}»`}
                value={destino}
                disabled={trabajando}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "seccion") onSoltar({ tipo: "seccion" }, dato(p));
                  else if (v === "total" || v === "subtotal") onSoltar({ tipo: "total", subtipo: v === "total" ? "general" : "subtotal" }, dato(p));
                  else if (v) onSoltar({ tipo: "rol", rol: v as RolLecturaInventario }, dato(p));
                }}
                className={`max-w-[11rem] shrink-0 rounded-md border px-1.5 py-1 text-[11px] font-semibold ${rol ? COLOR_ROL[rol] : destino ? "border-navy-500 bg-blue-50 text-navy-700" : "border-ink-200 bg-white text-ink-600"}`}
              >
                <option value="">{propuesta(p) ? `¿${etiquetaDestino(propuesta(p))}?` : "Elegir campo…"}</option>
                {ROLES_LECTURA_INVENTARIO.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
                <option value="seccion">Título de sección (tipo)</option>
                <option value="total">Total general</option>
                <option value="subtotal">Subtotal</option>
              </select>
            </li>
          );
        })}
      </ul>
      {pendientesSugeridas > 0 && (
        <button type="button" disabled={trabajando} onClick={onAsignarSugeridas} className="self-start rounded-md bg-navy-700 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50">
          Asignar las partes como se propone ({pendientesSugeridas})
        </button>
      )}
      <details className="text-[11.5px]">
        <summary className="cursor-pointer text-ink-500">¿La separación no es correcta? Selecciona el pedazo a mano</summary>
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            readOnly
            value={texto}
            rows={Math.min(5, Math.max(2, Math.ceil(texto.length / 60)))}
            aria-label="Texto de la celda: selecciona el pedazo que corresponde a un campo"
            onSelect={(e) => capturar(e.currentTarget)}
            onMouseUp={(e) => capturar(e.currentTarget)}
            onKeyUp={(e) => capturar(e.currentTarget)}
            className={`${claseCampo} resize-y font-mono text-[11.5px]`}
          />
          {especial && <p className="text-[11px] text-warn-700">Esta celda tiene saltos de línea especiales: usa las partes o la celda completa.</p>}
          {tramo && !partes.some((p) => p.inicio === tramo.inicio && p.fin === tramo.fin) && (
            <span
              draggable={!trabajando}
              onDragStart={(e) => { e.dataTransfer.setData(MIME_DATO, JSON.stringify(dato({ inicio: tramo.inicio, fin: tramo.fin, valor: "", rotulo: null, rolSugerido: null, marcaSugerida: null }))); e.dataTransfer.effectAllowed = "copy"; }}
              className="self-start cursor-grab rounded-md border border-navy-500 bg-blue-50 px-2 py-1 font-medium text-navy-800"
            >
              ⠿ «{texto.slice(...nucleoTramo(texto, tramo.inicio, tramo.fin))}» · arrástralo a un campo
            </span>
          )}
        </div>
      </details>
    </div>
  );
}

/** Un campo del producto: toda la fila recibe lo que se suelta. */
function CampoDestino({ rol, producto, columna, porSeccion, textos, hayDato, trabajando, onSoltar, onSinDato, onUsarSeleccion, onQuitar }: {
  rol: RolLecturaInventario;
  producto?: ProductoEjemplo;
  columna?: number;
  porSeccion: boolean;
  textos: ReadonlyMap<string, string>;
  hayDato: boolean;
  trabajando: boolean;
  onSoltar: (dato: DatoArrastrado) => void;
  onSinDato: () => void;
  onUsarSeleccion: () => void;
  onQuitar: () => void;
}) {
  const [sobre, setSobre] = useState(false);
  const asignado = producto?.asignaciones.find((a) => a.rol === rol);
  const texto = asignado ? textos.get(clave(asignado.fila, asignado.columna)) : undefined;
  const valor = asignado && texto ? texto.slice(...nucleoTramo(texto, asignado.inicio, asignado.fin)) : null;
  return (
    <li
      onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME_DATO)) { e.preventDefault(); setSobre(true); } }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        try { onSoltar(JSON.parse(e.dataTransfer.getData(MIME_DATO)) as DatoArrastrado); } catch { /* no es un dato del archivo */ }
      }}
      className={`flex min-w-0 items-center gap-2 rounded-md border border-dashed px-2 py-1.5 ${sobre ? "border-navy-600 bg-blue-100" : asignado || columna ? "border-ok-500 bg-ok-100/30" : "border-ink-300 bg-white"}`}
    >
      <span className={`shrink-0 rounded border px-1 text-[10px] font-semibold ${COLOR_ROL[rol]}`}>{INICIAL_ROL[rol]}</span>
      <span className="w-28 shrink-0 text-[11.5px] text-ink-700">{ETIQUETA_ROL[rol]}</span>
      <button type="button" disabled={trabajando} onClick={() => (hayDato ? onUsarSeleccion() : onSinDato())} className="min-w-0 flex-1 truncate text-left text-[11.5px]" aria-label={`${ETIQUETA_ROL[rol]}: ${valor ?? "suelta aquí una parte"}`}>
        {valor != null
          ? <><b className="text-ink-800">{valor}</b> <span className="text-ink-500">· {letraColumna(asignado!.columna)}{asignado!.fila}</span></>
          : columna ? <span className="text-ink-700">Columna {letraColumna(columna)} entera</span>
            : porSeccion ? <span className="text-ink-500">Sale del título de sección</span>
              : <span className="text-ink-400">Suelta aquí la parte</span>}
      </button>
      {(asignado || columna) && <button type="button" aria-label={`Quitar ${ETIQUETA_ROL[rol]}`} disabled={trabajando} onClick={onQuitar} className="shrink-0 rounded px-1.5 text-ink-500 hover:bg-err-100/40 hover:text-err-700">×</button>}
    </li>
  );
}

/** Lo que se puede hacer con una fila o una columna elegida (o nada elegido). */
function OtraSeleccion({ seleccion, dato, trabajando, filaTitulos, onFilaTitulos, motivo, onMotivo, productoActivo, inicioActual, onSoltar, onInicio, onIgnorarFila, onIgnorarColumna }: {
  seleccion: SeleccionGrilla | null;
  dato: DatoArrastrado | null;
  trabajando: boolean;
  filaTitulos: number;
  onFilaTitulos: (n: number) => void;
  motivo: string;
  onMotivo: (m: string) => void;
  productoActivo: number;
  inicioActual?: number;
  onSoltar: (destino: DestinoDato, dato: DatoArrastrado) => void;
  onInicio: (fila: number | null) => void;
  onIgnorarFila: (fila: number) => void;
  onIgnorarColumna: (columna: number) => void;
}) {
  if (!seleccion) return <p className="rounded-md bg-ink-50 px-3 py-2.5 text-[11.5px] text-ink-600">Haz clic en una fila del archivo que sea un producto.</p>;
  const motivoValido = motivo.trim().length >= MOTIVO_MINIMO;
  const campoMotivo = <input value={motivo} maxLength={200} onChange={(e) => onMotivo(e.target.value)} placeholder="Motivo (p. ej. «Pie del informe sin datos»)" className={claseCampo} />;
  if (seleccion.tipo === "fila") {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-ink-150 bg-white p-3">
        <p className="font-medium text-ink-800">Fila {seleccion.fila}</p>
        <p className="text-[11px] text-ink-500">Para ver las partes de su texto, haz clic en la celda (no en el número).</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={claseBoton} disabled={trabajando} onClick={() => onInicio(seleccion.fila)}>Aquí empieza el producto {productoActivo + 1}</button>
          {inicioActual === seleccion.fila && <button type="button" className={claseBoton} disabled={trabajando} onClick={() => onInicio(null)}>Quitar inicio</button>}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-ink-100 pt-2">
          <span className="text-[11px] text-ink-600">No es inventario (título, pie del informe…): ignorar esta fila con un motivo.</span>
          <div className="flex gap-1.5">{campoMotivo}<button type="button" className={claseBoton} disabled={trabajando || !motivoValido} onClick={() => onIgnorarFila(seleccion.fila)}>Ignorar</button></div>
        </div>
      </div>
    );
  }
  if (seleccion.tipo !== "columna") return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-150 bg-white p-3">
      <p className="font-medium text-ink-800">Columna {letraColumna(seleccion.columna)} entera</p>
      <p className="text-[11px] leading-relaxed text-ink-500">Úsala solo si la columna trae UN dato por fila. Si sus celdas mezclan varios datos, haz clic en una celda y asigna sus partes.</p>
      <label className="flex items-center gap-2 text-[11.5px] text-ink-600">Fila de títulos
        <input inputMode="numeric" value={filaTitulos} onChange={(e) => onFilaTitulos(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))} className={`${claseCampo} w-20`} />
      </label>
      {dato && (
        <div className="flex flex-wrap gap-1.5">
          {ROLES_LECTURA_INVENTARIO.map((rol) => (
            <button key={rol} type="button" disabled={trabajando} onClick={() => onSoltar({ tipo: "rol", rol }, dato)} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${COLOR_ROL[rol]} hover:brightness-95 disabled:opacity-50`}>
              {INICIAL_ROL[rol]} · {ETIQUETA_ROL[rol]}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5 border-t border-ink-100 pt-2">
        <span className="text-[11px] text-ink-600">No es inventario: ignorar esta columna con un motivo.</span>
        <div className="flex gap-1.5">{campoMotivo}<button type="button" className={claseBoton} disabled={trabajando || !motivoValido} onClick={() => onIgnorarColumna(seleccion.columna)}>Ignorar</button></div>
      </div>
    </div>
  );
}

/** Títulos de sección, totales y lo que se ignora. */
function Marcas({ modelo, textos, trabajando, hayDato, dato, onSoltar, onModelo }: {
  modelo: ModeloUsuarioInventario;
  textos: ReadonlyMap<string, string>;
  trabajando: boolean;
  hayDato: boolean;
  dato: DatoArrastrado | null;
  onSoltar: (destino: DestinoDato, dato: DatoArrastrado) => void;
  onModelo: (m: ModeloUsuarioInventario) => void;
}) {
  const valor = (m: { fila: number; columna: number; inicio?: number; fin?: number }) => {
    const t = textos.get(clave(m.fila, m.columna));
    if (!t) return `${letraColumna(m.columna)}${m.fila}`;
    return `«${t.slice(...nucleoTramo(t, m.inicio, m.fin)).slice(0, 40)}» · ${letraColumna(m.columna)}${m.fila}`;
  };
  const quitar = (accion: () => ModeloUsuarioInventario) => <button type="button" disabled={trabajando} onClick={() => onModelo(accion())} className="rounded px-1 text-ink-500 hover:bg-err-100/40 hover:text-err-700" aria-label="Quitar">×</button>;
  const zona = (destino: DestinoDato, etiqueta: string) => (
    <button
      type="button"
      disabled={trabajando}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME_DATO)) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); try { onSoltar(destino, JSON.parse(e.dataTransfer.getData(MIME_DATO)) as DatoArrastrado); } catch { /* no es un dato del archivo */ } }}
      onClick={() => { if (hayDato && dato) onSoltar(destino, dato); }}
      className="rounded-md border border-dashed border-ink-300 bg-white px-2 py-1.5 text-left text-[11.5px] text-ink-500 hover:border-blue-400"
    >
      {etiqueta}
    </button>
  );
  const hayMarcas = modelo.secciones.length > 0 || modelo.totales.length > 0 || modelo.ignorarFilas.length > 0 || modelo.ignorarColumnas.length > 0;
  return (
    <details className="rounded-md border border-ink-150 bg-white p-3 text-[11.5px]" open={hayMarcas}>
      <summary className="cursor-pointer font-medium text-ink-800">Títulos de sección, totales y lo que no es inventario{hayMarcas ? "" : " (opcional)"}</summary>
      <p className="mt-1.5 text-[11px] text-ink-500">Si el tipo viene en un título encima de los productos, o el archivo trae un total al final, suelta aquí esa parte.</p>
      <div className="mt-2 grid grid-cols-1 gap-2 @md:grid-cols-3">
        {zona({ tipo: "seccion" }, "Título de sección (tipo)")}
        {zona({ tipo: "total", subtipo: "general" }, "Total general")}
        {zona({ tipo: "total", subtipo: "subtotal" }, "Subtotal")}
      </div>
      {hayMarcas && (
        <ul className="mt-2 space-y-1">
          {modelo.secciones.map((s, i) => <li key={`s${i}`} className="flex items-center gap-2"><span className="rounded border border-navy-500 px-1 text-[10px] font-semibold text-navy-700">Sec.</span><span className="min-w-0 flex-1 truncate">{valor(s)}</span>{quitar(() => ({ ...modelo, secciones: modelo.secciones.filter((_, n) => n !== i) }))}</li>)}
          {modelo.totales.map((t, i) => <li key={`t${i}`} className="flex items-center gap-2"><span className="rounded border border-navy-500 px-1 text-[10px] font-semibold text-navy-700">Σ</span><span className="min-w-0 flex-1 truncate">{t.tipo === "general" ? "Total general" : "Subtotal"}: {valor(t)}</span>{quitar(() => ({ ...modelo, totales: modelo.totales.filter((_, n) => n !== i) }))}</li>)}
          {modelo.ignorarFilas.map((f, i) => <li key={`f${i}`} className="flex items-center gap-2 text-ink-600"><span className="min-w-0 flex-1 truncate">Fila {f.fila} ignorada · {f.motivo}</span>{quitar(() => ({ ...modelo, ignorarFilas: modelo.ignorarFilas.filter((_, n) => n !== i) }))}</li>)}
          {modelo.ignorarColumnas.map((c, i) => <li key={`c${i}`} className="flex items-center gap-2 text-ink-600"><span className="min-w-0 flex-1 truncate">Columna {letraColumna(c.columna)} ignorada · {c.motivo}</span>{quitar(() => ({ ...modelo, ignorarColumnas: modelo.ignorarColumnas.filter((_, n) => n !== i) }))}</li>)}
        </ul>
      )}
    </details>
  );
}
