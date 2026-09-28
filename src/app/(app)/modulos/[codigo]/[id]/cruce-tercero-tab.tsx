"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { BotonPantallaCompleta, CLASE_TARJETA, claseScrollTabla, propsRegionPantallaCompleta, usePantallaCompletaTabla } from "@/components/tabla-pantalla-completa";
import { fmtContable } from "@/lib/format";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/client-notifications";
import { quitarEmparejamientoTercero, quitarMarcaCruce, separarTerceroAutomatico } from "@/app/actions/modulos-datos";
import type { EstadoCruceTercero } from "@/lib/modulos/cartera/cruce-tercero-cartera";
import { describirSenales } from "@/lib/modulos/cartera/coherencia-tercero";
import { coincidenciaTercero, type CoincidenciaTercero } from "@/lib/modulos/cartera/coincidencia-tercero";
import { anclaCruceTercero, type FilaCruceTerceroMarcada, type ResumenMarcas } from "@/lib/modulos/marcas-cruce";
import type { EmparejamientoTerceroVm, ResumenCruceTerceroMarcado } from "@/lib/modulos/cruce-tercero-servidor";
import { MenuAccionesFila, type AccionMenuFila } from "@/components/menu-acciones-fila";
import { CeldaMarcaTercero, ModalMarcaTercero, ObservacionesMarcasTercero } from "./marca-tercero";
import type { ReferenciaMarcaVm } from "./soportes-marca";
import { ModalEmparejarTercero } from "./emparejar-tercero";
import { ModalValidarCoherencia } from "./validar-coherencia-tercero";
import { ParametrosCargue, type ParametrosCargueVm } from "./parametros-cargue";
import { AlcanceCuentasTercero } from "./alcance-cuentas-tercero";
import type { AlcanceCruceTercero } from "@/lib/modulos/cartera/alcance-cruce-tercero";
import { HeaderOrdenable } from "../listado-compartido";
import {
  direccionInicialCruceTercero,
  ordenarCruceTercero,
  siguienteOrdenCruce,
  type ColumnaCruceTercero,
  type OrdenCruce,
} from "@/lib/modulos/orden-cruce";

// Cruce por tercero: el balance por terceros ligado al balance del período contra el auxiliar
// del módulo, un renglón por tercero. Lo calcula `cruce-tercero-servidor.ts` con el mismo
// balance y las mismas compuertas del cruce contable. Las diferencias se explican con marcas
// y los terceros que el auxiliar trae con otra identificación se emparejan: solos cuando la
// diferencia es el dígito de verificación (reversible con «Separar»), y a mano —uno a uno o en
// lote desde «Validar coherencia…»— cuando la evidencia es el saldo, un sufijo o el nombre.
export type CruceTerceroVm = {
  aplica: boolean;
  periodo: string;
  nombreCliente: string;
  estado: "sin_balance" | "sin_detalle_tercero" | "bloqueado" | "listo";
  mensaje: string | null;
  /** Balance de comprobación del período (el mismo del cruce contable). */
  balance: { id: number; version: string; periodoFin: string; esOficial: boolean; estaCongelado: boolean; descripcion: string } | null;
  /** Cartera y CxP: por qué se cruza contra esta versión del balance (no es la oficial, o hay varias). */
  avisoBalance: string | null;
  balanceTercero: { id: number; version: string } | null;
  resumen: ResumenCruceTerceroMarcado | null;
  /** Diferencias que exigen marca para cerrar, y cuántas la tienen. */
  resumenMarcas: ResumenMarcas | null;
  emparejamientos: EmparejamientoTerceroVm[];
  /** Umbral de descuadre desde el que una diferencia exige marca. */
  umbralDescuadre: number;
  /** Fecha de corte y divisa del cargue (Cartera, CxP); null en los demás módulos. */
  parametros: ParametrosCargueVm | null;
  contableExcluidoFilas: number;
  /** Cuentas marcadas «no modulares» en el cruce contable: sus NIT no se listan. */
  contableNoModular: { total: number; filas: number; cuentas: string[] };
  moduloDerivadoDelDetalle: boolean;
  moduloNoAtribuido: number;
  /** Qué cuentas se tienen en cuenta en el cruce y qué queda fuera (panel plegado «Cuentas en este cruce»). */
  alcance: AlcanceCruceTercero | null;
  /** La conciliación del período está en firme: rige la lista de cuentas guardada al cerrar. */
  listaDelCierre: boolean;
  /** Filtros de cuentas del módulo (con regreso a esta pestaña), si el usuario los administra. */
  enlaceCuentasModulo: { href: string; modulo: string } | null;
  /** Se vuelve de Filtros de cuentas: el panel de cuentas abre desplegado. */
  abrirPanelCuentas: boolean;
  /** Rótulos de la clave del cruce: «NIT»/«Nombre», o «Cédula»/«Empleado» en Nómina. */
  etiquetaClave: string;
  etiquetaNombre: string;
};

type Filtro = "todos" | EstadoCruceTercero | "sin_nit" | "por_dv" | "por_nucleo" | "sugeridos" | "pendientes";

const PAGINA = 200;

const ESTADO: Record<EstadoCruceTercero, { label: string; tone: "ok" | "warn" | "err" | "ink" }> = {
  cuadra: { label: "Cuadra", tone: "ok" },
  descuadre: { label: "Diferencia", tone: "err" },
  solo_contable: { label: "Solo en contabilidad", tone: "warn" },
  solo_modulo: { label: "Solo en el módulo", tone: "warn" },
  sin_saldo: { label: "Sin saldo", tone: "ink" },
};

/** Cómo aparece el tercero propuesto dentro del texto de la burbuja (ver `nombrar` en coincidencia-tercero). */
const textoDelPropuesto = (p: { clave: string; nombre: string | null }) =>
  p.clave.startsWith("~") ? `«${p.nombre ?? p.clave.slice(1)}»` : p.clave;

/**
 * Pinta `texto` con cada aparición de `token` como enlace. Un NIT solo cuenta completo: no se
 * enlaza si va pegado a otros dígitos (4195414 dentro de 41954149).
 */
