"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { fmt } from "@/lib/format";
import { cargarBorrador, descartarBorrador, aplicarCambiosBorrador, aplicarCorreccionesClienteBorrador, reprocesarBalanceConSpec, guardarPerfilDesdeEditor, guardarNotasDesdeEditor } from "@/app/actions/balance";
import { EditorEstructura } from "@/app/(app)/balance/cargar-balance-modal";
import { PromptClientePerfil } from "@/app/(app)/balance/prompt-cliente-perfil";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";
import type { ImportBalanceState } from "@/lib/import/balance";
import { construirVistaBorrador } from "@/lib/balance/borrador-vm";
import { contextoTabulador, puedeUbicar, reclasificarSoloHojas, type ContextoNodo, type RefNodo, type FilaBorrador, type NodoBorrador } from "@/lib/balance/borrador";
import type { ValidacionContable } from "@/lib/balance/calcular";
import type { Hallazgo } from "@/lib/balance/diagnostico";
import { notifyActionState, notifySuccess, notifyError } from "@/lib/client-notifications";
import { SelectorClienteBuscable } from "@/components/selector-cliente-buscable";

type Cliente = { id: number; name: string; nit: string; notas?: string | null };

/** Aplica los cambios TEMPORALES (reclasificación / lados invertidos / desacople /
 *  omitir / re-parentado) sobre las filas crudas, en memoria (misma lógica que guardar). */
function aplicarCambios(
  filas: FilaBorrador[],
  override: Record<string, "agrupadora" | "movimiento">,
  invertidos: string[],
  desacopladas: Record<string, boolean>,
  omitidas: Record<number, boolean>,
  padres: Record<number, number | null>,
): FilaBorrador[] {
  const out = filas.map((f) => ({ ...f }));
  if (Object.keys(override).length > 0) {
    for (const f of out) {
      const ov = override[f.codigo];
      // Aplica la reclasificación a cualquier fila numérica que NO sea «total» (incluye
      // «descuadre», que estructuralmente es un movimiento) y que difiera del destino.
      if (ov && /^\d+$/.test(f.codigo) && f.tipoFila !== "total" && f.tipoFila !== ov) f.tipoFila = ov;
    }
  }
  if (invertidos.length > 0) {
    const set = new Set(invertidos);
    const ctrlOk = (f: FilaBorrador) => Math.abs(f.saldoInicial + f.debitos - f.creditos - f.saldoFinal) <= 1;
    for (const f of out) {
      if (set.has(f.codigo) && !ctrlOk(f) && Math.abs(f.saldoInicial + f.creditos - f.debitos - f.saldoFinal) <= 1) {
        const t = f.debitos; f.debitos = f.creditos; f.creditos = t;
      }
    }
  }
  if (Object.keys(desacopladas).length > 0) {
    for (const f of out) if (f.codigo in desacopladas) f.desacoplada = desacopladas[f.codigo];
  }
  if (Object.keys(omitidas).length > 0) {
    for (const f of out) if (f.filaNum in omitidas) f.omitida = omitidas[f.filaNum];
  }
  if (Object.keys(padres).length > 0) {
    for (const f of out) if (f.filaNum in padres) f.padreManual = padres[f.filaNum];
  }
  return out;
}