function TextoConEnlace({ texto, token, onIr }: { texto: string; token: string | null; onIr: () => void }) {
  if (!token) return <>{texto}</>;
  const partes: React.ReactNode[] = [];
  let desde = 0;
  for (let i = texto.indexOf(token); i >= 0; i = texto.indexOf(token, i + token.length)) {
    const fin = i + token.length;
    if (/\d/.test(texto[i - 1] ?? "") || /\d/.test(texto[fin] ?? "")) continue;
    partes.push(texto.slice(desde, i));
    partes.push(
      <button
        key={i}
        type="button"
        onClick={onIr}
        className="font-semibold text-blue-700 underline decoration-dotted underline-offset-2 hover:decoration-solid"
        title="Ir a este tercero en la tabla"
      >
        {token}
      </button>,
    );
    desde = fin;
  }
  partes.push(texto.slice(desde));
  return <>{partes}</>;
}

/**
 * El % de coincidencia del renglón: verde si cruzó bien, ámbar a medias, rojo si no cruzó con
 * nada; azul si solo hay un candidato. Contra qué se calculó aparece SOLO al pasar el mouse (una
 * burbuja fija al viewport, para que la tabla con scroll no la recorte). El tercero del otro lado
 * que nombra la burbuja es un enlace a su renglón, así que la burbuja se deja alcanzar con el mouse.
 */
function PorcentajeCoincidencia({ coincidencia, onIrATercero }: { coincidencia: CoincidenciaTercero | null; onIrATercero: (clave: string) => void }) {
  const [burbuja, setBurbuja] = useState<{ top: number; left: number } | null>(null);
  const cierre = useRef<number | null>(null);
  if (!coincidencia) return null;
  const { porcentaje, tipo, propuesto } = coincidencia;
  const color = tipo === "candidato"
    ? "border-blue-400 bg-blue-50 text-blue-500"
    : porcentaje >= 95 ? "border-ok-500 bg-ok-100 text-ok-700"
      : porcentaje >= 60 ? "border-warn-500 bg-warn-100 text-warn-700"
        : "border-err-500 bg-err-100 text-err-700";
  const etiqueta = tipo === "candidato" ? `${porcentaje} % candidato` : tipo === "sin_cruce" ? "0 % sin cruce" : `${porcentaje} %`;
  const ANCHO = 300;
  const cancelarCierre = () => {
    if (cierre.current != null) window.clearTimeout(cierre.current);
    cierre.current = null;
  };
  const mostrar = (e: React.MouseEvent<HTMLSpanElement> | React.FocusEvent<HTMLSpanElement>) => {
    cancelarCierre();
    const r = e.currentTarget.getBoundingClientRect();
    setBurbuja({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8)) });
  };
  // Un respiro antes de cerrar: el mouse cruza el hueco entre el % y la burbuja para llegar al enlace.
  const ocultar = () => {
    cancelarCierre();
    cierre.current = window.setTimeout(() => setBurbuja(null), 150);
  };
  const token = propuesto ? textoDelPropuesto(propuesto) : null;
  const ir = () => {
    cancelarCierre();
    setBurbuja(null);
    if (propuesto) onIrATercero(propuesto.clave);
  };
  return (
    <span
      tabIndex={0}
      onMouseEnter={mostrar}
      onFocus={mostrar}
      onMouseLeave={ocultar}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) ocultar(); }}
      className={`inline-flex cursor-help items-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums outline-none ${color}`}
    >
      {etiqueta}
      {burbuja && (
        <span
          role="tooltip"
          style={{ top: burbuja.top, left: burbuja.left, width: ANCHO }}
          className="fixed z-50 max-w-[calc(100vw-1rem)] cursor-default rounded-md border border-ink-200 bg-white px-3 py-2 text-left text-[11.5px] font-normal leading-snug text-ink-600 shadow-lg"
        >
          <span className="mb-1 block font-semibold text-ink-800"><TextoConEnlace texto={coincidencia.contra} token={token} onIr={ir} /></span>
          <TextoConEnlace texto={coincidencia.explicacion} token={token} onIr={ir} />
        </span>
      )}
    </span>
  );
}

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const contar = (n: number) => n.toLocaleString("es-CO");

function cumpleFiltro(fila: FilaCruceTerceroMarcada, filtro: Filtro): boolean {
  if (filtro === "todos") return true;
  if (filtro === "sin_nit") return fila.sinNit;
  if (filtro === "por_dv") return fila.claveModuloPorDv != null;
  if (filtro === "por_nucleo") return fila.claveModuloPorNucleo != null;
  if (filtro === "sugeridos") return fila.sugerencia != null;
  if (filtro === "pendientes") return fila.requiereMarca && (!fila.marca || fila.desactualizada);
  return fila.estado === filtro;
}

function filtrarTerceros(filas: FilaCruceTerceroMarcada[], filtro: Filtro, busqueda: string, verSinSaldo: boolean) {
  const consulta = normalizar(busqueda);
  const ocultarSinSaldo = filtro === "todos" && !verSinSaldo && !consulta;
  return filas.filter((f) =>
    cumpleFiltro(f, filtro)
    && !(ocultarSinSaldo && f.estado === "sin_saldo")
    && (!consulta || normalizar(`${f.clave} ${f.nombre ?? ""}`).includes(consulta)));
}

function EstadoVacio({ titulo, children, enlace }: { titulo: string; children: React.ReactNode; enlace: { href: string; texto: string } }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <div className="text-[13px] font-semibold text-ink-800">{titulo}</div>
      <p className="max-w-2xl text-[12.5px] text-ink-500">{children}</p>
      <Link href={enlace.href} className="mt-1 text-[12.5px] font-semibold text-blue-700 hover:underline">{enlace.texto}</Link>
    </Card>
  );
}

export function CruceTerceroTab({
  cruceTercero,
  referenciasMarcas = [],
  cuentasPeriodo = [],
  encabezadoId,
  comentarios,
  puedeEditar,
  onIrConsolidado,
}: {
  cruceTercero: CruceTerceroVm;
  /** Todas las marcas del período (numeración compartida con el cruce contable). */
  referenciasMarcas?: ReferenciaMarcaVm[];
  /** Cuentas fuera de la cédula que el Consolidado asignó solo para este período. */
  cuentasPeriodo?: string[];
  encabezadoId: number;
  comentarios: Record<string, number>;
  puedeEditar: boolean;
  onIrConsolidado?: () => void;
}) {
  const router = useRouter();
  const { resumen, balance, resumenMarcas } = cruceTercero;
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [limite, setLimite] = useState(PAGINA);
  // Terceros en cero en los dos lados: ocultos de entrada. Se ven con su tarjeta, al buscarlos o a pedido.
  const [verSinSaldo, setVerSinSaldo] = useState(false);
  const [marcando, setMarcando] = useState<FilaCruceTerceroMarcada | null>(null);
  // Tercero suelto que se está emparejando y, si se abrió desde el renglón con diferencia, su destino.
  const [emparejando, setEmparejando] = useState<{ fila: FilaCruceTerceroMarcada; destino: string | null } | null>(null);
  // Orden por columna elegido en el encabezado (null = el del sistema: diferencias primero).
  const [orden, setOrden] = useState<OrdenCruce<ColumnaCruceTercero>>(null);
  const [validando, setValidando] = useState(false);
  const [ocupado, startAccion] = useTransition();
  const { pantallaCompleta, alternar: alternarPantallaCompleta } = usePantallaCompletaTabla();
  // Al filtrar, la tabla vuelve arriba: en pantalla completa es ella la que scrollea y, si no,
  // se aterriza a mitad de una lista que ya es otra.
  const tablaRef = useRef<HTMLDivElement>(null);
  const alInicioDeLaTabla = () => tablaRef.current?.scrollTo({ top: 0 });

  const filtradas = useMemo(
    () => (resumen ? ordenarCruceTercero(filtrarTerceros(resumen.filas, filtro, busqueda, verSinSaldo), orden) : []),
    [resumen, filtro, busqueda, verSinSaldo, orden],
  );
  const ordenar = (columna: ColumnaCruceTercero) => {
    setOrden((actual) => siguienteOrdenCruce(actual, columna, direccionInicialCruceTercero(columna)));
    setLimite(PAGINA);
    alInicioDeLaTabla();
  };

  // Salto a un tercero desde la burbuja del %: si el filtro o la búsqueda lo esconden se quitan,
  // se amplía la página hasta alcanzarlo y, ya pintado, se lleva a la vista y se resalta un momento.
  const [destacada, setDestacada] = useState<string | null>(null);
  const pendienteScrollRef = useRef<string | null>(null);
  const irATercero = (clave: string) => {
    const fila = resumen?.filas.find((f) => f.clave === clave);
    if (!resumen || !fila) {
      notifyInfo("Ese tercero no aparece en este cruce.");
      return;
    }
    let lista = filtradas;
    if (!lista.includes(fila)) {
      const verTodos = verSinSaldo || fila.estado === "sin_saldo";
      setFiltro("todos");
      setBusqueda("");
      setVerSinSaldo(verTodos);
      lista = ordenarCruceTercero(filtrarTerceros(resumen.filas, "todos", "", verTodos), orden);
    }
    const i = lista.indexOf(fila);
    if (i >= limite) setLimite(Math.ceil((i + 1) / PAGINA) * PAGINA);
    pendienteScrollRef.current = clave;
    setDestacada(clave);
  };
  // Sin dependencias: la fila puede montarse uno o dos renders después del salto; el ref hace
  // que este efecto sea inocuo el resto del tiempo.
  useEffect(() => {
    const clave = pendienteScrollRef.current;
    if (clave == null) return;
    const fila = Array.from(tablaRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-clave]") ?? [])
      .find((tr) => tr.dataset.clave === clave);
    if (!fila) return;
    pendienteScrollRef.current = null;
    fila.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  });
  useEffect(() => {
    if (!destacada) return;
    const t = window.setTimeout(() => setDestacada(null), 2500);
    return () => window.clearTimeout(t);
  }, [destacada]);
  const coincidencias = useMemo(
    () => new Map((resumen?.filas ?? []).map((f) => [f.clave, coincidenciaTercero(f)] as const)),
    [resumen],
  );
  const cantidadSinSaldo = useMemo(() => (resumen?.filas ?? []).filter((f) => f.estado === "sin_saldo").length, [resumen]);
  const observaciones = useMemo(
    () => (resumen?.filas ?? []).filter((f) => f.marca != null).sort((a, b) => a.marca!.numero - b.marca!.numero),
    [resumen],
  );
  const candidatosBalance = useMemo(
    () => (resumen?.filas ?? []).filter((f) => Object.keys(f.contable.porCuenta).length > 0),
    [resumen],
  );
  // Para emparejar un tercero que solo está en la contabilidad: los que tienen saldo en el auxiliar.
  const candidatosAuxiliar = useMemo(() => (resumen?.filas ?? []).filter((f) => f.modulo.total !== 0), [resumen]);
  const emparejamientoPorClave = useMemo(
    () => new Map(cruceTercero.emparejamientos.filter((e) => e.tipo === "union").map((e) => [e.claveModulo, e])),
    [cruceTercero.emparejamientos],
  );
  const separacionPorClave = useMemo(
    () => new Map(cruceTercero.emparejamientos.filter((e) => e.tipo === "separacion").map((e) => [e.claveModulo, e])),
    [cruceTercero.emparejamientos],
  );
  // Terceros de la contabilidad sumados a otro renglón: la clave de la contabilidad va en `claveModulo`.
  const inclusionContablePorClave = useMemo(
    () => new Map(cruceTercero.emparejamientos.filter((e) => e.tipo === "union_contable").map((e) => [e.claveModulo, e])),
    [cruceTercero.emparejamientos],
  );
  const filaPorClave = useMemo(() => new Map((resumen?.filas ?? []).map((f) => [f.clave, f])), [resumen]);

  const quitarMarca = (fila: FilaCruceTerceroMarcada) => {
    startAccion(async () => {
      const r = await quitarMarcaCruce({ encabezadoId, clave: fila.clave });
      if (r.ok) notifySuccess(r.message ?? "Marca retirada.");
      else notifyError(r.message ?? "No se pudo retirar la marca.");
      router.refresh();
    });
  };
  // Marca de tercero cuyo renglón ya no aparece en el cruce: se retira desde las observaciones.
  const quitarMarcaHuerfana = (marca: ReferenciaMarcaVm) => {
    startAccion(async () => {
      const r = await quitarMarcaCruce({ encabezadoId, clave: marca.llave });
      if (r.ok) notifySuccess(r.message ?? "Marca retirada.");
      else notifyError(r.message ?? "No se pudo retirar la marca.");
      router.refresh();
    });
  };
  const deshacerEmparejamiento = (emparejamiento: EmparejamientoTerceroVm) => {
    startAccion(async () => {
      const r = await quitarEmparejamientoTercero({ encabezadoId, emparejamientoId: emparejamiento.id });
      if (r.ok) notifySuccess(r.message ?? "Emparejamiento deshecho.");
      else notifyError(r.message ?? "No se pudo deshacer el emparejamiento.");
      router.refresh();
    });
  };
  // Separar un par unido solo (por DV o por núcleo): memoria del cliente para todos sus períodos,
  // porque la forma en que cada lado escribe el NIT es del ERP, no del mes.
  const separar = (fila: FilaCruceTerceroMarcada, claveModulo: string) => {
    startAccion(async () => {
      const r = await separarTerceroAutomatico({ encabezadoId, claveModulo, claveBalance: fila.clave, alcance: "todos" });
      if (r.ok) notifySuccess(r.message ?? "Terceros separados.");
      else notifyError(r.message ?? "No se pudieron separar.");
      router.refresh();
    });
  };

  // Acciones aplicables a la fila, llevadas al menú "⋯": una por cada emparejamiento/separación
  // vigente, con el destino explícito en la etiqueta para no confundir cuando hay varios.
  const accionesFila = (fila: FilaCruceTerceroMarcada): AccionMenuFila[] => {
    const acciones: AccionMenuFila[] = [];
    if (fila.claveModuloPorDv) {
      const claveModulo = fila.claveModuloPorDv;
      acciones.push({
        id: `separar-dv-${claveModulo}`,
        icono: "x",
        etiqueta: `Separar de ${claveModulo} (por DV)`,
        descripcion: `Unido con ${claveModulo} del auxiliar: su NIT más el dígito de verificación es este. Si no es el mismo tercero, sepáralos.`,
        ejecutar: () => separar(fila, claveModulo),
        deshabilitada: ocupado,
      });
    }
    if (fila.claveModuloPorNucleo) {
      const claveModulo = fila.claveModuloPorNucleo;
      acciones.push({
        id: `separar-nucleo-${claveModulo}`,
        icono: "x",
        etiqueta: "Deshacer",
        descripcion: `Emparejado con ${claveModulo} del auxiliar por sus nueve primeros dígitos: revisa que sea el mismo tercero.`,
        ejecutar: () => separar(fila, claveModulo),
        deshabilitada: ocupado,
      });
    }
    fila.separadoDe.forEach((claveModulo) => {
      const separacion = separacionPorClave.get(claveModulo);
      if (!separacion) return;
      acciones.push({
        id: `unir-${claveModulo}`,
        icono: "link",
        etiqueta: `Volver a unir con ${claveModulo}`,
        descripcion: `Separado por ${separacion.creadoPor ?? "—"} · ${separacion.creadoEn} · ${separacion.periodo ? `solo ${separacion.periodo}` : "todos los períodos"}.`,
        ejecutar: () => deshacerEmparejamiento(separacion),
        deshabilitada: ocupado,
      });
    });
    fila.emparejadoDesde.forEach((claveModulo) => {
      const emparejamiento = emparejamientoPorClave.get(claveModulo);
      if (!emparejamiento) return;
      const nombre = claveModulo.startsWith("~") ? (emparejamiento.nombreModulo ?? claveModulo.slice(1)) : claveModulo;
      acciones.push({
        id: `deshacer-${claveModulo}`,
        icono: "x",
        etiqueta: `Deshacer inclusión de ${nombre}`,
        descripcion: `Emparejado por ${emparejamiento.creadoPor ?? "—"} · ${emparejamiento.creadoEn} · ${emparejamiento.periodo ? `solo ${emparejamiento.periodo}` : "todos los períodos"}${emparejamiento.nota ? ` · ${emparejamiento.nota}` : ""}`,
        ejecutar: () => deshacerEmparejamiento(emparejamiento),
        deshabilitada: ocupado,
      });
    });
    fila.incluyeContable.forEach((claveContable) => {
      const inclusion = inclusionContablePorClave.get(claveContable);
      if (!inclusion) return;
      acciones.push({
        id: `deshacer-contable-${claveContable}`,
        icono: "x",
        etiqueta: `Deshacer inclusión de ${claveContable} (contabilidad)`,
        descripcion: `Sumado desde la contabilidad por ${inclusion.creadoPor ?? "—"} · ${inclusion.creadoEn} · ${inclusion.periodo ? `solo ${inclusion.periodo}` : "todos los períodos"}${inclusion.nota ? ` · ${inclusion.nota}` : ""}`,
        ejecutar: () => deshacerEmparejamiento(inclusion),
        deshabilitada: ocupado,
      });
    });
    if (fila.estado === "solo_modulo" || fila.estado === "solo_contable") {
      acciones.push({
        id: "emparejar",
        icono: "link",
        etiqueta: "Emparejar…",
        descripcion: fila.estado === "solo_contable"
          ? "Es el mismo tercero que otro del auxiliar, registrado con otro NIT en la contabilidad: su saldo se suma a ese renglón."
          : "Es el mismo tercero que otro de la contabilidad, registrado con otra identificación en el auxiliar.",
        ejecutar: () => setEmparejando({ fila, destino: null }),
      });
    }
    // Renglón con diferencia que un tercero suelto explica al centavo: se incluye desde aquí.
    const compensa = fila.estado === "descuadre" && fila.explicaDiferencia?.rol === "suelto" ? fila.explicaDiferencia : null;
    const suelto = compensa ? filaPorClave.get(compensa.clave) : undefined;
    if (compensa && suelto) {
      acciones.push({
        id: `incluir-${compensa.clave}`,
        icono: "link",
        etiqueta: `Incluir ${compensa.clave} ${compensa.ladoSuelto === "contable" ? "de la contabilidad" : "del auxiliar"}…`,
        descripcion: `Su saldo (${fmtContable(compensa.importe)}) es exactamente la diferencia de este renglón: probablemente es el mismo tercero con otro NIT.`,
        ejecutar: () => setEmparejando({ fila: suelto, destino: fila.clave }),
      });
    }
    return acciones;
  };

  if (cruceTercero.estado === "sin_balance" || !balance) {
    return (
      <EstadoVacio titulo="No hay balance de comprobación confirmado para este período" enlace={{ href: "/balance", texto: "Ir a Balance de comprobación →" }}>
        No hay un balance confirmado para <b className="text-ink-700">{cruceTercero.nombreCliente}</b> en el período <b className="text-ink-700">{cruceTercero.periodo}</b>. El cruce por tercero usa el mismo balance que el cruce contable.
      </EstadoVacio>
    );
  }
  if (cruceTercero.estado !== "listo" || !resumen) {
    return (
      <EstadoVacio
        titulo={cruceTercero.estado === "bloqueado" ? "Cruce por tercero no habilitado" : "El balance del período no tiene detalle por tercero"}
        enlace={{ href: `/balance/${balance.id}`, texto: `Revisar balance ${balance.descripcion} →` }}
      >
        <span className={cruceTercero.estado === "bloqueado" ? "text-warn-700" : undefined}>{cruceTercero.mensaje}</span>
        {cruceTercero.avisoBalance ? <span className="mt-1 block text-warn-700">{cruceTercero.avisoBalance}</span> : null}
      </EstadoVacio>
    );
  }

  const { conteo, totales, cuentas } = resumen;
  const mostrarCuentas = cuentas.length > 1;
  const delPeriodo = new Set(cuentasPeriodo);
  const cuentasDelPeriodo = cuentas.filter((c) => delPeriodo.has(c));
  const sumaDe = (estado: EstadoCruceTercero, lado: (f: FilaCruceTerceroMarcada) => number) =>
    resumen.filas.filter((f) => f.estado === estado).reduce((suma, f) => suma + lado(f), 0);
  const porMarcar = resumenMarcas ? resumenMarcas.pendientes + resumenMarcas.desactualizadas : 0;
  const tarjetas: { filtro: Filtro; titulo: string; cantidad: number; monto: number | null; tono: string }[] = [
    { filtro: "cuadra", titulo: "Cuadran", cantidad: conteo.cuadra, monto: null, tono: "text-ok-700" },
    { filtro: "descuadre", titulo: "Con diferencia", cantidad: conteo.descuadre, monto: sumaDe("descuadre", (f) => Math.abs(f.diferencia)), tono: "text-err-700" },
    { filtro: "solo_contable", titulo: "Solo en contabilidad", cantidad: conteo.solo_contable, monto: sumaDe("solo_contable", (f) => f.contable.total), tono: "text-warn-700" },
    { filtro: "solo_modulo", titulo: "Solo en el módulo", cantidad: conteo.solo_modulo, monto: sumaDe("solo_modulo", (f) => f.modulo.total), tono: "text-warn-700" },
    ...(resumenMarcas && resumenMarcas.conDiferencia > 0
      ? [{ filtro: "pendientes" as const, titulo: "Por marcar para cerrar", cantidad: porMarcar, monto: porMarcar > 0 ? resumenMarcas.montoPendiente : null, tono: porMarcar > 0 ? "text-err-700" : "text-ok-700" }]
      : []),
    ...(resumen.sinNit > 0 ? [{ filtro: "sin_nit" as const, titulo: "Sin NIT", cantidad: resumen.sinNit, monto: null, tono: "text-ink-700" }] : []),
    ...(resumen.porDv > 0 ? [{ filtro: "por_dv" as const, titulo: "Emparejados por DV", cantidad: resumen.porDv, monto: null, tono: "text-warn-700" }] : []),
    ...(resumen.porNucleo > 0 ? [{ filtro: "por_nucleo" as const, titulo: "Emparejados por núcleo", cantidad: resumen.porNucleo, monto: null, tono: "text-warn-700" }] : []),
    ...(resumen.sugerencias.length > 0 ? [{ filtro: "sugeridos" as const, titulo: "Coincidencias por validar", cantidad: resumen.sugerencias.length * 2, monto: null, tono: "text-blue-700" }] : []),
    ...(cantidadSinSaldo > 0 ? [{ filtro: "sin_saldo" as const, titulo: "Sin saldo", cantidad: cantidadSinSaldo, monto: null, tono: "text-ink-500" }] : []),
  ];
  const elegir = (siguiente: Filtro) => {
    setFiltro((actual) => (actual === siguiente ? "todos" : siguiente));
    setLimite(PAGINA);
    alInicioDeLaTabla();
  };

  const fuera = resumen.contableFueraDelModulo;
  const sinTercero = resumen.contableSinTercero;
  const contableGrupo = totales.contable + fuera.total + sinTercero.total;
  const columnas = 7 + (mostrarCuentas ? cuentas.length : 0);
  const encabezado = (label: string, columna: ColumnaCruceTercero, alineacion: "left" | "right" = "left", title?: string) => (
    <HeaderOrdenable
      label={label}
      columna={columna}
      activa={orden?.columna ?? null}
      direccion={orden?.direccion ?? "desc"}
      onOrdenar={ordenar}
      alineacion={alineacion}
      title={title ?? "Ordenar por esta columna. Tercer clic: vuelve al orden del sistema."}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11.5px] text-ink-500">
        Lado contable: balance <b className="text-ink-700">{balance.descripcion}</b>
        {balance.esOficial ? " · oficial" : ""}{balance.estaCongelado ? " · congelado" : ""}
        {cruceTercero.balanceTercero ? <> · detalle por tercero <b className="text-ink-700">{cruceTercero.balanceTercero.version}</b></> : null}
        {" · "}
        <Link href={`/balance/${balance.id}/terceros`} className="font-semibold text-blue-700 hover:underline">Ver por terceros</Link>
      </p>
      {cruceTercero.avisoBalance && (
        <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] leading-snug text-warn-700">{cruceTercero.avisoBalance}</div>
      )}
      {cuentasDelPeriodo.length > 0 && (
        <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] leading-snug text-warn-700">
          {cuentasDelPeriodo.length === 1 ? "La cuenta" : "Las cuentas"} <b>{cuentasDelPeriodo.map((c) => `R - ${c}`).join(", ")}</b>{" "}
          {cuentasDelPeriodo.length === 1 ? "no está" : "no están"} entre las cuentas que concilia el módulo: el Consolidado {cuentasDelPeriodo.length === 1 ? "la asignó" : "las asignó"} solo
          para {cruceTercero.periodo}, así que sus terceros entran a este cruce únicamente en ese período.
        </div>
      )}
      {cruceTercero.parametros && (
        <ParametrosCargue parametros={cruceTercero.parametros} encabezadoId={encabezadoId} puedeEditar={puedeEditar} />
      )}

      {resumenMarcas && (resumenMarcas.conDiferencia > 0 || (resumenMarcas.bajoUmbral ?? 0) > 0) && (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2 text-[12px] ${
            porMarcar === 0 ? "border-ok-500 bg-ok-100/30 text-ok-700" : "border-warn-500 bg-warn-100/30 text-warn-700"
          }`}
        >
          <span className="font-semibold">
            {resumenMarcas.marcadas} de {resumenMarcas.conDiferencia} {resumenMarcas.conDiferencia === 1 ? "diferencia" : "diferencias"} desde {fmtContable(cruceTercero.umbralDescuadre)} con marca
          </span>
          {resumenMarcas.pendientes > 0 && (
            <span>Sin marcar: <b>{resumenMarcas.pendientes}</b> ({fmtContable(resumenMarcas.montoPendiente)})</span>
          )}
          {resumenMarcas.desactualizadas > 0 && (
            <span title="La diferencia cambió después de escribir la marca.">Por revisar: <b>{resumenMarcas.desactualizadas}</b></span>
          )}
          {(resumenMarcas.bajoUmbral ?? 0) > 0 && (
            <span className="text-ink-500">{contar(resumenMarcas.bajoUmbral ?? 0)} bajo el umbral: la marca es opcional.</span>
          )}
        </div>
      )}

      {cruceTercero.alcance && (
        <AlcanceCuentasTercero
          alcance={cruceTercero.alcance}
          periodo={cruceTercero.periodo}
          listaDelCierre={cruceTercero.listaDelCierre}
          enlaceCuentasModulo={cruceTercero.enlaceCuentasModulo}
          abiertoInicial={cruceTercero.abrirPanelCuentas}
          contableNoModular={cruceTercero.contableNoModular}
          contableExcluidoFilas={cruceTercero.contableExcluidoFilas}
          onIrConsolidado={onIrConsolidado}
        />
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {tarjetas.map((t) => (
          <button
            key={t.filtro}
            type="button"
            onClick={() => elegir(t.filtro)}
            className={`min-w-0 rounded-md border px-3 py-2 text-left ${filtro === t.filtro ? "border-navy-700 bg-blue-50" : "border-ink-150 bg-white hover:border-ink-300"}`}
          >
            <div className="text-[11.5px] text-ink-500">{t.titulo}</div>
            <div className={`text-[16px] font-semibold tabular-nums ${t.tono}`}>{contar(t.cantidad)}</div>
            {t.monto != null && <div className="break-words text-[11px] tabular-nums text-ink-500">{fmtContable(t.monto)}</div>}
          </button>
        ))}
      </div>

      {/* Búsqueda + tabla en una región: en pantalla completa ocupan el viewport, con los filtros por
          estado compactos arriba y el encabezado de la tabla fijo. */}
      <div role="region" aria-label="Cruce por tercero" {...propsRegionPantallaCompleta(pantallaCompleta, CLASE_TARJETA)}>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setLimite(PAGINA); alInicioDeLaTabla(); }}
            placeholder={`Buscar por ${cruceTercero.etiquetaClave} o ${cruceTercero.etiquetaNombre.toLocaleLowerCase("es")}`}
            className="w-full min-w-0 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] sm:w-72"
          />
          <span className="text-[12px] text-ink-500">
            {contar(filtradas.length)} de {contar(resumen.filas.length)} terceros
            {filtro === "todos" && !busqueda.trim() && cantidadSinSaldo > 0 && (
              <button
                type="button"
                onClick={() => { setVerSinSaldo((v) => !v); setLimite(PAGINA); alInicioDeLaTabla(); }}
                className="ml-2 font-semibold text-blue-700 hover:underline"
                title="Terceros en cero en la contabilidad y en el auxiliar"
              >
                {verSinSaldo ? `Ocultar los ${contar(cantidadSinSaldo)} sin saldo` : `Mostrar los ${contar(cantidadSinSaldo)} sin saldo`}
              </button>
            )}
            {filtro !== "todos" && (
              <button type="button" onClick={() => elegir(filtro)} className="ml-2 font-semibold text-blue-700 hover:underline">Quitar filtro</button>
            )}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {puedeEditar && resumen.sugerencias.length > 0 && (
              <button
                type="button"
                onClick={() => setValidando(true)}
                className="rounded-md border border-navy-700 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 transition hover:bg-blue-50"
                title="Revisa y aplica en lote las coincidencias entre terceros sueltos: mismo saldo, NIT con sufijo o nombre parecido."
              >
                Validar coherencia… ({contar(resumen.sugerencias.length)})
              </button>
            )}
            <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternarPantallaCompleta} />
          </div>
        </div>
        {/* Las tarjetas de estado quedan detrás de la vista completa: aquí van compactas. */}
        {pantallaCompleta && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-ink-100 bg-white px-3 py-2">
            {tarjetas.map((t) => (
              <button
                key={t.filtro}
                type="button"
                aria-pressed={filtro === t.filtro}
                onClick={() => elegir(t.filtro)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${filtro === t.filtro ? "border-navy-700 bg-blue-50 text-navy-800" : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"}`}
              >
                {t.titulo}
                <span className={`tabular-nums ${t.tono}`}>{contar(t.cantidad)}</span>
              </button>
            ))}
          </div>
        )}
        <div ref={tablaRef} className={claseScrollTabla(pantallaCompleta, null)}>
          <table className="tabla-encabezado-fijo w-full text-[12.5px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{encabezado(cruceTercero.etiquetaClave, "clave")}</th>
                <th className="min-w-[10rem] px-3 py-2 font-semibold">{encabezado(cruceTercero.etiquetaNombre, "nombre")}</th>
                {mostrarCuentas && cuentas.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-semibold" title={delPeriodo.has(c) ? `Fuera de las cuentas que concilia el módulo: vale solo para ${cruceTercero.periodo}` : undefined}>
                    {encabezado(c, `c:${c}`, "right")}
                    {delPeriodo.has(c) && <span className="block text-[10px] font-semibold uppercase tracking-wide text-warn-700">solo {cruceTercero.periodo}</span>}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">{encabezado("Contabilidad", "contable", "right")}</th>
                <th className="px-3 py-2 text-right font-semibold">{encabezado("Auxiliar (módulo)", "modulo", "right")}</th>
                <th className="px-3 py-2 text-right font-semibold">
                  {encabezado("Diferencia", "diferencia", "right", "Ordena por el tamaño de la diferencia, sin importar el signo. Tercer clic: vuelve al orden del sistema.")}
                </th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="w-px px-3 py-2 text-center font-semibold" title="Marca de auditoría: el detalle está al pie, en observaciones.">Marca</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="px-3 py-6 text-center text-ink-400">Sin terceros para mostrar.</td>
                </tr>
              )}
              {filtradas.slice(0, limite).map((f) => {
                const coincidencia = coincidencias.get(f.clave) ?? null;
                // Una fila que ya cuadra al 100 % no necesita el % de coincidencia: es ruido visual.
                const mostrarPorcentaje = !(f.estado === "cuadra" && coincidencia?.porcentaje === 100);
                return (
                <tr
                  key={f.clave}
                  data-clave={f.clave}
                  className={`border-t border-ink-100 transition-colors duration-500 ${
                    destacada === f.clave ? "bg-blue-100" : f.estado === "descuadre" ? "bg-err-100/30" : ""
                  } ${f.estado === "sin_saldo" ? "text-ink-400" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-800">{f.sinNit ? "—" : f.clave}</td>
                  <td className="px-3 py-2 text-ink-700">{f.nombre ?? "—"}</td>
                  {mostrarCuentas && cuentas.map((c) => (
                    <td key={c} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-600">{f.contable.porCuenta[c] ? fmtContable(f.contable.porCuenta[c]) : ""}</td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.contable.total)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-700">
                    {fmtContable(f.modulo.total)}
                    {f.modulo.exterior !== 0 && (
                      <div className="text-[11px] text-ink-500">Nal. {fmtContable(f.modulo.nacional + f.modulo.sinOrigen)} · Ext. {fmtContable(f.modulo.exterior)}</div>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${Math.abs(f.diferencia) <= 0.01 ? "text-ok-700" : "text-err-700"}`}>{fmtContable(f.diferencia)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {/* nowrap: el distintivo, el % y el menú van juntos; sin él la tabla le daba a la
                          columna el ancho del distintivo partido y el grupo invadía «Marca». */}
                      <div className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                        {f.estado !== "solo_contable" && (
                          <Chip label={ESTADO[f.estado].label} tone={ESTADO[f.estado].tone} />
                        )}
                        <PorcentajeCoincidencia coincidencia={mostrarPorcentaje ? coincidencia : null} onIrATercero={irATercero} />
                        {puedeEditar && (
                          <MenuAccionesFila
                            id={f.clave}
                            etiquetaAria={`tercero ${f.sinNit ? f.nombre ?? "sin NIT" : f.clave}`}
                            acciones={accionesFila(f)}
                          />
                        )}
                      </div>
                      {f.sinNit && <Chip label="Sin NIT" tone="ink" />}
                      {f.claveModuloPorDv && (
                        <span title={`Unido con ${f.claveModuloPorDv} del auxiliar: su NIT más el dígito de verificación es este. Si no es el mismo tercero, sepáralos.`}>
                          <Chip label="Por DV" tone="warn" />
                        </span>
                      )}
                      {f.separadoDe.map((claveModulo) => {
                        const separacion = separacionPorClave.get(claveModulo);
                        return (
                          <span
                            key={claveModulo}
                            title={separacion
                              ? `Separado por ${separacion.creadoPor ?? "—"} · ${separacion.creadoEn} · ${separacion.periodo ? `solo ${separacion.periodo}` : "todos los períodos"}: no se une solo con ${claveModulo}.`
                              : `No se une solo con ${claveModulo}.`}
                          >
                            <Chip label={`Separado de ${claveModulo}`} tone="ink" />
                          </span>
                        );
                      })}
                      {f.sugerencia && (
                        <span title={`Posible ${f.sugerencia.nombre ? `«${f.sugerencia.nombre}»` : f.sugerencia.clave}, que solo está en ${f.estado === "solo_modulo" ? "la contabilidad" : "el auxiliar"}: ${describirSenales(f.sugerencia.senales)} (confianza ${f.sugerencia.confianza}). Confírmalo con «Emparejar…» o en «Validar coherencia…».`}>
                          <Chip label={f.sugerencia.clave.startsWith("~") ? "Posible: sin NIT" : `Posible: ${f.sugerencia.clave}`} tone={f.sugerencia.confianza === "alta" ? "blue" : "ink"} />
                        </span>
                      )}
                      {f.emparejadoDesde.map((claveModulo) => {
                        const emparejamiento = emparejamientoPorClave.get(claveModulo);
                        const nombre = claveModulo.startsWith("~") ? (emparejamiento?.nombreModulo ?? claveModulo.slice(1)) : claveModulo;
                        return (
                          <span
                            key={claveModulo}
                            title={emparejamiento
                              ? `Emparejado por ${emparejamiento.creadoPor ?? "—"} · ${emparejamiento.creadoEn} · ${emparejamiento.periodo ? `solo ${emparejamiento.periodo}` : "todos los períodos"}${emparejamiento.nota ? ` · ${emparejamiento.nota}` : ""}`
                              : undefined}
                          >
                            <Chip label={`Incluye ${nombre}`} tone="blue" />
                          </span>
                        );
                      })}
                      {f.incluyeContable.map((claveContable) => {
                        const inclusion = inclusionContablePorClave.get(claveContable);
                        return (
                          <span
                            key={`c-${claveContable}`}
                            title={`${claveContable} de la contabilidad se suma a este renglón${inclusion
                              ? ` · por ${inclusion.creadoPor ?? "—"} · ${inclusion.creadoEn} · ${inclusion.periodo ? `solo ${inclusion.periodo}` : "todos los períodos"}${inclusion.nota ? ` · ${inclusion.nota}` : ""}`
                              : ""}`}
                          >
                            <Chip label={`Suma ${claveContable} (contab.)`} tone="blue" />
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center align-middle">
                    <CeldaMarcaTercero
                      fila={f}
                      encabezadoId={encabezadoId}
                      comentarios={comentarios[anclaCruceTercero(f.clave)] ?? 0}
                      puedeEditar={puedeEditar}
                      onMarcar={() => setMarcando(f)}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
            {resumen.filas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
                  <td className="px-3 py-2" colSpan={2}>Totales</td>
                  {mostrarCuentas && cuentas.map((c) => <td key={c} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtContable(totales.porCuenta[c] ?? 0)}</td>)}
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtContable(totales.contable)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtContable(totales.modulo)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${Math.abs(totales.diferencia) <= 0.01 ? "text-ok-700" : "text-err-700"}`}>{fmtContable(totales.diferencia)}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {filtradas.length > limite && (
          <div className="shrink-0 border-t border-ink-100 px-3 py-2 text-center">
            <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="text-[12.5px] font-semibold text-blue-700 hover:underline">
              Mostrar {contar(Math.min(PAGINA, filtradas.length - limite))} más
            </button>
          </div>
        )}
      </div>

      {(observaciones.length > 0 || referenciasMarcas.length > 0 || (resumenMarcas?.conDiferencia ?? 0) > 0) && (
        <ObservacionesMarcasTercero
          observaciones={observaciones}
          referencias={referenciasMarcas}
          encabezadoId={encabezadoId}
          comentarios={comentarios}
          puedeEditar={puedeEditar}
          ocupado={ocupado}
          onQuitarHuerfana={quitarMarcaHuerfana}
          onEditar={(fila) => setMarcando(fila)}
          onQuitar={quitarMarca}
        />
      )}

      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
          <div>
            Contabilidad del grupo: <b>{fmtContable(contableGrupo)}</b> = en el cruce {fmtContable(totales.contable)}
            {fuera.filas > 0 && <> + cuentas que no hacen parte del módulo {fmtContable(fuera.total)}</>}
            {sinTercero.filas > 0 && <> + cuentas sin detalle por tercero {fmtContable(sinTercero.total)}</>}.
          </div>
          {fuera.filas > 0 && (
            <div className="mt-0.5 text-ink-500">
              No se concilian aquí: {Object.entries(fuera.porCuenta).map(([cuenta, valor]) => `${cuenta} ${fmtContable(valor)}`).join(" · ")}.
            </div>
          )}
          {sinTercero.filas > 0 && (
            <div className="mt-0.5 text-ink-500">
              Sin detalle por tercero: {Object.entries(sinTercero.porCuenta).map(([cuenta, valor]) => `${cuenta} ${fmtContable(valor)}`).join(" · ")}.
            </div>
          )}
        </div>
        {(resumen.moduloFueraDelModulo.filas > 0 || resumen.moduloSinTercero.filas > 0 || cruceTercero.moduloNoAtribuido !== 0) && (
          <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
            Del auxiliar no entraron al cruce:
            {resumen.moduloFueraDelModulo.filas > 0 && <> <b>{fmtContable(resumen.moduloFueraDelModulo.total)}</b> en cuentas del archivo sin una cuenta del módulo asignada en Consolidado ({Object.entries(resumen.moduloFueraDelModulo.porCuenta).map(([cuenta, valor]) => `${cuenta} ${fmtContable(valor)}`).join(" · ")});</>}
            {resumen.moduloSinTercero.filas > 0 && <> <b>{fmtContable(resumen.moduloSinTercero.total)}</b> en {contar(resumen.moduloSinTercero.filas)} {resumen.moduloSinTercero.filas === 1 ? "fila" : "filas"} sin tercero identificado;</>}
            {cruceTercero.moduloNoAtribuido !== 0 && <> <b>{fmtContable(cruceTercero.moduloNoAtribuido)}</b> que no quedaron atribuidos a ningún tercero al cargar;</>}
            {resumen.moduloFueraDelModulo.filas > 0 ? " asigna esas cuentas en la pestaña Consolidado o" : ""}{" "}revísalos en el detalle del cargue.
          </div>
        )}
        {cruceTercero.contableNoModular.filas > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            Se excluyeron <b>{fmtContable(cruceTercero.contableNoModular.total)}</b> de {contar(cruceTercero.contableNoModular.filas)}{" "}
            {cruceTercero.contableNoModular.filas === 1 ? "cuenta marcada no modular" : "cuentas marcadas no modulares"} en el cruce contable
            ({cruceTercero.contableNoModular.cuentas.join(", ")}): sus NIT no se listan.
          </div>
        )}
        {cruceTercero.contableExcluidoFilas > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            Se excluyeron <b>{contar(cruceTercero.contableExcluidoFilas)}</b> {cruceTercero.contableExcluidoFilas === 1 ? "fila contable" : "filas contables"} del cruce por falta de homologación Russell o de una regla activa del prevalidador para el módulo.
          </div>
        )}
        {cruceTercero.moduloDerivadoDelDetalle && (
          <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
            Este cargue es anterior a los saldos por tercero: el lado del módulo se calculó directamente de su detalle.
          </div>
        )}
      </div>

      {marcando && (
        <ModalMarcaTercero
          fila={marcando}
          encabezadoId={encabezadoId}
          onClose={() => setMarcando(null)}
          onGuardado={() => {
            setMarcando(null);
            router.refresh();
          }}
        />
      )}
      {validando && (
        <ModalValidarCoherencia
          sugerencias={resumen.sugerencias}
          encabezadoId={encabezadoId}
          etiquetaClave={cruceTercero.etiquetaClave}
          onClose={() => setValidando(false)}
          onGuardado={() => {
            setValidando(false);
            router.refresh();
          }}
        />
      )}
      {emparejando && (
        <ModalEmparejarTercero
          fila={emparejando.fila}
          destinoInicial={emparejando.destino}
          candidatos={emparejando.fila.estado === "solo_contable" ? candidatosAuxiliar : candidatosBalance}
          encabezadoId={encabezadoId}
          onClose={() => setEmparejando(null)}
          onGuardado={() => {
            setEmparejando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