export default function BorradorDetailClient({
  loteId, nitDetectado, periodoInicial, periodoFinal, filas, porTerceroDetectado, clientes, clienteSugeridoId, spec, correccionesAplicadas,
}: {
  loteId: string;
  archivoNombre: string;
  nitDetectado: string | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
  filas: FilaBorrador[];
  porTerceroDetectado: boolean;
  clientes: Cliente[];
  clienteSugeridoId: number | null;
  spec: SpecCarga | null;
  correccionesAplicadas: number;
}) {
  const router = useRouter();
  const [cargarState, cargarAction, cargando] = useActionState<ImportBalanceState, FormData>(cargarBorrador, {});
  const [descartando, startDescartar] = useTransition();
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [clienteSelId, setClienteSelId] = useState<number | null>(clienteSugeridoId); // sigue las notas del cliente
  const [periodoIni, setPeriodoIni] = useState(periodoInicial ?? "");
  const [periodoFin, setPeriodoFin] = useState(periodoFinal ?? "");
  // Compuerta al entrar: sin cliente detectado por NIT, exige cliente + período
  // antes de operar (para aplicar sus preferencias/notas y no cargar a ciegas).
  const [gateAbierto, setGateAbierto] = useState(clienteSugeridoId == null);

  // Cambios TEMPORALES (en el navegador) hasta Guardar/Descartar.
  const [override, setOverride] = useState<Record<string, "agrupadora" | "movimiento">>({});
  const [invertidos, setInvertidos] = useState<string[]>([]);
  const [desacopladas, setDesacopladas] = useState<Record<string, boolean>>({});
  const [omitidas, setOmitidas] = useState<Record<number, boolean>>({});
  const [padres, setPadres] = useState<Record<number, number | null>>({});
  const [mover, setMover] = useState<number | null>(null); // filaNum en el modal "Ubicar"
  const [soloHojas, setSoloHojas] = useState(false); // export jerárquico: solo cuentan las hojas
  const [autoCorregido, setAutoCorregido] = useState(false); // «solo hojas» se activó por auto-corrección al abrir
  const autoAplicadoRef = useRef(false);
  const [archivoFile, setArchivoFile] = useState<File | null>(null); // re-adjuntar para reprocesar sin IA
  const [reprocesando, startReproceso] = useTransition();
  const [guardandoPerfil, startGuardarPerfil] = useTransition();
  const [promptPerfilSpec, setPromptPerfilSpec] = useState<SpecCarga | null>(null); // pide cliente al guardar perfil
  const [guardando, startGuardar] = useTransition();
  // «Imputar solo las hojas»: en un export jerárquico (la cuenta y sus subcuentas/auxiliares
  // vienen TODAS como filas), marca como AGRUPADORA toda cuenta con detalle debajo (código
  // más largo por orden) → solo cuentan las hojas. Se expresa como overrides de
  // reclasificación: reversible en pantalla y persistible con «Guardar cambios».
  const overrideEfectivo = useMemo(() => {
    if (!soloHojas) return override;
    const combinado: Record<string, "agrupadora" | "movimiento"> = { ...override };
    for (const f of reclasificarSoloHojas(filas.map((x) => ({ ...x })))) {
      if (!(f.codigo in combinado)) combinado[f.codigo] = "agrupadora";
    }
    return combinado;
  }, [filas, soloHojas, override]);
  const nCambios = Object.keys(overrideEfectivo).length + invertidos.length + Object.keys(desacopladas).length + Object.keys(omitidas).length + Object.keys(padres).length;
  const hayCambios = nCambios > 0;
  // View-model recomputado LOCALMENTE con los cambios temporales (sin tocar la BD).
  const { arbol, validacion, partidaDoble, hallazgos, porTercero: porTerceroCalculado, relistadoGuiones, filasOcultas, clasesCorregidas, nitTachados } = useMemo(() => construirVistaBorrador(aplicarCambios(filas, overrideEfectivo, invertidos, desacopladas, omitidas, padres)), [filas, overrideEfectivo, invertidos, desacopladas, omitidas, padres]);
  const porTercero = porTerceroDetectado || porTerceroCalculado;

  // AUTO-CORRECCIÓN de anidado por orden: en un export jerárquico (subtotales + auxiliares
  // como filas), «solo hojas» re-anida cada auxiliar bajo su subtotal por ORDEN. Se calcula
  // el balance CON y SIN la corrección y solo se propone si VERIFICADAMENTE acerca el activo
  // al total del archivo y reduce descuadres — en un balance mixto no aplica (fail-safe).
  const analisisSoloHojas = useMemo(() => {
    const base = construirVistaBorrador(filas.map((f) => ({ ...f })));
    const clon = filas.map((f) => ({ ...f }));
    const promovidas = reclasificarSoloHojas(clon);
    const conSolo = construirVistaBorrador(clon);
    const distBase = base.validacion.activoArchivo != null ? Math.abs(base.validacion.activo - base.validacion.activoArchivo) : Infinity;
    const distSolo = conSolo.validacion.activoArchivo != null ? Math.abs(conSolo.validacion.activo - conSolo.validacion.activoArchivo) : Infinity;
    const ayuda = distBase !== Infinity && distSolo < distBase * 0.5 && conSolo.diagnostico.descuadres < base.diagnostico.descuadres && promovidas.length > 0;
    return { ayuda, n: promovidas.length };
  }, [filas]);
  // Auto-activa la corrección UNA vez al abrir (si verifica). Reversible: el usuario puede
  // desmarcar «solo hojas», y no se vuelve a auto-aplicar (autoAplicadoRef).
  useEffect(() => {
    if (!autoAplicadoRef.current && analisisSoloHojas.ayuda) {
      autoAplicadoRef.current = true;
      setSoloHojas(true);
      setAutoCorregido(true);
    }
  }, [analisisSoloHojas]);

  // Posición de cada nodo en el árbol (hermano anterior + abuelo) para el TABULADOR:
  // el ← (desindentar) sube al abuelo. El → abre el modal "Ubicar" (elegir destino + lote).
  const posiciones = useMemo(() => construirPosiciones(arbol), [arbol]);
  const contexto = useMemo(() => contextoTabulador(arbol), [arbol]);

  const onReclasificar = (codigo: string, actual: NodoBorrador["tipoFila"]) =>
    setOverride((o) => ({ ...o, [codigo]: actual === "movimiento" ? "agrupadora" : "movimiento" }));
  const onInvertir = (codigo: string) => setInvertidos((inv) => (inv.includes(codigo) ? inv : [...inv, codigo]));
  const onDesacoplar = (codigo: string, desacopladaAhora: boolean) => setDesacopladas((d) => ({ ...d, [codigo]: !desacopladaAhora }));
  const onOmitir = (filaNum: number, omitidaAhora: boolean) => setOmitidas((o) => ({ ...o, [filaNum]: !omitidaAhora }));
  const onUbicar = (filaNum: number) => setMover(filaNum); // → abre el modal "Ubicar"
  const onConfirmarMover = (patch: Record<number, number>) => { setPadres((m) => ({ ...m, ...patch })); setMover(null); };
  const onDesindentar = (filaNum: number) => { const p = posiciones.get(filaNum); if (p?.abuelo != null) setPadres((m) => ({ ...m, [filaNum]: p.abuelo })); };
  const descartarCambios = () => { setOverride({}); setInvertidos([]); setDesacopladas({}); setOmitidas({}); setPadres({}); setSoloHojas(false); };
  const guardarCambios = () =>
    startGuardar(async () => {
      // El cliente seleccionado viaja para MEMORIZAR las correcciones en su perfil
      // (si no hay, el servidor lo resuelve por el lote/NIT).
      const r = await aplicarCambiosBorrador(loteId, overrideEfectivo, invertidos, desacopladas, omitidas, padres, clienteSelId);
      if (r.ok) { notifySuccess(r.message ?? "Cambios guardados."); setOverride({}); setInvertidos([]); setDesacopladas({}); setOmitidas({}); setPadres({}); setSoloHojas(false); router.refresh(); }
      else notifyError(r.message ?? "No se pudieron guardar los cambios.");
    });

  // Correcciones memorizadas del cliente elegido A MANO en la compuerta: el NIT no
  // lo detectó al leer (la re-aplicación automática no corrió), así que se aplican
  // aquí y se refresca el borrador ya corregido.
  const [, startAplicarCorrecciones] = useTransition();
  const aplicarCorreccionesDeCliente = (cid: number) => {
    startAplicarCorrecciones(async () => {
      const r = await aplicarCorreccionesClienteBorrador(loteId, cid);
      if (r.ok && (r.aplicadas ?? 0) > 0) { notifySuccess(r.message ?? "Correcciones del perfil aplicadas."); router.refresh(); }
      else if (!r.ok && r.message) notifyError(r.message);
    });
  };

  // Reproceso determinista con el spec ajustado (editor de estructura), re-adjuntando el
  // archivo original — esta página no lo conserva. Crea un borrador NUEVO y purga este.
  // Guardar el spec ajustado como PERFIL del cliente SIN reprocesar (para futuras cargas).
  // Si no hay cliente (ni por NIT ni en el lote), se pide elegirlo para concluir el guardado.
  const onGuardarPerfil = (s: SpecCarga) => {
    startGuardarPerfil(async () => {
      const r = await guardarPerfilDesdeEditor(loteId, s);
      if (r.ok) { notifySuccess(r.message ?? "Perfil guardado."); return; }
      if (r.needsClient) { setPromptPerfilSpec(s); return; } // pedir cliente
      notifyError(r.message ?? "No se pudo guardar el perfil.");
    });
  };
  const guardarPerfilConCliente = (clientId: number) => {
    const s = promptPerfilSpec;
    if (!s) return;
    startGuardarPerfil(async () => {
      const r = await guardarPerfilDesdeEditor(loteId, s, clientId);
      if (r.ok) { notifySuccess(r.message ?? "Perfil guardado."); setPromptPerfilSpec(null); }
      else notifyError(r.message ?? "No se pudo guardar el perfil.");
    });
  };

  // Notas / observaciones de carga del cliente (per-cliente) desde el editor de estructura.
  const [guardandoNotas, startGuardarNotas] = useTransition();
  const [notasPendientes, setNotasPendientes] = useState<string | null>(null); // a guardar tras elegir cliente
  const guardarNotas = (texto: string, clienteId: number) => {
    startGuardarNotas(async () => {
      const r = await guardarNotasDesdeEditor(loteId, texto, clienteId);
      if (r.ok) { notifySuccess(r.message ?? "Notas guardadas."); router.refresh(); }
      else notifyError(r.message ?? "No se pudieron guardar las notas.");
    });
  };
  const onGuardarNotas = (texto: string) => {
    // Sin cliente aún: se recuerda el texto y se pide el cliente; al confirmarlo se
    // guarda (antes se abría la compuerta pero NO se reintentaba → las notas se perdían).
    if (clienteSelId == null) { setNotasPendientes(texto); setGateAbierto(true); notifyError("Elige el cliente para guardar las notas."); return; }
    guardarNotas(texto, clienteSelId);
  };

  const onReprocesar = (s: SpecCarga) => {
    if (!archivoFile) { notifyError("Adjunta el archivo original para reprocesar."); return; }
    startReproceso(async () => {
      try { await archivoFile.arrayBuffer(); } catch { notifyError("No pudimos leer el archivo. Suele pasar cuando está ABIERTO en Excel o sincronizándose en OneDrive: ciérralo e intenta de nuevo."); return; }
      const fd = new FormData();
      fd.set("archivo", archivoFile);
      fd.set("spec", JSON.stringify(s));
      fd.set("loteIdAnterior", loteId);
      const r = await reprocesarBalanceConSpec({}, fd);
      if (r.ok && r.sugerencia) { notifySuccess("Reprocesado sin IA."); router.push(`/balance/borradores/${r.sugerencia.payload.loteId}`); }
      else notifyError(r.message ?? "No se pudo reprocesar el archivo.");
    });
  };

  useEffect(() => {
    // El éxito redirige EN EL SERVIDOR (a /balance/[id]) y confirma con FlashToast;
    // aquí solo se notifica el error si la carga falla.
    if (cargarState && cargarState.ok === false) notifyActionState(cargarState, { success: "Balance cargado.", error: "No se pudo cargar el balance." });
  }, [cargarState]);

  const onDescartar = () =>
    startDescartar(async () => {
      const r = await descartarBorrador(loteId);
      if (r.ok) { notifySuccess(r.message ?? "Borrador descartado."); router.push("/balance/borradores"); }
      else notifyError(r.message ?? "No se pudo descartar.");
    });

  return (
    <div className="flex flex-col gap-4">
      {porTercero && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
          <Icon name="warn" size={14} />
          <span><span className="font-semibold">Balance abierto por tercero detectado.</span> Se colapsó el detalle de tercero (NIT/cédula) y se concilia por <span className="font-semibold">cuenta</span> — el saldo de cada cuenta ya es la suma de sus terceros. Los cálculos y la carga usan el nivel de cuenta. Si algún tercero no se detectó y quedó como fila, exclúyelo a mano con la <span className="font-semibold text-err-700">✕</span> (omitir).</span>
        </div>
      )}
      {relistadoGuiones > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
          <Icon name="warn" size={14} />
          <span><span className="font-semibold">Re-listado con guiones detectado.</span> Se marcaron <span className="font-semibold">{relistadoGuiones}</span> fila(s) con código en notación de guiones (p. ej. <span className="font-mono">1105-05-04</span>) que duplican una cuenta ya listada con su código plano (<span className="font-mono">11050504</span>): se muestran <span className="line-through">tachadas</span> y NO cuentan (se concilia por el código plano). Si alguna hiciera falta, la puedes rescatar con «Incluir».</span>
        </div>
      )}
      {clasesCorregidas > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
          <Icon name="warn" size={14} />
          <span>Se corrigieron <span className="font-semibold">{clasesCorregidas}</span> código(s) de clase que el ERP (SIIGO) trajo como número gigante (p. ej. <span className="font-mono">800000000000000</span>), derivando la clase real de sus subcuentas (p. ej. <span className="font-mono">5</span> «Otros Gastos»). Así anida y totaliza bien por clase.</span>
        </div>
      )}
      {nitTachados > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
          <Icon name="warn" size={14} />
          <span>Balance por cuenta con detalle de tercero: se tacharon <span className="font-semibold">{nitTachados}</span> fila(s) <span className="font-semibold">NIT</span> que repiten el saldo de su cuenta (el total ya está en la fila «Cuenta»). Se muestran <span className="line-through">tachadas</span> y NO cuentan. Si necesitas alguna, rescátala con «Incluir».</span>
        </div>
      )}
      {filasOcultas > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
          <Icon name="warn" size={14} />
          <span>Se ocultaron <span className="font-semibold">{filasOcultas}</span> fila(s) que no van al balance: pies/notas del ERP (código que no empieza por dígito, como «Procesado en: …», <span className="font-mono">&lt;none&gt;</span> o «Total general»), <span className="font-semibold">cuentas de orden (clase 8 y 9)</span> y <span className="font-semibold">totales de sucursal</span> (código que empieza en 0, como «<span className="font-mono">002 MEDELLIN</span>» en un balance multi-sucursal). Se muestran <span className="line-through">tachadas</span> y NO cuentan. Si necesitas alguna, rescátala con «Incluir».</span>
        </div>
      )}
      {correccionesAplicadas > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-ok-200 bg-ok-100/40 px-3 py-2 text-[12px] text-ok-800">
          <span className="mt-px font-bold text-ok-700">✓</span>
          <span>
            <span className="font-semibold">Perfil del cliente aplicado.</span> Se corrigieron <span className="font-semibold">{correccionesAplicadas}</span> fila(s) automáticamente con las correcciones memorizadas de cargas anteriores (reclasificaciones, lados invertidos, omisiones, desacoples y re-parentados guardados para este cliente). Revísalas; si haces nuevos ajustes y los guardas, también quedarán memorizados. Puedes ver o borrar lo memorizado en Config › Clientes › Carga de balances.
          </span>
        </div>
      )}
      {soloHojas && autoCorregido && (
        <div className="flex items-start gap-2 rounded-md border border-ok-200 bg-ok-100/40 px-3 py-2 text-[12px] text-ok-800">
          <span className="mt-px font-bold text-ok-700">✓</span>
          <span>
            <span className="font-semibold">Corrección automática de anidado.</span> Se detectó un export jerárquico con doble conteo y se re-anidaron <span className="font-semibold">{analisisSoloHojas.n}</span> cuenta(s) por orden (solo cuentan las hojas — cada auxiliar bajo su subtotal). Revisa el resultado y pulsa <span className="font-semibold">Guardar cambios</span> para fijarlo, o desmarca «Imputar solo las hojas» abajo para revertir. Los descuadres que queden son genuinos (cuenta faltante o de signo), no de anidado.
          </span>
        </div>
      )}
      <ValidacionHeader v={validacion} pd={partidaDoble} />

      {(() => {
        // Partida doble y ecuación ya se ven arriba (ValidacionHeader), y el
        // descuadre por clase ya lo muestra cada tarjeta (Δ archivo vs detalle);
        // se omiten aquí para no repetirlos. Queda lo accionable: lados invertidos
        // y nodos que no cuadran con su desglose. La fuente conserva el contexto
        // completo para los cálculos y las correcciones deterministas del borrador.
        const hh = hallazgos.filter((h) => h.tipo !== "partida_doble" && h.tipo !== "ecuacion" && h.tipo !== "clase");
        return hh.length > 0 ? (
          <DiagnosticoPanel hallazgos={hh} />
        ) : null;
      })()}

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Movimiento en borrador (crudo del Excel · sin homologación)</div>
            <div className="flex shrink-0 items-center gap-2">
              {hayCambios && <span className="text-[11px] font-medium text-warn-700">Guarda para incluir tus cambios</span>}
              <a
                href={`/balance/borradores/${loteId}/export`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ok-200 bg-ok-100/40 px-2.5 py-1.5 text-[12px] font-semibold text-ok-700 hover:bg-ok-100"
                title={hayCambios
                  ? "El Excel exporta lo GUARDADO. Guarda tus cambios para que salgan reflejados."
                  : "Exporta a Excel todo el árbol del borrador"}
              >
                <Icon name="download" size={13} /> Exportar a Excel
              </a>
            </div>
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-500">
            <span className="font-semibold text-err-700">Δ subrayado</span> en una agrupadora = su total del archivo − la suma de las filas que cuelgan de ella (por prefijo de código). Si ≠ 0, su subtotal no cuadra con su desglose: puede ser una <span className="font-semibold">cuenta faltante</span>, o que el ERP numere el detalle sin anidar por código (el subtotal y su detalle no comparten prefijo — la plata está, pero en otra rama). Usa <span className="font-semibold">⇄ Agrupadora/Movimiento</span> para corregir el tipo de una cuenta, <span className="font-semibold">⇄ Desacoplar</span> para sacar una cuenta de una agrupadora de código ajeno, la <span className="font-semibold text-err-700">✕</span> para <span className="font-semibold">omitir</span> un registro de los cálculos (se conserva en el crudo/Excel línea a línea y NO se carga al balance), y el <span className="font-semibold">tabulador ← →</span> para <span className="font-semibold">ubicar</span> una fila en la rama que quieras (→ la mete en la agrupadora de arriba; ← la sube un nivel).
          </div>
          <label className={`mt-2 flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-[12px] ${soloHojas ? "border-blue-300 bg-blue-50 text-ink-700" : "border-ink-200 bg-white text-ink-600"}`}>
            <input type="checkbox" checked={soloHojas} onChange={(e) => setSoloHojas(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-semibold">Imputar solo las hojas</span> (export jerárquico) — si el archivo trae la cuenta <span className="font-semibold">y</span> sus subcuentas/auxiliares como filas (p. ej. SIESA), marca los niveles superiores como <span className="font-semibold">agrupadora</span> para no contar doble; solo cuenta el nivel más profundo. Se previsualiza al instante; <span className="font-semibold">guarda</span> para persistirlo. Para automatizarlo en cada carga del cliente, actívalo en Config › Clientes › Carga de balances.
            </span>
          </label>
        </div>
        {hayCambios && (
          <div className="flex flex-wrap items-center gap-2 border-b border-warn-200 bg-warn-50 px-3 py-2 text-[12px]">
            <Icon name="warn" size={13} />
            <span className="font-semibold text-warn-800">{nCambios} cambio(s) sin guardar</span>
            <span className="text-warn-700">— se aplican en pantalla; guárdalos para persistirlos en el borrador.</span>
            {Object.keys(padres).length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                <span aria-hidden className="h-2 w-2 rounded-full bg-blue-500" />
                Las filas movidas se sombrean en azul en su nueva ubicación.
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={guardarCambios} disabled={guardando} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
              <button type="button" onClick={descartarCambios} disabled={guardando} className="rounded-md border border-ink-300 px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60">Descartar cambios</button>
            </div>
          </div>
        )}
        <ArbolTabla arbol={arbol} onReclasificar={onReclasificar} onInvertir={onInvertir} onDesacoplar={onDesacoplar} onOmitir={onOmitir} posiciones={posiciones} contexto={contexto} onUbicar={onUbicar} onDesindentar={onDesindentar} />
      </Card>

      {spec && (
        <Card className="p-3">
          <div className="mb-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-600">
            <span className="font-semibold">Reprocesar con otra estructura (sin IA):</span> corrige el mapeo de columnas, la detección o el signo abajo. Como esta página no conserva el archivo, <span className="font-semibold">re-adjunta el archivo original</span> para reprocesar — se creará un borrador nuevo con el resultado.
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".xlsx,.xls,.xlsb,.csv,.txt,.json,.pdf"
                onChange={(e) => setArchivoFile(e.target.files?.[0] ?? null)}
                className="text-[12px] text-ink-700 file:mr-2 file:rounded-md file:border-0 file:bg-navy-700 file:px-2.5 file:py-1 file:text-[12px] file:font-semibold file:text-white hover:file:bg-navy-600"
              />
              {archivoFile && <span className="text-[11.5px] font-medium text-ok-700">✓ {archivoFile.name}</span>}
            </div>
          </div>
          <EditorEstructura spec={spec} encabezados={[]} hojas={[spec.hoja]} reprocesando={reprocesando} onAplicar={onReprocesar} onGuardar={onGuardarPerfil} guardando={guardandoPerfil} notasCliente={clientes.find((c) => c.id === clienteSelId)?.notas ?? null} onGuardarNotas={onGuardarNotas} guardandoNotas={guardandoNotas} />
        </Card>
      )}

      {mover != null && (
        <MoverModal arbol={arbol} filaNum={mover} contexto={contexto} onConfirmar={onConfirmarMover} onClose={() => setMover(null)} />
      )}

      {promptPerfilSpec && (
        <PromptClientePerfil clientes={clientes} guardando={guardandoPerfil} onElegir={guardarPerfilConCliente} onClose={() => setPromptPerfilSpec(null)} />
      )}

      {gateAbierto && (
        <GateClientePeriodo
          clientes={clientes}
          nitDetectado={nitDetectado}
          clienteSelId={clienteSelId}
          periodoIni={periodoIni}
          periodoFin={periodoFin}
          onConfirmar={(cid, ini, fin) => {
            setClienteSelId(cid); setPeriodoIni(ini); setPeriodoFin(fin); setGateAbierto(false);
            if (notasPendientes != null) { const t = notasPendientes; setNotasPendientes(null); guardarNotas(t, cid); }
            // Cliente confirmado a mano → re-aplica sus correcciones memorizadas.
            aplicarCorreccionesDeCliente(cid);
          }}
          onClose={() => { setGateAbierto(false); setNotasPendientes(null); }}
        />
      )}

      {/* Cargar / Descartar */}
      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cargar como balance oficial</div>
        {(() => {
          const notas = clientes.find((c) => c.id === clienteSelId)?.notas?.trim();
          return notas ? (
            <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
              <div className="mb-0.5 flex items-center gap-1.5 font-semibold"><span aria-hidden>📌</span> Notas de carga de este cliente</div>
              <p className="whitespace-pre-wrap leading-relaxed">{notas}</p>
            </div>
          ) : null;
        })()}
        <form action={cargarAction} className="flex flex-col gap-3">
          <input type="hidden" name="loteId" value={loteId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectorClienteBuscable
              clients={clientes}
              value={clienteSelId}
              onChange={setClienteSelId}
              name="clientId"
              className="sm:col-span-1"
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">Período desde</span>
              <input type="date" name="periodoInicio" required value={periodoIni} onChange={(e) => setPeriodoIni(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">Período hasta</span>
              <input type="date" name="periodoFin" required value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
            </label>
          </div>
          {clienteSelId == null && (
            <span className="inline-flex flex-wrap items-center gap-2 text-[11px] text-warn-700">
              {nitDetectado ? <>NIT detectado <span className="font-mono">{nitDetectado}</span> sin cliente coincidente.</> : <>No se detectó el cliente.</>}
              <button type="button" onClick={() => setGateAbierto(true)} className="rounded border border-warn-300 bg-warn-50 px-2 py-0.5 font-semibold text-warn-700 hover:bg-warn-100">
                Elegir cliente y período
              </button>
            </span>
          )}
          {cargarState?.message && !cargarState.ok && <p className="text-[12px] font-medium text-err-700">{cargarState.message}</p>}
          {hayCambios && <p className="text-[11.5px] font-medium text-warn-700">Tienes cambios sin guardar: guárdalos o descártalos antes de cargar (el balance se carga desde lo guardado).</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={cargando || hayCambios || clienteSelId == null || !periodoIni || !periodoFin} title={clienteSelId == null || !periodoIni || !periodoFin ? "Falta el cliente o el período" : hayCambios ? "Guarda o descarta los cambios antes de cargar" : undefined} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
              {cargando ? "Cargando…" : "Cargar balance"}
            </button>
            {confirmarDescarte ? (
              <span className="inline-flex items-center gap-2">
                <button type="button" onClick={onDescartar} disabled={descartando} className="rounded-md bg-err-100 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-200 disabled:opacity-60">
                  {descartando ? "Descartando…" : "Confirmar descarte"}
                </button>
                <button type="button" onClick={() => setConfirmarDescarte(false)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cancelar</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmarDescarte(true)} className="rounded-md border border-err-200 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-50">
                Descartar borrador
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

// ---- Encabezado de validación (mismas tarjetas del borrador del modal) ----
function ValidacionHeader({ v, pd }: { v: ValidacionContable; pd: { debitos: number; creditos: number; diff: number; cuadra: boolean } }) {
  const ecOk = v.ecuacionCuadra;
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`rounded-md border px-3 py-2 text-[12px] ${pd.cuadra ? "border-ok-100 bg-ok-100/40 text-ok-700" : "border-warn-200 bg-warn-50 text-warn-700"}`}>
        <span className="font-semibold">{pd.cuadra ? "Cuadra:" : "No coinciden:"}</span> partida doble · débitos <span className="font-semibold">{fmt(pd.debitos)}</span> vs créditos <span className="font-semibold">{fmt(pd.creditos)}</span> · diferencia <span className="font-semibold">{fmt(pd.diff)}</span>
      </div>
      <div className={`rounded-md border px-3 py-2 text-[12px] ${ecOk ? "border-ok-100 bg-ok-100/40 text-ok-700" : "border-warn-200 bg-warn-50 text-warn-700"}`}>
        <span className="font-semibold">{ecOk ? "Cuadra:" : "No cuadra:"}</span> Activo = Pasivo + Patrimonio + Resultado · diferencia <span className="font-semibold">{fmt(v.ecuacionDiff)}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ClaseCard label="Activo" calc={v.activo} archivo={v.activoArchivo} cuadra={v.activoCuadra} diff={v.activoDiff} />
        <ClaseCard label="Pasivo" calc={v.pasivo} archivo={v.pasivoArchivo} cuadra={v.pasivoCuadra} diff={v.pasivoDiff} />
        <ClaseCard label="Patrimonio" calc={v.patrimonio} archivo={v.patrimonioArchivo} cuadra={v.patrimonioCuadra} diff={v.patrimonioDiff} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniDato k="Ingresos" v={v.ingresos} archivo={v.ingresosArchivo} cuadra={v.ingresosCuadra} diff={v.ingresosDiff} />
        <MiniDato k="Gastos" v={v.gastos} archivo={v.gastosArchivo} cuadra={v.gastosCuadra} diff={v.gastosDiff} />
        <MiniDato k="Costos" v={v.costos} archivo={v.costosArchivo} cuadra={v.costosCuadra} diff={v.costosDiff} />
        <MiniDato k="Resultado" v={v.resultado} archivo={v.resultadoArchivo} cuadra={v.resultadoCuadra} diff={v.resultadoDiff} />
      </div>
    </div>
  );
}

function ClaseCard({ label, calc, archivo, cuadra, diff }: { label: string; calc: number; archivo: number | null; cuadra: boolean | null; diff: number | null }) {
  const tono = cuadra == null ? "border-ink-150 bg-ink-50" : cuadra ? "border-ok-100 bg-ok-100/40" : "border-err-200 bg-err-50";
  return (
    <div className={`rounded-md border px-3 py-2 ${tono}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-ink-800">{fmt(calc)}</div>
      {archivo == null ? (
        <div className="mt-0.5 text-[10.5px] text-ink-400">solo calculado (sin total en archivo)</div>
      ) : cuadra ? (
        <div className="mt-0.5 text-[10.5px] text-ok-700">✓ archivo {fmt(archivo)} — cruza</div>
      ) : (
        <div className="mt-0.5 text-[10.5px] text-err-700">archivo {fmt(archivo)} · Δ {fmt(diff ?? 0)}</div>
      )}
    </div>
  );
}

function MiniDato({ k, v, archivo, cuadra, diff }: { k: string; v: number; archivo: number | null; cuadra: boolean | null; diff: number | null }) {
  const tono = cuadra == null ? "border-ink-150 bg-ink-50" : cuadra ? "border-ok-100 bg-ok-100/40" : "border-err-200 bg-err-50";
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${tono}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">{k}</div>
      <div className="mt-0.5 text-[12px] font-semibold text-ink-700">{fmt(v)}</div>
      {archivo == null ? (
        <div className="mt-0.5 text-[10px] text-ink-400">solo calculado</div>
      ) : cuadra ? (
        <div className="mt-0.5 text-[10px] text-ok-700">✓ archivo {fmt(archivo)}</div>
      ) : (
        <div className="mt-0.5 text-[10px] text-err-700">archivo {fmt(archivo)} · Δ {fmt(diff ?? 0)}</div>
      )}
    </div>
  );
}

// ---- Diagnóstico determinista del descuadre ----
function DiagnosticoPanel({ hallazgos }: { hallazgos: Hallazgo[] }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Diagnóstico del descuadre</div>
      <ul className="flex flex-col gap-1.5">
        {hallazgos.map((h, i) => {
          const tono = h.severidad === "alta" ? "border-err-200 bg-err-50" : "border-warn-200 bg-warn-50";
          return (
            <li key={i} className={`rounded-md border px-3 py-2 text-[12px] ${tono}`}>
              <div className="font-semibold text-ink-800">{h.titulo} <span className="font-normal text-ink-500">· {fmt(h.monto)}</span></div>
              <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{h.detalle}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---- Árbol crudo (agrupadora / movimiento, descuadre subrayado) ----
const tieneDescuadre = (n: NodoBorrador): boolean => (n.descuadre != null && n.descuadre !== 0) || n.hijos.some(tieneDescuadre);

// Control contable de una fila: saldo ant + débito − crédito = saldo actual (±$1).
const controlCuadraFila = (si: number, db: number, cr: number, s: number) => Math.abs(si + db - cr - s) <= 1;
/**
 * ¿La fila merece «Alerta»? Una AGRUPADORA cuyo total ≠ suma de sus hijos (Δ), o un
 * MOVIMIENTO problemático: con débito/crédito INVERTIDOS (cuadra al intercambiarlos —
 * descuadra la partida doble) o marcado «descuadre» (no cuadra en ninguna orientación).
 * Las filas omitidas no alertan.
 */
const esAlertaNodo = (n: NodoBorrador): boolean => {
  if (n.descuadre != null && n.descuadre !== 0) return true;
  if (n.omitida) return false;
  if (n.tipoFila === "descuadre") return true;
  if (n.tipoFila !== "movimiento") return false;
  return !controlCuadraFila(n.saldoInicial, n.debitos, n.creditos, n.saldoFinal)
    && controlCuadraFila(n.saldoInicial, n.creditos, n.debitos, n.saldoFinal);
};

// Posición de cada nodo para el TABULADOR: `prev` = filaNum del hermano anterior (para
// indentar → colgarlo de él); `abuelo` = filaNum del abuelo (para desindentar → subirlo).
type Posicion = { prev: number | null; abuelo: number | null };
function construirPosiciones(arbol: NodoBorrador[]): Map<number, Posicion> {
  const m = new Map<number, Posicion>();
  const rec = (nodos: NodoBorrador[], abuelo: number | null, padre: number | null) => {
    nodos.forEach((n, i) => {
      m.set(n.filaNum, { prev: i > 0 ? nodos[i - 1].filaNum : null, abuelo });
      rec(n.hijos, padre, n.filaNum);
    });
  };
  rec(arbol, null, null);
  return m;
}
const nivelLabel = (codigo: string) => (codigo.length <= 2 ? "Clase" : codigo.length <= 4 ? "Grupo" : codigo.length <= 6 ? "Cuenta" : "Subcuenta");

/** Modal "Ubicar": elige bajo cuál cuenta de arriba anidar la fila (ancestros por
 *  prefijo, el más profundo sugerido) y mueve en LOTE sus hermanas del mismo prefijo. */
function MoverModal({ arbol, filaNum, contexto, onConfirmar, onClose }: {
  arbol: NodoBorrador[];
  filaNum: number;
  contexto: Map<number, ContextoNodo>;
  onConfirmar: (patch: Record<number, number>) => void;
  onClose: () => void;
}) {
  const ctx = contexto.get(filaNum);
  const candidatos = ctx?.candidatos ?? [];
  const hermanas = ctx?.hermanas ?? [];
  // Hermanas que anidarían bajo un destino dado (mismo prefijo, más específicas que él).
  const elegiblesDe = (ref?: RefNodo) => (ref ? hermanas.filter((h) => h.codigo.startsWith(ref.codigo) && h.codigo.length > ref.codigo.length) : []);

  const [destino, setDestino] = useState<number>(candidatos[0]?.filaNum ?? -1);
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set(elegiblesDe(candidatos[0]).map((h) => h.filaNum)));
  const nodoX = useMemo(() => {
    const buscar = (ns: NodoBorrador[]): NodoBorrador | null => {
      for (const n of ns) { if (n.filaNum === filaNum) return n; const h = buscar(n.hijos); if (h) return h; }
      return null;
    };
    return buscar(arbol);
  }, [arbol, filaNum]);

  if (!ctx || candidatos.length === 0 || !nodoX) return null;

  const destinoRef = candidatos.find((c) => c.filaNum === destino) ?? candidatos[0];
  const hermanasElegibles = elegiblesDe(destinoRef);
  // Al cambiar el destino, re-marcar TODAS las hermanas elegibles del nuevo prefijo.
  const cambiarDestino = (fn: number) => { setDestino(fn); const ref = candidatos.find((c) => c.filaNum === fn); setMarcadas(new Set(elegiblesDe(ref).map((h) => h.filaNum))); };
  const toggleH = (fn: number) => setMarcadas((s) => { const n = new Set(s); if (n.has(fn)) n.delete(fn); else n.add(fn); return n; });
  const marcadasVisibles = hermanasElegibles.filter((h) => marcadas.has(h.filaNum)).length;
  const total = 1 + marcadasVisibles;
  const confirmar = () => {
    const patch: Record<number, number> = { [filaNum]: destinoRef.filaNum };
    for (const h of hermanasElegibles) if (marcadas.has(h.filaNum)) patch[h.filaNum] = destinoRef.filaNum;
    onConfirmar(patch);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Ubicar cuenta en el árbol"
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">Cancelar</button>
          <button type="button" onClick={confirmar} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600">Ubicar {total} cuenta(s)</button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-[12.5px]">
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
          <span className="font-mono text-[11px] text-ink-500">{nodoX.codigoCrudo}</span>{" "}
          <span className="font-medium text-ink-800">{nodoX.nombre}</span>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Anidar bajo</div>
          <div className="flex flex-col gap-1">
            {candidatos.map((c, i) => (
              <label key={c.filaNum} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 ${destino === c.filaNum ? "border-blue-300 bg-blue-50" : "border-ink-150 hover:bg-ink-50"}`}>
                <input type="radio" name="destino-ubicar" checked={destino === c.filaNum} onChange={() => cambiarDestino(c.filaNum)} />
                <span className="font-mono text-[11px] text-ink-500">{c.codigoCrudo}</span>
                <span className="min-w-0 truncate text-ink-800" title={c.nombre}>{c.nombre}</span>
                <span className="ml-auto shrink-0 text-[10.5px] text-ink-400">{nivelLabel(c.codigo)}{i === 0 ? " · sugerido" : ""}</span>
              </label>
            ))}
          </div>
        </div>

        {hermanasElegibles.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Mover también estas cuentas (prefijo <span className="font-mono">{destinoRef.codigo}</span>)</span>
              <span className="flex shrink-0 gap-2 text-[11px]">
                <button type="button" onClick={() => setMarcadas(new Set(hermanasElegibles.map((h) => h.filaNum)))} className="font-medium text-blue-700 hover:underline">Todas</button>
                <button type="button" onClick={() => setMarcadas(new Set())} className="font-medium text-ink-500 hover:underline">Ninguna</button>
              </span>
            </div>
            <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
              {hermanasElegibles.map((h) => (
                <label key={h.filaNum} className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-150 px-2.5 py-1 hover:bg-ink-50">
                  <input type="checkbox" checked={marcadas.has(h.filaNum)} onChange={() => toggleH(h.filaNum)} />
                  <span className="font-mono text-[11px] text-ink-500">{h.codigoCrudo}</span>
                  <span className="min-w-0 truncate text-ink-700" title={h.nombre}>{h.nombre}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ArbolTabla({ arbol, onReclasificar, onInvertir, onDesacoplar, onOmitir, posiciones, contexto, onUbicar, onDesindentar }: { arbol: NodoBorrador[]; onReclasificar: (codigo: string, actual: NodoBorrador["tipoFila"]) => void; onInvertir: (codigo: string) => void; onDesacoplar: (codigo: string, desacopladaAhora: boolean) => void; onOmitir: (filaNum: number, omitidaAhora: boolean) => void; posiciones: Map<number, Posicion>; contexto: Map<number, ContextoNodo>; onUbicar: (filaNum: number) => void; onDesindentar: (filaNum: number) => void }) {
  // Control contable: saldo ant + débito − crédito = saldo actual (±$1).
  const controlOk = (si: number, db: number, cr: number, s: number) => Math.abs(si + db - cr - s) <= 1;
  // Expande por defecto los niveles altos y TODA rama con descuadre (para verlo).
  const expandidosInicial = useMemo(() => {
    const s = new Set<number>();
    const rec = (n: NodoBorrador) => {
      if ((n.codigo.length > 0 && n.codigo.length <= 2) || tieneDescuadre(n)) s.add(n.filaNum);
      n.hijos.forEach(rec);
    };
    arbol.forEach(rec);
    return s;
  }, [arbol]);
  const [abiertos, setAbiertos] = useState<Set<number>>(expandidosInicial);
  const toggle = (k: number) => setAbiertos((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const codigosConHijos = useMemo(() => { const s = new Set<number>(); const rec = (n: NodoBorrador) => { if (n.hijos.length > 0) s.add(n.filaNum); n.hijos.forEach(rec); }; arbol.forEach(rec); return s; }, [arbol]);
  const expandirTodo = () => setAbiertos(new Set(codigosConHijos));
  const contraerTodo = () => setAbiertos(new Set());

  // ---- Filtros del árbol: búsqueda, vista (Balance/Estado de Resultado/Alertas)
  //      y nivel máximo (N2/N4/N6/N8). ----
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<"todo" | "balance" | "er" | "alertas">("todo");
  const [nivelMax, setNivelMax] = useState(0); // 0 = todos; 2/4/6/8 = hasta ese nivel
  const needle = q.trim().toLowerCase();
  const matchQ = (n: NodoBorrador) => needle === "" || n.codigo.toLowerCase().includes(needle) || (n.nombre ?? "").toLowerCase().includes(needle);
  const filtrando = needle !== "" || vista !== "todo" || nivelMax > 0;
  const nAlertas = useMemo(() => { let n = 0; const rec = (x: NodoBorrador) => { if (esAlertaNodo(x)) n++; x.hijos.forEach(rec); }; arbol.forEach(rec); return n; }, [arbol]);

  // Poda del árbol según los filtros (conserva ancestros de las coincidencias).
  const arbolVisible = useMemo(() => {
    if (!filtrando) return arbol;
    const enVista = (x: NodoBorrador) => {
      if (vista === "todo" || vista === "alertas") return true;
      const d = x.codigo.charAt(0);
      if (!/[1-7]/.test(d)) return true; // estructural (sucursal / orden) → no filtra por clase
      return vista === "balance" ? "123".includes(d) : "4567".includes(d);
    };
    const nivelOk = (x: NodoBorrador) => nivelMax === 0 || !/^\d+$/.test(x.codigo) || x.codigo.length <= nivelMax;
    const selfMatch = (x: NodoBorrador) => matchQ(x) && (vista !== "alertas" || esAlertaNodo(x));
    const podar = (nodos: NodoBorrador[]): NodoBorrador[] => {
      const out: NodoBorrador[] = [];
      for (const x of nodos) {
        if (!nivelOk(x) || !enVista(x)) continue;
        const hijos = podar(x.hijos);
        if (selfMatch(x) || hijos.length > 0) out.push({ ...x, hijos });
      }
      return out;
    };
    return podar(arbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arbol, q, vista, nivelMax]);

  const filas: React.ReactNode[] = [];
  const render = (n: NodoBorrador, depth: number, padreCodigo: string | null) => {
    const hasHijos = n.hijos.length > 0;
    const esMatch = needle !== "" && matchQ(n);
    const open = filtrando ? true : abiertos.has(n.filaNum); // filtrado → todo expandido
    const esMov = n.tipoFila === "movimiento" || n.tipoFila === "descuadre";
    const descuadrado = n.descuadre != null && n.descuadre !== 0;
    // Lados invertidos: el control no cuadra, pero SÍ al intercambiar débito↔crédito.
    const ladosInv = esMov && !controlOk(n.saldoInicial, n.debitos, n.creditos, n.saldoFinal) && controlOk(n.saldoInicial, n.creditos, n.debitos, n.saldoFinal);
    // Desacople: ya desacoplada (permite REACOPLAR), o cuelga de una agrupadora que NO
    // es su prefijo (candidata a DESACOPLAR: el ERP la ubicó bajo un grupo de código
    // ajeno). Solo aplica a movimientos con código numérico.
    const numero = /^\d+$/.test(n.codigo);
    const desacopladaAhora = !!n.desacoplada;
    const bajoAjena = numero && padreCodigo != null && /^\d+$/.test(padreCodigo) && !n.codigo.startsWith(padreCodigo);
    const puedeDesacoplar = esMov && numero && (desacopladaAhora || bajoAjena);
    // Omitir: la fila se conserva pero no cuenta en los cálculos ni se carga al balance.
    // Aplica a MOVIMIENTOS (lo que suma) y a filas TOTAL/pie del reporte (p. ej.
    // «Totales Prueba»), que ya no cuentan pero se pueden marcar/excluir del export.
    const omitida = !!n.omitida;
    // Omitir aplica a movimientos y a filas TOTAL/pie. Además, CUALQUIER fila ya omitida
    // muestra «Incluir» para RESCATARLA — incluye las agrupadoras del re-listado con
    // guiones que se marcaron tachadas automáticamente.
    const puedeOmitir = esMov || n.tipoFila === "total" || omitida;
    // Tabulador (re-parentado manual): → abre el modal "Ubicar" (elegir destino + mover
    // hermanas en lote) si la fila está mal ubicada; ← sube un nivel (al abuelo).
    const pos = numero ? posiciones.get(n.filaNum) : undefined;
    const ctxFila = numero ? contexto.get(n.filaNum) : undefined;
    const puedeUbicarFila = puedeUbicar(ctxFila);
    const puedeDesindentar = !!pos && pos.abuelo != null;
    const reparentada = n.padreManual != null;
    const estadoVisualFila = esMatch
      ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
      : reparentada
        ? "bg-blue-100/70 ring-1 ring-inset ring-blue-300 hover:bg-blue-100"
        : esMov
          ? "hover:bg-ink-50/60"
          : "bg-ink-50/40";
    filas.push(
      <tr key={n.filaNum} className={`border-t border-ink-100 transition-colors ${omitida ? "opacity-45" : ""} ${estadoVisualFila}`}>
        <td className={`px-2 py-1 align-top ${reparentada ? "border-l-[3px] border-l-blue-500" : ""}`}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 4 + depth * 16 }}>
            {hasHijos ? (
              <button onClick={() => toggle(n.filaNum)} className="text-ink-400 hover:text-ink-700"><Icon name={open ? "chev-d" : "chev-r"} size={13} /></button>
            ) : (
              <span className="inline-block w-[13px]" />
            )}
            <span className="font-mono text-[11px] text-ink-500">{n.codigoCrudo || "—"}</span>
          </div>
        </td>
        <td className="px-2 py-1 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[12px] ${omitida ? "text-ink-400 line-through" : descuadrado ? "font-semibold text-err-700 underline decoration-err-500 decoration-2 underline-offset-2" : "text-ink-800"}`} title={n.nombre}>
              {n.nombre}
            </span>
            {omitida && <Chip label="Omitida · no cuenta" tone="warn" />}
            {n.subtotalDuplicado ? (
              <span title="Subtotal de 6 díg cuyo detalle de 8 díg (mismas 4 columnas) está mal-numerado. No se carga: su detalle ya lleva el valor.">
                <Chip label="Subtotal duplicado · no se carga" tone="warn" />
              </span>
            ) : n.tipoFila === "total" ? (
              <Chip label="Total" tone="ink" />
            ) : esMov ? (
              <Chip label="Movimiento" tone="blue" />
            ) : (
              <Chip label={`Agrupadora · ${nivelLabel(n.codigo)}`} tone="ink" />
            )}
            {descuadrado && (
              <span className="text-[10.5px] font-semibold text-err-700" title={`Total del archivo ${fmt(n.saldoFinal)} − suma de sus ${n.hijos.length} cuentas = ${fmt(n.descuadre!)}. Su subtotal no cuadra con su desglose por código.`}>
                Δ {fmt(n.descuadre!)}
              </span>
            )}
            {n.tipoFila !== "total" && /^\d+$/.test(n.codigo) && (
              <button
                type="button"
                onClick={() => onReclasificar(n.codigo, n.tipoFila)}
                title={esMov ? "Marcar esta cuenta como AGRUPADORA (dejará de cargarse)" : "Marcar esta cuenta como MOVIMIENTO (se cargará su saldo)"}
                className="rounded border border-ink-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {esMov ? "⇄ Agrupadora" : "⇄ Movimiento"}
              </button>
            )}
            {ladosInv && (
              <button
                type="button"
                onClick={() => onInvertir(n.codigo)}
                title={`Débito y crédito están invertidos (déb ${fmt(n.debitos)} / créd ${fmt(n.creditos)}): el control no cuadra con el saldo, pero sí al intercambiarlos. Corrige el lado.`}
                className="rounded border border-warn-300 bg-warn-50 px-1.5 py-0.5 text-[10px] font-semibold text-warn-700 hover:bg-warn-100"
              >
                ⇄ Débito/Crédito
              </button>
            )}
            {puedeDesacoplar && (
              <button
                type="button"
                onClick={() => onDesacoplar(n.codigo, desacopladaAhora)}
                title={desacopladaAhora
                  ? "Reacoplar: volver a colgar esta cuenta de la agrupadora por orden del archivo."
                  : `Desacoplar de ${padreCodigo}: esta cuenta cuelga de una agrupadora de código ajeno. Sácala y anídala bajo su padre real por código (prefijo).`}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${desacopladaAhora ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100" : "border-ink-200 text-ink-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"}`}
              >
                {desacopladaAhora ? "⇄ Reacoplar" : "⇄ Desacoplar"}
              </button>
            )}
            {puedeOmitir && (
              <button
                type="button"
                onClick={() => onOmitir(n.filaNum, omitida)}
                title={omitida
                  ? "Incluir de nuevo este registro en los cálculos."
                  : "Omitir este registro de los cálculos. Se conserva en el crudo (comparativo línea a línea en Excel) y NO se carga al balance."}
                className={omitida
                  ? "inline-flex items-center rounded-md border border-ink-200 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500 hover:bg-ink-100"
                  : "inline-flex items-center rounded-md border border-err-300 bg-err-100 px-1.5 py-0.5 font-bold text-err-700 hover:bg-err-200"}
              >
                {omitida ? "Incluir" : <Icon name="x" size={14} />}
              </button>
            )}
            {(puedeUbicarFila || puedeDesindentar || reparentada) && (
              <span className="inline-flex items-center gap-0.5" title="Tabulador: ubica esta fila en la rama correcta. → elige bajo cuál cuenta anidarla (y mueve las cuentas del mismo grupo en lote); ← la sube un nivel.">
                <button
                  type="button"
                  disabled={!puedeDesindentar}
                  onClick={() => onDesindentar(n.filaNum)}
                  title="Desindentar: subir esta fila un nivel (a su agrupadora superior)."
                  className="rounded border border-ink-200 px-1 py-0.5 text-[11px] font-bold leading-none text-ink-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-default disabled:opacity-30 disabled:hover:border-ink-200 disabled:hover:bg-transparent disabled:hover:text-ink-500"
                >←</button>
                <button
                  type="button"
                  disabled={!puedeUbicarFila}
                  onClick={() => onUbicar(n.filaNum)}
                  title="Ubicar: elegir bajo cuál cuenta de arriba anidar esta fila y mover las cuentas del mismo grupo en lote."
                  className="rounded border border-ink-200 px-1 py-0.5 text-[11px] font-bold leading-none text-ink-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-default disabled:opacity-30 disabled:hover:border-ink-200 disabled:hover:bg-transparent disabled:hover:text-ink-500"
                >→</button>
                {reparentada && (
                  <span title="Esta fila fue reubicada y se muestra sombreada en su nueva posición dentro del árbol.">
                    <Chip label="↳ movida aquí" tone="blue" />
                  </span>
                )}
              </span>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmt(n.saldoInicial)}</td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmt(n.debitos)}</td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmt(n.creditos)}</td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top font-medium tabular-nums text-ink-800">{fmt(n.saldoFinal)}</td>
      </tr>,
    );
    if (hasHijos && open) n.hijos.forEach((h) => render(h, depth + 1, n.codigo));
  };
  arbolVisible.forEach((r) => render(r, 0, null));

  const nivelBtn = (v: number, label: string) => (
    <button type="button" onClick={() => setNivelMax(v)} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${nivelMax === v ? "bg-navy-700 text-white" : "text-ink-500 hover:bg-ink-100"}`}>{label}</button>
  );
  const vistaBtn = (v: typeof vista, label: string, count?: number) => (
    <button type="button" onClick={() => setVista(v)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ${vista === v ? "bg-navy-700 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}{count != null && count > 0 && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${vista === v ? "bg-white/20" : "bg-warn-100 text-warn-700"}`}>{count}</span>}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 bg-white px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-ink-50 px-2 py-1 text-ink-400">
          <Icon name="search" size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código o cuenta…" className="w-44 bg-transparent text-[12px] text-ink-700 outline-none placeholder:text-ink-400" />
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-ink-200 p-0.5">
          {nivelBtn(0, "Todos")}{nivelBtn(2, "N2")}{nivelBtn(4, "N4")}{nivelBtn(6, "N6")}{nivelBtn(8, "N8")}
        </div>
        <span className="mx-0.5 h-4 w-px bg-ink-200" />
        {vistaBtn("todo", "Todo")}
        {vistaBtn("balance", "Balance")}
        {vistaBtn("er", "Estado de Resultado")}
        {vistaBtn("alertas", "Alertas", nAlertas)}
        <span className="mx-0.5 h-4 w-px bg-ink-200" />
        <button type="button" onClick={expandirTodo} className="rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50">Expandir todo</button>
        <button type="button" onClick={contraerTodo} className="rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50">Contraer todo</button>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="balance-detail-row-hover w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-semibold">Código</th>
              <th className="px-2 py-1.5 font-semibold">Cuenta</th>
              <th className="px-2 py-1.5 text-right font-semibold">Saldo ant.</th>
              <th className="px-2 py-1.5 text-right font-semibold">Débito</th>
              <th className="px-2 py-1.5 text-right font-semibold">Crédito</th>
              <th className="px-2 py-1.5 text-right font-semibold">Saldo actual</th>
            </tr>
          </thead>
          <tbody>{filas.length > 0 ? filas : <tr><td colSpan={6} className="px-3 py-6 text-center text-[12px] text-ink-400">Sin cuentas para este filtro.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Compuerta al entrar al borrador cuando NO se detectó el cliente por NIT: exige
 * elegir cliente + período antes de operar, para que apliquen sus preferencias/
 * notas y no se cargue el balance a ciegas. Se cierra solo con la X/Cancelar.
 */
function GateClientePeriodo({
  clientes, nitDetectado, clienteSelId, periodoIni, periodoFin, onConfirmar, onClose,
}: {
  clientes: Cliente[];
  nitDetectado: string | null;
  clienteSelId: number | null;
  periodoIni: string;
  periodoFin: string;
  onConfirmar: (clienteId: number, ini: string, fin: string) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState(clienteSelId ? String(clienteSelId) : "");
  const [ini, setIni] = useState(periodoIni);
  const [fin, setFin] = useState(periodoFin);
  const listo = !!sel && !!ini && !!fin && fin >= ini;
  return (
    <Modal
      open
      onClose={onClose}
      title="Selecciona el cliente y el período"
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!listo}
            onClick={() => onConfirmar(Number(sel), ini, fin)}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            Continuar
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px]">
        <p className="text-ink-600">
          {nitDetectado ? <>El NIT detectado <span className="font-mono">{nitDetectado}</span> no coincide con ningún cliente.</> : <>No se detectó el cliente en el archivo.</>}{" "}
          Elige el cliente y el período para aplicar sus preferencias y notas de carga, y poder cargar el balance.
        </p>
        <SelectorClienteBuscable
          clients={clientes}
          value={sel ? Number(sel) : null}
          onChange={(clientId) => setSel(clientId == null ? "" : String(clientId))}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Período desde</span>
            <input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Período hasta</span>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
          </label>
        </div>
        {!!ini && !!fin && fin < ini && <p className="text-[11.5px] font-medium text-err-700">El período hasta no puede ser anterior al período desde.</p>}
      </div>
    </Modal>
  );
}
