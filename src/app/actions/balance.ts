"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { clienteDeBalance } from "@/lib/rbac/contexto";
import { parseId } from "@/lib/ids";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";
import { createProcessNotification } from "@/lib/notifications";
import { mensajeErrorBD, mensajeErrorIA } from "@/lib/errores";
import { fmt, MESES_LARGOS } from "@/lib/format";
import { fechaCalendarioPrisma } from "@/lib/fecha-hora";
import { ConfirmarBalanceSchema, PayloadCargaBalanceSchema, SpecCargaBalanceSchema, type ActionState, type PayloadCargaBalance } from "@/lib/definitions";
import { claveNit } from "@/lib/nit";
import { firmarPayloadServidor, validarFirmaPayloadServidor } from "@/lib/server-payload";
import { parseBalanceWorkbook, type ImportBalanceState } from "@/lib/import/balance";
import {
  calcularBalance,
  construirValidacionContable,
  reconstruirBalance,
  aFilasDetalle,
  aplanarBreakdown,
  compararBalances,
  tokenizarPlan,
  limpiarCodigo,
  conForzarHoja,
  type CuentaCruda,
  type CuentaEstandar,
  type ResultadoBalance,
  type ValidacionContable,
} from "@/lib/balance/calcular";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import { TIPO_BALANCE_CARGA } from "@/lib/balance/tipo-balance";
import { extraerBalance } from "@/lib/balance/extraccion/extraer";
import { ingerir, type Ingesta } from "@/lib/balance/extraccion/ingesta";
import { huellasCandidatas, detectarNit, calcularHuella } from "@/lib/balance/extraccion/huella";
import { aplanarSpec, normalizarCodigoFragmentos, specDesdePerfil, specCargaDesdePerfil, type PerfilPlano } from "@/lib/balance/extraccion/perfil";
import { esTransformacionAceptable } from "@/lib/balance/extraccion/validacion";
import { mapearPorIA } from "@/lib/balance/mapeo-ia";
import { construirVistaBorrador } from "@/lib/balance/borrador-vm";
import { reclasificarHuerfanas, reclasificarSoloHojas, corregirCodigosPlaceholder, marcarNoContables, validarReubicacionesBorrador, type FilaBorrador } from "@/lib/balance/borrador";
import { esBalancePorTercero, colapsarTerceros, esBalancePorTerceroSufijo, consolidarTercerosPorSufijo, marcarCuentaNit } from "@/lib/balance/terceros";
import { marcarRelistadoGuiones } from "@/lib/balance/relistado";
import { construirCorrecciones, planAplicarCorrecciones, type CorreccionCuenta, type FilaStagingCorreccion } from "@/lib/balance/correcciones";
import { registrarDiagnosticoInicial, cerrarDiagnostico, acumularIntervencionManual } from "@/lib/balance/diagnostico-lectura-registro";
import { iaBalanceDisponible, proveedorIABalance, type ProveedorIABalance } from "@/lib/ia/proveedor-balance";
import { proveedorIABalanceSesion } from "@/lib/ia/proveedor-balance-sesion";
import { registrarConsumoIA, type UsoIA } from "@/lib/ia/uso";
import { randomUUID } from "node:crypto";
import { construirCuadre, marcarSubtotalesDuplicados, reclasificarRepetidos, reclasificarNoImputables, transformarTabular } from "@/lib/balance/extraccion/transformar";
import type { FilaCruda, ParamsExtraccion, ResultadoTransform, TipoFila } from "@/lib/balance/extraccion/transformar";
import { CUADRE_NO_APLICA } from "@/lib/balance/extraccion/esquema";
import type { CuadreTotales, Excepcion, MappingSpec, Origen, ResumenAuditoria, SpecCarga } from "@/lib/balance/extraccion/esquema";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (admite PDF)
// v2: la firma HMAC cubre SOLO el payload compacto (loteId + metadatos); las
// cuentas ya no viajan de regreso al servidor (el staging es la fuente de verdad).
const CONTEXTO_PAYLOAD_BALANCE = "balance:sugerencia:v2";

// Cómo se obtuvo la estructura del archivo en la lectura:
//   perfil    → perfil guardado del cliente aplicado por huella (0 llamadas IA)
//   ia        → cascada de detección de estructura / extracción directa
//   plantilla → parser determinista de la plantilla limpia (sin API key)
//   manual    → spec ajustado a mano en el editor de estructura
export type OrigenExtraccion = "perfil" | "ia" | "plantilla" | "manual";

// Sugerencia que devuelve la LECTURA del archivo (paso 1). `payload` es lo ÚNICO
// que vuelve al servidor al confirmar (firmado); `render` es solo para pintar la
// revisión en el modal (tabla del borrador, cuadre, editor de estructura) y NO
// viaja de regreso ni se firma.
export type SugerenciaBalance = {
  firma: string; // HMAC del `payload` (contexto balance:sugerencia:v2)
  payload: PayloadCargaBalance;
  render: {
    cuadre: CuadreTotales; // cuadre de las hojas contra la fila TOTALES del archivo
    validacion: ValidacionContable; // borrador: A/P/Patrimonio (archivo vs calculado) + ecuación
    importReady: CuentaCruda[];
    spec: SpecCarga | null; // valores iniciales del editor de estructura (null en PDF/plantilla)
    encabezados: string[]; // celdas de la fila de encabezado usada (labels del editor)
    hojas: string[]; // nombres de hojas de la ingesta (selector del editor)
    clienteDetectadoId: number | null; // resuelto por NIT determinista en el servidor
    proveedorIA: ProveedorIABalance | null; // visible para comprobar el proveedor de la lectura
  };
};

export type LeerBalanceState = {
  ok?: boolean;
  message?: string;
  errores?: NonNullable<ImportBalanceState["errores"]>;
  excepciones?: Excepcion[];
  sugerencia?: SugerenciaBalance;
};

type MetaEtl = {
  estandar: string;
  convencionCredito: string;
  filasLeidas: number;
  filasExcluidas: number;
  filasDescuadre: number;
};

/**
 * Etiqueta legible del período a partir del rango ISO `desde`/`hasta`. Si ambos
 * caen en el mismo mes → «Abril 2026»; si abarcan varios meses → «Enero 2026 –
 * Abril 2026». Es la clave de versionado por período (clienteId, periodo, version).
 */
function etiquetaPeriodo(inicio: string, fin: string): string {
  const a = /^(\d{4})-(\d{2})/.exec(inicio);
  const b = /^(\d{4})-(\d{2})/.exec(fin);
  if (!a || !b) return `${inicio} – ${fin}`;
  const nombre = (mm: string, yyyy: string) => `${MESES_LARGOS[Number(mm) - 1] ?? mm} ${yyyy}`;
  return a[1] === b[1] && a[2] === b[2] ? nombre(b[2], b[1]) : `${nombre(a[2], a[1])} – ${nombre(b[2], b[1])}`;
}

/** Tamaño de archivo legible (KB/MB) en es-CO. */
function tamArchivo(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Etiqueta legible del rol que carga (para la bitácora de versiones). */
function etiquetaRol(code: string): string {
  const map: Record<string, string> = {
    staff: "Staff",
    senior: "Auditor senior",
    gerente: "Gerente",
    socio: "Socio",
    admin: "Administrador",
    superadmin: "Superadministrador",
  };
  return map[code] ?? code;
}

/** Mensaje de bloqueo cuando las hojas (movimiento) no cuadran contra TOTALES. */
function mensajeCuadre(c: CuadreTotales): string {
  const partes: string[] = [];
  if (Math.abs(c.diferenciaDebitos) > c.toleranciaDebitos) {
    partes.push(`débitos: hojas ${fmt(c.sumaDebitos)} vs TOTALES ${fmt(c.totalDebitos)} (Δ ${fmt(c.diferenciaDebitos)})`);
  }
  if (Math.abs(c.diferenciaCreditos) > c.toleranciaCreditos) {
    partes.push(`créditos: hojas ${fmt(c.sumaCreditos)} vs TOTALES ${fmt(c.totalCreditos)} (Δ ${fmt(c.diferenciaCreditos)})`);
  }
  return `El balance no cuadra contra la fila TOTALES del archivo — ${partes.join("; ")}. Revisa la jerarquía de cuentas (padres/auxiliares) y vuelve a leer el archivo.`;
}

/** Resuelve el cliente por NIT (núcleo de 9 dígitos, mismo criterio del selector del modal). */
async function clientePorNit(nit: string | null): Promise<number | null> {
  const core = claveNit(nit ?? "").slice(0, 9);
  if (core.length < 5) return null;
  try {
    const clientes = await prisma.client.findMany({ select: { id: true, nit: true } });
    return clientes.find((c) => claveNit(c.nit).slice(0, 9) === core)?.id ?? null;
  } catch {
    return null; // best-effort: sin cliente detectado la lectura sigue normal
  }
}

type AjustesCarga = { hojaPreferida: string | null; convencionCredito: string | null; estandar: string | null; agregarPorTercero: boolean | null; imputarSoloHojas: boolean | null; observaciones: string | null };

/** Preferencias de carga guardadas del cliente (null si no tiene). Best-effort. */
async function ajustesCargaDeCliente(clienteId: number | null): Promise<AjustesCarga | null> {
  if (clienteId == null) return null;
  try {
    return await prisma.ajustesCargaBalance.findUnique({
      where: { clienteId },
      select: { hojaPreferida: true, convencionCredito: true, estandar: true, agregarPorTercero: true, imputarSoloHojas: true, observaciones: true },
    });
  } catch {
    return null;
  }
}

/** Fila de perfil de carga → PerfilPlano del pipeline (normaliza los enums de BD). */
type FilaPerfilCarga = {
  hoja: string; filaEncabezado: number; primeraFilaDatos: number;
  colCodigo: number; colCodigoFragmentos: unknown; colNombre: number; colSaldoInicial: number; colDebitos: number; colCreditos: number;
  colSaldoFinal: number; colSaldoFinalDebito: number; colSaldoFinalCredito: number; colTercero: number;
  signoCredito: string; reglaDetalleTipo: string; reglaDetalleColumna: number | null; reglaDetalleValor: string | null;
  agregarPorTercero: boolean;
};
function perfilPlanoDesdeFila(p: FilaPerfilCarga): PerfilPlano {
  return {
    hoja: p.hoja, filaEncabezado: p.filaEncabezado, primeraFilaDatos: p.primeraFilaDatos,
    colCodigo: p.colCodigo, colCodigoFragmentos: normalizarCodigoFragmentos(p.colCodigoFragmentos),
    colNombre: p.colNombre, colSaldoInicial: p.colSaldoInicial,
    colDebitos: p.colDebitos, colCreditos: p.colCreditos, colSaldoFinal: p.colSaldoFinal,
    colSaldoFinalDebito: p.colSaldoFinalDebito, colSaldoFinalCredito: p.colSaldoFinalCredito, colTercero: p.colTercero,
    signoCredito: p.signoCredito === "magnitud" ? "magnitud" : "firmado",
    reglaDetalleTipo: p.reglaDetalleTipo === "columna" ? "columna" : "prefijo",
    reglaDetalleColumna: p.reglaDetalleColumna, reglaDetalleValor: p.reglaDetalleValor,
    agregarPorTercero: p.agregarPorTercero,
  };
}

// Paso 2 — «análisis por cuentas»: agrega las filas de MOVIMIENTO del staging por
// código de cuenta (suma terceros/auxiliares del mismo código) → `CuentaCruda[]`
// listo para `persistirCargue`. Los Decimal de Prisma se convierten a number.
type FilaStaging = { codigo: string; nombre: string; saldoInicial: unknown; debitos: unknown; creditos: unknown; saldoFinal: unknown };
function agregarStagingPorCuenta(filas: FilaStaging[]): CuentaCruda[] {
  const m = new Map<string, CuentaCruda>();
  for (const f of filas) {
    const si = Number(f.saldoInicial), db = Number(f.debitos), cr = Number(f.creditos), sf = Number(f.saldoFinal);
    const prev = m.get(f.codigo);
    if (!prev) m.set(f.codigo, { code: f.codigo, name: f.nombre, prevBalance: si, balance: sf, debitos: db, creditos: cr });
    else {
      prev.prevBalance += si;
      prev.balance += sf;
      prev.debitos = (prev.debitos ?? 0) + db;
      prev.creditos = (prev.creditos ?? 0) + cr;
    }
  }
  return [...m.values()];
}

/**
 * Análisis por cuentas del STAGING de un lote: relee TODAS las filas (no solo
 * `movimiento`, para poder reclasificar), colapsa terceros, reclasifica
 * repetidos/no imputables/huérfanas, excluye omitidas y subtotales duplicados, y
 * agrega por código. Es EXACTAMENTE lo que se promoverá a oficial — lo comparten
 * la promoción (`promoverStagingAOficial`) y la auditoría pre-carga
 * (`auditarCargaBalance`), para que ambas vean lo mismo. `[]` si el lote no existe.
 */
async function cuentasDesdeStaging(loteId: string): Promise<CuentaCruda[]> {
  const staged = await prisma.balanceImportacionStaging.findMany({
    where: { loteId },
    orderBy: { filaNum: "asc" },
    select: { filaNum: true, codigo: true, codigoCrudo: true, nombre: true, nivel: true, tipoFila: true, omitida: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
  });
  const filasStaging: FilaBorrador[] = staged.map((f) => ({
    // TRI-ESTADO durable: null (BD) = «sin tocar» → undefined (elegible para el marcado
    // del re-listado con guiones); false = RESCATADA a mano → cuenta y SÍ se carga
    // (el override manual gana); true = omitida → no se carga.
    filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, nivel: f.nivel, tipoFila: f.tipoFila as TipoFila, omitida: f.omitida ?? undefined,
    saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
  }));
  // Balance ABIERTO POR TERCERO → colapsar el detalle y cargar por CUENTA (lógica
  // separada; los demás informes no se tocan). Las cuentas quedan como imputables.
  let rows = esBalancePorTercero(filasStaging) ? colapsarTerceros(filasStaging) : filasStaging;
  // Tercero con NIT pegado al sufijo del código: consolida por cuenta antes de
  // aplicar las demás reglas del borrador.
  if (esBalancePorTerceroSufijo(rows)) rows = consolidarTercerosPorSufijo(rows);
  // Normaliza rollups SIIGO y evita cargar como cuentas las filas de detalle NIT.
  corregirCodigosPlaceholder(rows);
  marcarCuentaNit(rows);
  // RE-LISTADO CON GUIONES: marca como omitidas las filas «1105-05-04»/«*SIN NOMBRE*»
  // redundantes (que duplican una fila plana existente); NO se cargan (el filtro
  // `!f.omitida` de abajo las excluye), conservando el código plano que cuadra.
  marcarRelistadoGuiones(rows);
  reclasificarRepetidos(rows); // código repetido → movimiento
  reclasificarNoImputables(rows); // pie/total sin código («Total general», marca ERP) → total
  // Omite pies/notas, cuentas de orden 8/9 y totales de sucursal; respeta los
  // rescates manuales del tri-estado `omitida`.
  marcarNoContables(rows);
  // Agrupadora huérfana (sin hijos, con saldo) → movimiento: el ERP la exportó sin
  // desglose; si no, su saldo se pierde al cargar. También recupera lotes viejos.
  reclasificarHuerfanas(rows);
  // Filas OMITIDAS: se conservan en el crudo pero NO se vuelcan al balance oficial.
  const mov = rows.filter((f) => f.tipoFila === "movimiento" && !f.omitida);
  // Excluye subtotales DUPLICADOS (6 díg con detalle 8 díg idéntico) para no doblar.
  const dup = marcarSubtotalesDuplicados(mov);
  const movNetas = mov.filter((f) => !dup.has(f));
  if (movNetas.length === 0) return [];
  // Respeta como hojas los imputables de nivel alto (código repetido/desacople) que
  // el filtro por prefijo de `calcularBalance`/`persistirCargue` descartaría.
  return conForzarHoja(agregarStagingPorCuenta(movNetas));
}

/**
 * Mantiene actualizado el snapshot ligero que consume la LISTA de borradores.
 * El cálculo completo se paga una sola vez al guardar cambios del borrador, no
 * cada vez que cualquier usuario abre `/balance/borradores`.
 */
async function actualizarResumenLoteBorrador(loteId: string) {
  const staged = await prisma.balanceImportacionStaging.findMany({
    where: { loteId },
    orderBy: { filaNum: "asc" },
    select: {
      filaNum: true,
      codigo: true,
      codigoCrudo: true,
      nombre: true,
      nivel: true,
      tipoFila: true,
      desacoplada: true,
      omitida: true,
      padreManual: true,
      saldoInicial: true,
      debitos: true,
      creditos: true,
      saldoFinal: true,
    },
  });
  if (staged.length === 0) return;

  const filas: FilaBorrador[] = staged.map((fila) => ({
    filaNum: fila.filaNum,
    codigo: fila.codigo,
    codigoCrudo: fila.codigoCrudo,
    nombre: fila.nombre,
    nivel: fila.nivel,
    tipoFila: fila.tipoFila as TipoFila,
    desacoplada: fila.desacoplada,
    omitida: fila.omitida ?? undefined,
    padreManual: fila.padreManual,
    saldoInicial: Number(fila.saldoInicial),
    debitos: Number(fila.debitos),
    creditos: Number(fila.creditos),
    saldoFinal: Number(fila.saldoFinal),
  }));
  const diagnostico = construirVistaBorrador(filas).diagnostico;

  await prisma.balanceImportacionLote.updateMany({
    where: { loteId },
    data: {
      cuentasMovimiento: diagnostico.movimientos,
      filasLeidas: diagnostico.filas,
      partidaDobleDiff: diagnostico.partidaDobleDiff,
      ecuacionDiff: diagnostico.ecuacionDiff,
      cuadrado: diagnostico.cuadrado,
    },
  });
}

/** Filas del staging de un lote en el formato PURO de correcciones (Decimal→number). */
async function filasStagingCorreccion(loteId: string): Promise<FilaStagingCorreccion[]> {
  const rows = await prisma.balanceImportacionStaging.findMany({
    where: { loteId },
    orderBy: { filaNum: "asc" },
    select: {
      filaNum: true, codigo: true, codigoCrudo: true, nombre: true, tipoFila: true,
      saldoInicial: true, debitos: true, creditos: true, saldoFinal: true,
      desacoplada: true, omitida: true, padreManual: true,
    },
  });
  return rows.map((f) => ({
    filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, tipoFila: f.tipoFila,
    saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
    desacoplada: f.desacoplada, omitida: f.omitida, padreManual: f.padreManual,
  }));
}

/**
 * MEMORIZA en el perfil del cliente las correcciones por cuenta (upsert por
 * clienteId+cuenta; solo pisa los campos que la corrección trae). LANZA si la BD
 * falla — el llamador decide si es best-effort. Devuelve cuántas cuentas quedaron.
 */
async function memorizarCorreccionesCliente(clienteId: number, correcciones: CorreccionCuenta[], usuario: string | null): Promise<number> {
  // Por lotes: «evitar doble conteo de subtotales» puede producir cientos de reclasificaciones
  // y un upsert por viaje sería lento.
  const LOTE_UPSERT = 200;
  for (let i = 0; i < correcciones.length; i += LOTE_UPSERT) {
    await prisma.$transaction(correcciones.slice(i, i + LOTE_UPSERT).map((c) =>
      prisma.correccionCargaBalance.upsert({
        where: { clienteId_cuenta: { clienteId, cuenta: c.cuenta } },
        create: {
          clienteId, cuenta: c.cuenta, nombre: c.nombre,
          tipoFilaForzado: c.tipoFilaForzado, invertirLados: c.invertirLados,
          desacoplada: c.desacoplada, omitida: c.omitida,
          padreCodigo: c.padreCodigo !== undefined ? c.padreCodigo : null,
          actualizadoPor: usuario,
        },
        update: {
          ...(c.nombre ? { nombre: c.nombre } : {}),
          ...(c.tipoFilaForzado ? { tipoFilaForzado: c.tipoFilaForzado } : {}),
          ...(c.invertirLados ? { invertirLados: true } : {}),
          ...(c.desacoplada != null ? { desacoplada: c.desacoplada } : {}),
          ...(c.omitida != null ? { omitida: c.omitida } : {}),
          ...(c.padreCodigo !== undefined ? { padreCodigo: c.padreCodigo } : {}),
          actualizadoPor: usuario,
        },
      }),
    ));
  }
  return correcciones.length;
}

/**
 * RE-APLICA al staging de un lote las correcciones memorizadas del cliente, con
 * las mismas salvaguardas del guardado manual (ver `planAplicarCorrecciones`).
 * Actualiza el contador del lote (banner del borrador), el uso de cada corrección
 * y el resumen del encabezado. Devuelve cuántas filas cambió. LANZA si la BD
 * falla — los llamadores lo tratan como best-effort.
 */
async function aplicarCorreccionesGuardadas(loteId: string, clienteId: number): Promise<number> {
  const guardadas = await prisma.correccionCargaBalance.findMany({ where: { clienteId } });
  if (guardadas.length === 0) return 0;
  const filas = await filasStagingCorreccion(loteId);
  if (filas.length === 0) return 0;
  const correcciones: CorreccionCuenta[] = guardadas.map((g) => ({
    cuenta: g.cuenta, nombre: g.nombre,
    tipoFilaForzado: g.tipoFilaForzado === "agrupadora" || g.tipoFilaForzado === "movimiento" ? g.tipoFilaForzado : null,
    invertirLados: g.invertirLados, desacoplada: g.desacoplada, omitida: g.omitida,
    // En un lote NUEVO `padreManual` nace null: el `padreCodigo` null memorizado
    // (quitar override) queda inerte, como debe.
    padreCodigo: g.padreCodigo,
  }));
  const plan = planAplicarCorrecciones(filas, correcciones);
  if (plan.cambios.length === 0) return 0;
  await prisma.$transaction(plan.cambios.map((ch) => {
    const data: Record<string, unknown> = {};
    if (ch.tipoFila) data.tipoFila = ch.tipoFila;
    if (ch.debitos !== undefined) data.debitos = ch.debitos;
    if (ch.creditos !== undefined) data.creditos = ch.creditos;
    if (ch.desacoplada !== undefined) data.desacoplada = ch.desacoplada;
    if (ch.omitida !== undefined) data.omitida = ch.omitida;
    if (ch.padreManual !== undefined) data.padreManual = ch.padreManual;
    return prisma.balanceImportacionStaging.updateMany({ where: { loteId, filaNum: ch.filaNum }, data });
  }));
  await prisma.balanceImportacionLote.updateMany({
    where: { loteId },
    data: { correccionesAplicadas: { increment: plan.cambios.length } },
  });
  await prisma.correccionCargaBalance.updateMany({
    where: { clienteId, cuenta: { in: plan.cuentasAplicadas } },
    data: { vecesAplicada: { increment: 1 }, ultimoUsoEn: new Date() },
  });
  await actualizarResumenLoteBorrador(loteId);
  return plan.cambios.length;
}

// Promueve un LOTE de staging a balance OFICIAL. Núcleo compartido por el flujo
// del modal (`confirmarCargaBalance`, con payload firmado) y por el de la página
// de borrador (`cargarBorrador`, con el encabezado persistido). Relee el staging,
// hace el análisis por cuentas, persiste y PURGA el lote (staging + encabezado).
type MetaPromocion = {
  loteId: string;
  clientId: number;
  periodoInicio: string;
  periodoFin: string;
  rolLabel: string;
  archivoNombre: string;
  archivoTam: string;
  nitDetectado: string | null;
  nitFuente: ResumenAuditoria["nit"]["fuente"];
  convencionCredito: string;
  filasLeidas: number;
  filasExcluidas: number;
  filasDescuadre: number;
  cuentasMovimiento: number;
  cuentas: number;
  cuentasAgrupadoras: number;
  cuadreArchivo: { totalDebitos: number; totalCreditos: number } | null; // solo el modal lo trae
  proveedorIA?: ProveedorIABalance;
};
async function promoverStagingAOficial(p: MetaPromocion, contexto: string): Promise<ImportBalanceState> {
  // Análisis por cuentas sobre el staging del lote (MOVIMIENTO agregado por código).
  // El staging es la ÚNICA fuente: sin él no hay nada que promover (ya no existe el
  // respaldo `importReady` del payload — dejó de viajar al cliente).
  let importReadyFinal: CuentaCruda[];
  try {
    importReadyFinal = await cuentasDesdeStaging(p.loteId);
  } catch (e) {
    return { ok: false, message: mensajeErrorBD(contexto, e) };
  }
  if (importReadyFinal.length === 0) return { ok: false, message: "El borrador ya no existe o no tiene cuentas para cargar. Vuelve a leer el archivo." };

  // Cuadre contra la fila TOTALES del archivo (solo el flujo del modal lo trae). Σ
  // firmada: las reversas restan del lado correcto. No bloquea; marca descuadre.
  let cuadreTotales: CuadreTotales | null = null;
  if (p.cuadreArchivo) {
    const sumaDebitos = importReadyFinal.reduce((s, r) => s + (r.debitos ?? 0), 0);
    const sumaCreditos = importReadyFinal.reduce((s, r) => s + (r.creditos ?? 0), 0);
    cuadreTotales = construirCuadre({ detectado: true, debitos: p.cuadreArchivo.totalDebitos, creditos: p.cuadreArchivo.totalCreditos }, sumaDebitos, sumaCreditos);
  }

  try {
    const cliente = await prisma.client.findUnique({ where: { id: p.clientId }, select: { name: true, nit: true, erpId: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    if (cliente.erpId == null) {
      return { ok: false, message: "El cliente no tiene un ERP asignado. Asígnalo en Configuración › Clientes antes de cargar el balance." };
    }

    const period = etiquetaPeriodo(p.periodoInicio, p.periodoFin);
    const periodos = { inicial: p.periodoInicio, final: p.periodoFin };
    const cuentasEstandar = await getCuentasEstandar();
    const user = await getCurrentUser();

    const { id, version, calc } = await persistirCargue({
      clientId: p.clientId, clienteName: cliente.name, clienteNit: cliente.nit,
      period, periodos, importReady: importReadyFinal, cuentasEstandar,
      archivoNombre: p.archivoNombre, archivoTam: p.archivoTam,
      uploadedBy: user?.name ?? "—", uploadedById: user?.id ?? null, rolLabel: p.rolLabel,
      cuadreTotales,
      proveedorIA: p.proveedorIA,
      meta: {
        estandar: TIPO_BALANCE_CARGA, convencionCredito: p.convencionCredito,
        filasLeidas: p.filasLeidas, filasExcluidas: p.filasExcluidas, filasDescuadre: p.filasDescuadre,
      },
    });

    // Cierra la huella diagnóstica (best-effort, ANTES de purgar el staging): resultado
    // + cuánta intervención manual necesitó. Nunca tumba la confirmación.
    try {
      const [nOmi, nPad, nDes] = await Promise.all([
        prisma.balanceImportacionStaging.count({ where: { loteId: p.loteId, omitida: true } }),
        prisma.balanceImportacionStaging.count({ where: { loteId: p.loteId, padreManual: { not: null } } }),
        prisma.balanceImportacionStaging.count({ where: { loteId: p.loteId, desacoplada: true } }),
      ]);
      await cerrarDiagnostico({
        loteId: p.loteId, resultado: "cargado",
        cuadradoFinal: calc.balanced && calc.movimientosCuadran,
        manual: { omitidas: nOmi, reparentadas: nPad, desacopladas: nDes },
      });
    } catch {
      /* best-effort */
    }

    // Promovido → PURGA el lote (staging + encabezado). Best-effort.
    try {
      await prisma.balanceImportacionStaging.deleteMany({ where: { loteId: p.loteId } });
      await prisma.balanceImportacionLote.deleteMany({ where: { loteId: p.loteId } });
    } catch {
      /* best-effort */
    }

    const auditoria: ResumenAuditoria = {
      filasLeidas: p.filasLeidas, filasExcluidas: p.filasExcluidas, filasImportables: p.cuentas, filasDescuadre: p.filasDescuadre,
      cuentasMovimiento: p.cuentasMovimiento, cuentasAgrupadoras: p.cuentasAgrupadoras,
      nit: { valor: p.nitDetectado, fuente: p.nitFuente },
      periodoInicial: { valor: p.periodoInicio, fuente: "FUENTE" },
      periodoFinal: { valor: p.periodoFin, fuente: "FUENTE" },
      estandar: TIPO_BALANCE_CARGA,
      convencionCredito: p.convencionCredito === "magnitud" ? "magnitud" : "firmado",
    };

    return {
      ok: true,
      resumen: {
        id, cliente: cliente.name, period, version,
        cuentas: calc.totalRows, mapped: calc.mapped, unmapped: calc.unmapped, balanced: calc.balanced,
        auditoria,
      },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD(contexto, e) };
  }
}

export async function freezeBalance(formData: FormData): Promise<ActionState> {
  // Primer gate: sesión + permiso de rol (antes de tocar la BD).
  const authz = await authorizePermiso("balance:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Balance inexistente." };
  // Segundo gate: ALCANCE de escritura sobre el cliente del balance (cartera).
  const alcance = await authorizePermiso("balance:editar", { clientId: await clienteDeBalance(id) });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const user = await getCurrentUser();
    const resultado = await transaccionSerializable(async (tx) => {
      const referencia = await tx.balancePruebaEncabezado.findUnique({ where: { id } });
      if (!referencia) return { ok: false as const, message: "Balance inexistente." };

      await tomarCandadoTransaccion(tx, `balance-oficial:${referencia.clienteId}:${referencia.periodo}`);

      const balance = await tx.balancePruebaEncabezado.findUnique({ where: { id } });
      if (!balance) return { ok: false as const, message: "Balance inexistente." };
      if (balance.estaCongelado) {
        return {
          ok: true as const,
          message: "El balance ya estaba congelado.",
          balance,
          congelado: false,
        };
      }

      // La versión oficial es única por (cliente, período): se desmarca cualquier otra.
      await tx.balancePruebaEncabezado.updateMany({
        where: { clienteId: balance.clienteId, periodo: balance.periodo, esOficial: true },
        data: { esOficial: false },
      });
      await tx.balancePruebaEncabezado.update({
        where: { id },
        data: {
          esOficial: true,
          estaCongelado: true,
          estado: "Congelado",
          congeladoPor: user?.name ?? "Sistema",
          congeladoEn: new Date(),
        },
      });

      return {
        ok: true as const,
        message: "Balance congelado como oficial.",
        balance,
        congelado: true,
      };
    });

    if (!resultado.ok) return resultado;
    if (!resultado.congelado) return { ok: true, message: resultado.message };

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CONGELÓ BALANCE",
      entity: `${resultado.balance.nombreCliente} · ${resultado.balance.periodo}`,
      detail: `Versión ${resultado.balance.version} marcada como oficial`,
    });
    await createProcessNotification({
      actor: user?.name,
      text: "congeló el balance oficial de",
      target: `${resultado.balance.nombreCliente} · ${resultado.balance.periodo} · ${resultado.balance.version}`,
    });
    revalidatePath("/", "layout");
    revalidatePath("/balance");
    revalidatePath(`/balance/${id}`);
    return { ok: true, message: resultado.message };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("freezeBalance", e) };
  }
}

/**
 * Asigna manualmente una cuenta del cliente (fila de `balance_prueba_detalle`) a
 * una cuenta del plan estándar Russell. El estándar es de nivel 6 (máxima
 * profundidad del plan), así que `cuenta_6_russell` siempre apunta a ese nivel.
 * Coincidencia = 100 (asignación manual). Recalcula los contadores de mapeo del
 * encabezado.
 */
export async function asignarCuentaEstandar(formData: FormData): Promise<ActionState> {
  // Mapear una línea del balance al plan estándar lo hacen quienes trabajan el
  // balance: Staff y Admin (permiso `balance:crear`, scoped por cliente).
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const detalleId = parseId(formData.get("detalleId"));
  const codigo = String(formData.get("codigo") ?? "").trim();
  if (!detalleId) return { ok: false, message: "Cuenta del balance inexistente." };
  if (!codigo) return { ok: false, message: "Selecciona una cuenta estándar." };

  try {
    const fila = await prisma.balancePruebaDetalle.findUnique({
      where: { id: detalleId },
      select: { cuenta6: true, nombreCuenta: true, encabezado: { select: { id: true, clienteId: true, nombreCliente: true, nit: true } } },
    });
    if (!fila) return { ok: false, message: "La cuenta del balance ya no existe." };

    // Alcance de escritura sobre el cliente del balance (cartera).
    const alcance = await authorizePermiso("balance:crear", { clientId: fila.encabezado.clienteId });
    if (!alcance.ok) return { ok: false, message: alcance.message };

    // La cuenta estándar debe existir (es de 6 dígitos = nivel 6 del plan).
    const std = await prisma.standardAccount.findUnique({ where: { code: codigo }, select: { code: true, name: true } });
    if (!std) return { ok: false, message: "La cuenta estándar seleccionada no existe." };

    const encId = fila.encabezado.id;
    // El mapeo es a nivel de cuenta de 6 dígitos: se aplica a TODAS las cuentas
    // del cliente con el mismo prefijo (cuenta_6) en este balance.
    const afectadas = await prisma.balancePruebaDetalle.updateMany({
      where: { encabezadoId: encId, cuenta6: fila.cuenta6 },
      data: { cuenta6Russell: std.code, coincidencia: 100 },
    });

    // Memoria del cliente (cuentas_cliente): guarda esta asignación como `manual`
    // para reusarla en próximos períodos (y que NO la pise el mapeo automático).
    // No toca el mapeo de conciliación (russellOption) de la fila si ya existe.
    const user = await getCurrentUser();
    const ahora = new Date();
    // Marca el grupo de 6 díg como mapeo MANUAL del cliente (memoria entre períodos).
    await prisma.clientAccount.upsert({
      where: { clienteId_code: { clienteId: fila.encabezado.clienteId, code: fila.cuenta6 } },
      create: { clientName: fila.encabezado.nombreCliente, clienteId: fila.encabezado.clienteId, nit: fila.encabezado.nit, code: fila.cuenta6, level: 6, name: std.name ?? fila.cuenta6, cuenta6Russell: std.code, coincidencia: 100, origenMapeo: "manual", actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
      update: { nit: fila.encabezado.nit, cuenta6Russell: std.code, coincidencia: 100, origenMapeo: "manual", actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
    });
    // Propaga el estándar a las cuentas IMPUTABLES del mismo grupo (display consistente).
    await prisma.clientAccount.updateMany({
      where: { clienteId: fila.encabezado.clienteId, code: { startsWith: fila.cuenta6 }, NOT: { code: fila.cuenta6 } },
      data: { cuenta6Russell: std.code, coincidencia: 100, actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
    });

    // Recalcula contadores de mapeo del encabezado.
    const [total, mapeadas] = await Promise.all([
      prisma.balancePruebaDetalle.count({ where: { encabezadoId: encId } }),
      prisma.balancePruebaDetalle.count({ where: { encabezadoId: encId, cuenta6Russell: { not: null } } }),
    ]);
    await prisma.balancePruebaEncabezado.update({
      where: { id: encId },
      data: { mapeadas, sinMapear: total - mapeadas, completitud: total > 0 ? Math.round((mapeadas / total) * 100) : 100 },
    });

    await logAudit({ user: user?.name ?? "Sistema", action: "ASIGNÓ CUENTA ESTÁNDAR", entity: fila.cuenta6, detail: `${fila.cuenta6} (${afectadas.count} cuenta(s)) → ${std.code}` });
    revalidatePath(`/balance/${encId}`);
    return { ok: true, message: `${afectadas.count} cuenta(s) ${fila.cuenta6}* mapeada(s) a ${std.code}.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("asignarCuentaEstandar", e) };
  }
}

/**
 * Escribe un cargue (encabezado + detalle) a partir de las cuentas ya extraídas
 * (`importReady`). Maneja versionado correlativo por (cliente, período), cálculo
 * de agregados, comparativo de cambios y bitácora. Única ruta de persistencia,
 * invocada solo por `confirmarCargaBalance`. No congela: eso lo hace `freezeBalance`.
 */
async function persistirCargue(p: {
  clientId: number;
  clienteName: string;
  clienteNit: string;
  period: string;
  periodos: { inicial: string; final: string };
  importReady: CuentaCruda[];
  cuentasEstandar: CuentaEstandar[];
  archivoNombre: string;
  archivoTam: string;
  uploadedBy: string;
  uploadedById?: number | null;
  rolLabel: string;
  meta: MetaEtl;
  // Cuadre contra el gran total del archivo (TOTALES). Si no cuadra NO bloquea el
  // cargue: se sube igual y queda marcado como descuadrado (novedad/alerta).
  cuadreTotales?: CuadreTotales | null;
  /** Proveedor de esta carga, YA autorizado por la frontera (sesión: dev o dominio). */
  proveedorIA?: ProveedorIABalance;
}): Promise<{ id: number; version: string; calc: ResultadoBalance }> {
  // Plan pre-tokenizado una vez y compartido entre la pasada determinista y la
  // pasada con override de IA (evita re-tokenizar el plan dos veces por cargue).
  const planTok = tokenizarPlan(p.cuentasEstandar);

  // PUC + configuración de mapeo GUARDADOS del cliente en UNA sola lectura: las
  // filas con mapeo alimentan la config (memoria entre períodos, con PRIORIDAD
  // sobre la cascada; lo `manual` no se recalcula) y TODAS las filas sirven de
  // base de comparación para escribir después SOLO lo que cambió.
  const pucRows = await prisma.clientAccount.findMany({
    where: { clienteId: p.clientId },
    select: { code: true, name: true, level: true, nit: true, clientName: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true },
  });
  const configRows = pucRows.filter((r) => r.cuenta6Russell != null);
  // El mapeo es por cuenta de 6 díg: derivamos el mapa cuenta_6 → estándar desde
  // CUALQUIER fila del cliente (grupo o imputable; todas comparten el estándar),
  // dando prioridad a las filas `manual`. `manualCodes` son los códigos exactos
  // marcados a mano (no se recalculan).
  const configCliente = new Map<string, { std: string; coincidencia: number | null }>();
  for (const r of configRows) {
    const c6 = r.code.slice(0, 6);
    if (!configCliente.has(c6) || r.origenMapeo === "manual") {
      configCliente.set(c6, { std: r.cuenta6Russell as string, coincidencia: r.coincidencia != null ? Number(r.coincidencia) : null });
    }
  }
  const manualCodes = new Set(configRows.filter((r) => r.origenMapeo === "manual").map((r) => r.code));
  const pucExistente = new Map(pucRows.map((r) => [r.code, r]));

  // Barrido 0 (config guardada) + 1 (exacto) + 2 (descripción), deterministas.
  let calc = calcularBalance(p.importReady, p.cuentasEstandar, undefined, planTok, configCliente);

  // Barrido 3 (IA): las cuentas que quedaron sin mapeo se homologan con el
  // proveedor que la frontera ya autorizó (sin él, la compuerta de entorno).
  // Best-effort: si la IA falla o no está configurada, se queda con lo determinista.
  const proveedorIA = p.proveedorIA ?? proveedorIABalance();
  if (iaBalanceDisponible(proveedorIA)) {
    const pendientes = calc.breakdown.flatMap((g) => g.items).filter((it) => !it.mapped).map((it) => ({ code: it.code, name: it.name }));
    if (pendientes.length > 0) {
      const usos: UsoIA[] = [];
      try {
        const plan = p.cuentasEstandar.map((s) => ({ code: s.code, name: s.name ?? "", russell: s.russellAccount ?? "", posibles: s.possibleAccounts ?? "" }));
        const override = await mapearPorIA(pendientes, plan, usos, proveedorIA);
        if (override.size > 0) calc = calcularBalance(p.importReady, p.cuentasEstandar, override, planTok, configCliente);
      } catch {
        /* la IA es opcional: si falla, no rompe el cargue */
      }
      // Registra el consumo de tokens del mapeo (best-effort, no rompe el cargue).
      await registrarConsumoIA(usos, {
        clienteId: p.clientId,
        usuarioId: p.uploadedById ?? null,
        usuarioNombre: p.uploadedBy,
        archivoNombre: p.archivoNombre,
      });
    }
  }

  // Registra/actualiza el PUC del cliente en cuentas_cliente: una fila por cuenta
  // IMPUTABLE (cuenta 8, con su NOMBRE real) + una por grupo de 6 díg, cada una con
  // su mapeo al plan estándar. Es la memoria entre períodos y el PUC real del
  // cliente. NO pisa filas marcadas como `manual`. Best-effort: no rompe el cargue.
  const filasDet = aFilasDetalle(calc.breakdown);
  try {
    const stdName = new Map(p.cuentasEstandar.map((s) => [s.code, s.name ?? s.code]));
    const nivelPorCodigo = (code: string) => (code.length >= 8 ? 8 : code.length === 6 ? 6 : code.length === 4 ? 4 : 2);
    // Una fila por código: imputables (nombre real) y grupos de 6 díg (nombre del estándar).
    const rows = new Map<string, { code: string; level: number; name: string; std: string | null; coincidencia: number | null }>();
    for (const f of filasDet) {
      const coinc = f.coincidencia != null ? Number(f.coincidencia) : null;
      rows.set(f.cuenta8, { code: f.cuenta8, level: nivelPorCodigo(f.cuenta8), name: f.nombreCuenta || f.cuenta8, std: f.cuenta6Russell, coincidencia: coinc });
      if (f.cuenta6 !== f.cuenta8 && !rows.has(f.cuenta6)) {
        const gname = f.cuenta6Russell ? (stdName.get(f.cuenta6Russell) ?? f.cuenta6) : f.cuenta6;
        rows.set(f.cuenta6, { code: f.cuenta6, level: 6, name: gname, std: f.cuenta6Russell, coincidencia: coinc });
      }
    }
    const ahoraDate = new Date();
    // Escritura del PUC en LOTES de concurrencia ACOTADA: disparar los ~750
    // upserts a la vez saturaba el pool (máx. ~10) contra una BD remota y la
    // mayoría fallaba por timeout de conexión, dejando la memoria PUC incompleta.
    // El CONJUNTO de upserts y los datos de cada uno son IDÉNTICOS; solo se acota
    // cuántos viajan en paralelo (≤ pool → nunca encola de más). Sigue siendo
    // best-effort y NO alimenta el resultado del balance (no se lee su salida).
    // Solo se escribe lo que CAMBIÓ respecto a lo ya guardado (comparado contra la
    // lectura única de arriba): en un cliente recurrente con catálogo estable el
    // volcado pasa de ~750 upserts a ~0 escrituras por cargue.
    const sinCambios = (r: { code: string; level: number; name: string; std: string | null; coincidencia: number | null }): boolean => {
      const e = pucExistente.get(r.code);
      if (!e) return false;
      const coincE = e.coincidencia != null ? Math.round(Number(e.coincidencia)) : null;
      const coincR = r.coincidencia != null ? Math.round(r.coincidencia) : null;
      return (
        e.origenMapeo === "automatico" &&
        e.level === r.level &&
        e.name === r.name &&
        (e.cuenta6Russell ?? null) === r.std &&
        coincE === coincR &&
        e.nit === p.clienteNit &&
        e.clientName === p.clienteName
      );
    };
    const aEscribir = [...rows.values()].filter((r) => !manualCodes.has(r.code) && !sinCambios(r));
    const LOTE_PUC = Math.max(1, (parseInt(process.env.DB_POOL_MAX ?? "10", 10) || 10) - 2);
    for (let i = 0; i < aEscribir.length; i += LOTE_PUC) {
      await Promise.all(
        aEscribir.slice(i, i + LOTE_PUC).map((r) =>
          prisma.clientAccount.upsert({
            where: { clienteId_code: { clienteId: p.clientId, code: r.code } },
            create: { clientName: p.clienteName, clienteId: p.clientId, nit: p.clienteNit, code: r.code, level: r.level, name: r.name, cuenta6Russell: r.std, coincidencia: r.coincidencia, origenMapeo: "automatico", actualizadoPor: p.uploadedBy, actualizadoEn: ahoraDate },
            update: { clientName: p.clienteName, nit: p.clienteNit, level: r.level, name: r.name, cuenta6Russell: r.std, coincidencia: r.coincidencia, origenMapeo: "automatico", actualizadoPor: p.uploadedBy, actualizadoEn: ahoraDate },
          }),
        ),
      );
    }
  } catch {
    /* el registro del PUC es best-effort: no rompe el cargue */
  }

  // Novedad de DESCUADRE contra el gran total del archivo (TOTALES): NO bloquea
  // el cargue —se sube todo igual— pero queda como alerta y el balance no-cuadrado.
  const descuadreTotales = !!p.cuadreTotales?.detectado && !p.cuadreTotales.cuadra;
  if (descuadreTotales) {
    calc.validations.push({ id: "cuadre-totales", rule: "Cuadre contra TOTALES del archivo", status: "warn", detail: mensajeCuadre(p.cuadreTotales!), count: 1 });
  }

  const alertas = calc.validations.filter((v) => v.status === "warn").length;
  const complete = calc.totalRows > 0 ? Math.round((calc.mapped / calc.totalRows) * 100) : 100;
  const ahora = new Date();
  const nota = alertas > 0 ? `${alertas} validación(es) con alerta` : "Sin alertas";

  const creado = await transaccionSerializable(async (tx) => {
    await tomarCandadoTransaccion(tx, `balance-cargue:${p.clientId}:${p.period}`);

    // Versionado correlativo por (cliente, período). El candado evita que dos
    // cargues simultáneos calculen la misma versión antes de insertar.
    const previas = await tx.balancePruebaEncabezado.findMany({
      where: { clienteId: p.clientId, periodo: p.period },
      orderBy: { creadoEn: "asc" },
      select: { id: true },
    });
    const version = `v${previas.length + 1}`;
    const status = alertas > 0 ? "Con alertas" : previas.length > 0 ? "Última" : "Única";

    // Comparativo contra la versión previa (solo el conteo de cambios; el diff
    // completo se recalcula al abrir la pantalla de diff).
    let cambios = calc.totalRows;
    const previaId = previas[previas.length - 1]?.id;
    if (previaId) {
      const filasPrev = await tx.balancePruebaDetalle.findMany({
        where: { encabezadoId: previaId },
        select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
      });
      const calcPrev = reconstruirBalance(
        filasPrev.map((f) => ({
          cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
          saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
        })),
        p.cuentasEstandar,
      );
      const diff = compararBalances(aplanarBreakdown(calcPrev.breakdown), aplanarBreakdown(calc.breakdown));
      cambios = diff.summary.added + diff.summary.changed + diff.summary.removed;
    }

    const balance = await tx.balancePruebaEncabezado.create({
      data: {
        clienteId: p.clientId, nombreCliente: p.clienteName, nit: p.clienteNit,
        periodo: p.period, periodoInicio: fechaCalendarioPrisma(p.periodos.inicial), periodoFin: fechaCalendarioPrisma(p.periodos.final),
        version, esOficial: false, estaCongelado: false, estado: status, completitud: complete,
        archivo: p.archivoNombre, tamanoArchivo: p.archivoTam,
        cargadoPor: p.uploadedBy, rolCarga: p.rolLabel, cuadrado: calc.balanced && calc.movimientosCuadran && !descuadreTotales, nota,
        sumaActivo: calc.sums.activo, filasTotales: calc.totalRows,
        mapeadas: calc.mapped, sinMapear: calc.unmapped, criticas: calc.critical, cambios,
        estandar: p.meta.estandar, convencionCredito: p.meta.convencionCredito,
        filasLeidas: p.meta.filasLeidas, filasExcluidas: p.meta.filasExcluidas, filasDescuadre: p.meta.filasDescuadre,
        ultimaCarga: ahora,
        detalles: {
          create: filasDet.map((f) => ({
            cuenta2: f.cuenta2, cuenta4: f.cuenta4, cuenta6: f.cuenta6, cuenta8: f.cuenta8,
            nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell, coincidencia: f.coincidencia,
            saldoInicial: f.saldoInicial, debitos: f.debitos, creditos: f.creditos, saldoFinal: f.saldoFinal,
          })),
        },
      },
      select: { id: true },
    });

    return { id: balance.id, version };
  });

  await logAudit({
    user: p.uploadedBy,
    action: "CARGÓ BALANCE",
    entity: `${p.clienteName} · ${p.period}`,
    detail: `${creado.version} · ${calc.totalRows} cuentas · ${calc.mapped} mapeadas · ${calc.balanced && calc.movimientosCuadran && !descuadreTotales ? "cuadrado" : "descuadra"}`,
  });
  await createProcessNotification({
    actor: p.uploadedBy,
    text: "cargó el balance de",
    target: `${p.clienteName} · ${p.period} · ${creado.version}`,
  });
  revalidatePath("/", "layout");
  revalidatePath("/balance");

  return { id: creado.id, version: creado.version, calc };
}

/**
 * LECTURA (paso 1). Extrae las cuentas del archivo SIN escribir nada (salvo el
 * borrador en staging) y devuelve una sugerencia (NIT/período detectados +
 * cuentas + excepciones) para que la persona la revise y complete antes de
 * confirmar. No exige cliente.
 *
 * Orden de resolución de la ESTRUCTURA (tabular):
 *   1. PERFIL guardado por huella del layout → determinista, 0 llamadas IA.
 *   2. Cascada de IA (Sonnet→Opus) si hay API key.
 *   3. Parser de plantilla limpia si no hay API key ni perfil aplicable.
 * Además detecta el NIT de forma determinista para preseleccionar el cliente y
 * aplicar sus preferencias de carga (hoja preferida, estándar, signo, tercero).
 */
export async function leerBalance(
  _prev: LeerBalanceState,
  formData: FormData,
): Promise<LeerBalanceState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta el archivo del balance (Excel, CSV, TXT, JSON o PDF)." };
  }
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 20 MB." };

  try {
    const proveedorIA = await proveedorIABalanceSesion(formData.get("modeloIA"));
    // Lectura sin parámetros de cliente/período: se detecta todo del archivo
    // como sugerencia. El tipo de balance es regla fija de negocio.
    const params: ParamsExtraccion = { nit: null, periodoInicial: null, periodoFinal: null, estandar: TIPO_BALANCE_CARGA };
    // Hoja elegida por el usuario en Excel multi-hoja (la IA no la asume). Vacío
    // → null: archivos de una sola hoja / CSV / PDF siguen el flujo normal.
    let hoja = String(formData.get("hoja") ?? "").trim() || null;
    const datosArchivo = await archivo.arrayBuffer();
    const usos: UsoIA[] = [];

    // Ingesta ÚNICA (el orquestador la reutiliza). Si el formato es ilegible se
    // deja null: la ruta con IA re-lanza el error legible al re-ingerir; la de
    // plantilla sigue con su propio manejo de errores.
    let ingesta: Ingesta | null = null;
    try {
      ingesta = await ingerir(datosArchivo, archivo.name);
    } catch {
      ingesta = null;
    }

    // ---- Contexto determinista ANTES de llamar a la IA ----
    // NIT → cliente (preselección + preferencias); huella del layout → perfil.
    let clienteDetectadoId: number | null = null;
    let nitDeterminista: string | null = null;
    let specGuardado: MappingSpec | null = null;
    if (ingesta?.modo === "tabular") {
      nitDeterminista = detectarNit(ingesta.hojas);
      clienteDetectadoId = await clientePorNit(nitDeterminista);
      const ajustes = await ajustesCargaDeCliente(clienteDetectadoId);

      // Preferencias del cliente: hoja preferida (si el usuario no eligió una y
      // existe en el archivo) y estándar contable fijado.
      if (!hoja && ajustes?.hojaPreferida && ingesta.hojas.some((h) => h.nombre === ajustes.hojaPreferida)) {
        hoja = ajustes.hojaPreferida;
      }
      if (ajustes?.estandar === "NIF" || ajustes?.estandar === "NIIF" || ajustes?.estandar === "PCGA") {
        params.estandar = ajustes.estandar;
      }

      // PERFIL guardado por HUELLA del layout (0 llamadas IA si aplica): prioridad
      // al perfil del cliente detectado por NIT; si no, el usado más recientemente.
      // Aplicar el spec de otro cliente con el MISMO layout es correcto (misma
      // transformación); las preferencias/preselección sí exigen NIT coincidente.
      const hojasLookup = hoja ? ingesta.hojas.filter((h) => h.nombre === hoja) : ingesta.hojas;
      const candidatas = huellasCandidatas(hojasLookup.length > 0 ? hojasLookup : ingesta.hojas);
      if (candidatas.length > 0) {
        try {
          const perfiles = await prisma.perfilCargaBalance.findMany({
            where: { huella: { in: candidatas.map((c) => c.huella) } },
            orderBy: [{ ultimoUsoEn: { sort: "desc", nulls: "last" } }, { actualizadoEn: "desc" }],
          });
          const perfil = perfiles.find((p) => clienteDetectadoId != null && p.clienteId === clienteDetectadoId) ?? perfiles[0] ?? null;
          if (perfil) {
            const plano = perfilPlanoDesdeFila(perfil);
            // Preferencias del cliente pisan el signo/tercero del perfil.
            if (ajustes?.convencionCredito === "firmado" || ajustes?.convencionCredito === "magnitud") plano.signoCredito = ajustes.convencionCredito;
            if (ajustes?.agregarPorTercero != null) plano.agregarPorTercero = ajustes.agregarPorTercero;
            specGuardado = specDesdePerfil(plano);
          }
        } catch {
          specGuardado = null; // best-effort: sin perfil la lectura sigue normal
        }
      }
    }

    let extr: ResultadoTransform | null = null;
    let spec: MappingSpec | null = null;
    let origenExtraccion: OrigenExtraccion = "plantilla";
    if (iaBalanceDisponible(proveedorIA)) {
      const r = await extraerBalance(datosArchivo, archivo.name, params, {
        hojaElegida: hoja, usosOut: usos, ingesta: ingesta ?? undefined, specGuardado, proveedorIA,
      });
      extr = r.resultado;
      spec = r.spec;
      origenExtraccion = r.origenExtraccion;
    } else {
      // SIN API key: un perfil guardado habilita igual la carga completa
      // determinista (antes solo funcionaba la plantilla limpia).
      if (specGuardado && ingesta?.modo === "tabular") {
        const specConHoja = hoja ? { ...specGuardado, hoja } : specGuardado;
        const res = transformarTabular(specConHoja, ingesta.hojas, params);
        if (esTransformacionAceptable(res)) {
          extr = res;
          spec = specConHoja;
          origenExtraccion = "perfil";
        }
      }
      if (!extr) {
        const { filas, errores } = await parseBalanceWorkbook(datosArchivo);
        if (errores.length > 0) {
          return { ok: false, message: `${errores.length} problema(s) en el archivo. Nada se leyó.`, errores };
        }
        const importReady: CuentaCruda[] = filas.map((f) => ({ code: f.code, name: f.name, prevBalance: f.prevBalance, balance: f.balance }));
        const filasCrudas: FilaCruda[] = filas.map((f, i) => ({
          hoja: null, filaNum: i + 1, codigoCrudo: f.code, codigo: /^\d+$/.test(f.code) ? f.code : "",
          nombre: f.name, nivel: /^\d+$/.test(f.code) ? f.code.length : null, tipoFila: "movimiento",
          saldoInicial: f.prevBalance, debitos: 0, creditos: 0, saldoFinal: f.balance,
        }));
        extr = {
          importReady,
          filasCrudas,
          excepciones: [],
          cabecera: {
            nit: { valor: null, fuente: "NINGUNO" }, periodoInicial: { valor: null, fuente: "NINGUNO" },
            periodoFinal: { valor: null, fuente: "NINGUNO" }, estandar: TIPO_BALANCE_CARGA,
          },
          resumen: {
            filasLeidas: importReady.length, filasExcluidas: 0, filasImportables: importReady.length, filasDescuadre: 0,
            cuentasMovimiento: importReady.length, cuentasAgrupadoras: 0,
            nit: { valor: null, fuente: "NINGUNO" }, periodoInicial: { valor: null, fuente: "NINGUNO" },
            periodoFinal: { valor: null, fuente: "NINGUNO" },
            estandar: TIPO_BALANCE_CARGA, convencionCredito: "firmado",
          },
          // El parser de plantilla limpia no expone una fila TOTALES: sin cuadre.
          cuadre: CUADRE_NO_APLICA,
          // Para la huella diagnóstica: lectura SIN IA, por plantilla estándar.
          modo: "plantilla",
        };
        origenExtraccion = "plantilla";
      }
    }

    const usuario = await getCurrentUser();

    // Registra el consumo de tokens de la lectura/extracción (best-effort). Se
    // hace aquí —aunque no haya cuentas útiles— porque la IA ya consumió tokens.
    // El cliente detectado por NIT enriquece el registro (aún sin confirmar).
    if (usos.length > 0) {
      await registrarConsumoIA(usos, {
        clienteId: clienteDetectadoId,
        usuarioId: usuario?.id ?? null,
        usuarioNombre: usuario?.name ?? null,
        archivoNombre: archivo.name,
        nitDetectado: nitDeterminista ?? extr.cabecera.nit.valor,
      });
    }

    return await persistirLoteYSugerencia({
      extr,
      archivoNombre: archivo.name,
      archivoTamBytes: archivo.size,
      usuario: usuario ? { id: usuario.id, name: usuario.name } : null,
      origenExtraccion,
      spec,
      ingesta,
      nitDeterminista,
      clienteDetectadoId,
      proveedorIA,
    });
  } catch (e) {
    return { ok: false, message: mensajeErrorIA("leerBalance", e) };
  }
}

type ParamsLoteSugerencia = {
  extr: ResultadoTransform;
  archivoNombre: string;
  archivoTamBytes: number;
  usuario: { id: number; name: string } | null;
  origenExtraccion: OrigenExtraccion;
  spec: MappingSpec | null;
  ingesta: Ingesta | null;
  nitDeterminista: string | null;
  clienteDetectadoId: number | null;
  proveedorIA: ProveedorIABalance;
};

/**
 * Cola COMPARTIDA del paso 1 (la usan `leerBalance` y `reprocesarBalanceConSpec`):
 * valida el borrador, persiste el staging crudo + el encabezado de lote (con la
 * huella del layout, el origen de la extracción y el spec usado — para poder
 * guardar el PERFIL del cliente al confirmar) y arma la SugerenciaBalance v2 con
 * el payload compacto firmado.
 */
async function persistirLoteYSugerencia(p: ParamsLoteSugerencia): Promise<LeerBalanceState> {
  const { extr } = p;
  if (extr.importReady.length === 0) {
    return { ok: false, message: "No se leyó ninguna cuenta del archivo. Revisa las excepciones.", excepciones: extr.excepciones };
  }

  // HUELLA DIAGNÓSTICA inicial (MEDICIÓN, no afecta la lectura). Se calcula sobre un
  // CLON de las filas crudas ANTES de las reclasificaciones de abajo, para que las
  // pasadas cuenten frescas. `construirVistaBorrador` MUTA su entrada → se clona.
  const diagInicial = construirVistaBorrador(extr.filasCrudas.map((f) => ({ ...f }))).diagnostico;

  // Validación contable del BORRADOR: totales A/P/Patrimonio CALCULADOS del
  // detalle (calcularBalance no necesita el plan estándar para las sumas: son por
  // clase) contra los que TRAE el archivo (filas clase 1/2/3), + la ecuación
  // A = P + Patrimonio + Resultado. Todo con margen ±$1000.
  // Pie/total sin código («Total general», «Totales», marca del ERP) mal marcado
  // como movimiento → «total»: si no, se cuelga de la última agrupadora inflando su
  // Δ y se cuenta al cargar. MUTA `filasCrudas` (staging las guarda ya como total).
  reclasificarNoImputables(extr.filasCrudas);
  // Export TOTALMENTE JERÁRQUICO (opción del cliente `imputarSoloHojas`): imputar SOLO
  // las hojas — los subtotales (subcuenta + auxiliares listados como filas) se marcan
  // agrupadora para no contar doble. ANTES de reclasificarHuerfanas (para que el árbol
  // anide el detalle por orden) y de calcBorrador (para que el snapshot del encabezado
  // no cuente doble). `importReady` se sincroniza quitando los códigos promovidos.
  const ajustesCliente = await ajustesCargaDeCliente(p.clienteDetectadoId);
  if (ajustesCliente?.imputarSoloHojas) {
    const promovidas = reclasificarSoloHojas(extr.filasCrudas);
    if (promovidas.length > 0) {
      const codigosProm = new Set(promovidas.map((f) => f.codigo));
      extr.importReady = extr.importReady.filter((c) => !codigosProm.has(c.code));
    }
  }
  // Agrupadoras HUÉRFANAS (sin hijos, con saldo) → movimiento: hojas imputables
  // que el ERP exportó sin desglose. MUTA `filasCrudas` (staging las guarda ya
  // como movimiento) y las suma al detalle para que el snapshot del encabezado
  // (chip Cuadrado/Descuadrado) refleje lo mismo que verá la vista del borrador.
  const huerfanas = reclasificarHuerfanas(extr.filasCrudas);
  for (const f of huerfanas) {
    extr.importReady.push({ code: f.codigo, name: f.nombre, prevBalance: f.saldoInicial, balance: f.saldoFinal, debitos: f.debitos, creditos: f.creditos });
  }
  const calcBorrador = calcularBalance(extr.importReady, []);
  // Snapshot FINAL para la lista: reproduce el mismo pipeline que verá el detalle,
  // ya con las preferencias y reclasificaciones aplicadas al staging definitivo.
  const diagFinal = construirVistaBorrador(extr.filasCrudas.map((fila) => ({ ...fila }))).diagnostico;
  // Total del archivo por clase = SUMA de todas las filas totalizadoras de esa
  // clase (código "1"/"2"/"3"). En balances MULTI-SUCURSAL el ERP repite el total
  // de ACTIVO/PASIVO/PATRIMONIO por sucursal; sumarlas da el consolidado, que es
  // lo que el detalle (agregado por código entre sucursales) debe reflejar.
  const totalFilaArchivo = (clase: string) => {
    const filas = extr.filasCrudas.filter((f) => f.codigo === clase);
    return filas.length > 0 ? filas.reduce((s, f) => s + f.saldoFinal, 0) : null;
  };
  const validacion = construirValidacionContable(calcBorrador, {
    activo: totalFilaArchivo("1"),
    pasivo: totalFilaArchivo("2"),
    patrimonio: totalFilaArchivo("3"),
  });

  // NIT final: el detectado DETERMINISTA manda (fuente FUENTE); si no, el de la
  // extracción (IA/plantilla).
  const nitFinal: Origen = p.nitDeterminista ? { valor: p.nitDeterminista, fuente: "FUENTE" } : extr.cabecera.nit;

  // Huella + encabezados de la fila de encabezado REAL del spec usado (más precisa
  // que las candidatas del lookup: aquí ya se conoce la fila exacta).
  const specUsado = p.spec;
  let huellaFinal: string | null = null;
  let encabezados: string[] = [];
  if (specUsado && p.ingesta?.modo === "tabular") {
    const hojaSpec = p.ingesta.hojas.find((h) => h.nombre === specUsado.hoja) ?? p.ingesta.hojas[0];
    const filaEnc = hojaSpec?.filas[specUsado.filaEncabezado - 1];
    if (hojaSpec && filaEnc) {
      huellaFinal = calcularHuella(hojaSpec.nombre, filaEnc);
      encabezados = filaEnc.map((c) => (c == null ? "" : String(c)));
    }
  }
  const specCarga: SpecCarga | null = specUsado ? specCargaDesdePerfil(aplanarSpec(specUsado)) : null;

  // PASO 1 — BORRADOR persistente: staging crudo (todas las filas, sin descartar)
  // + encabezado de lote con la metadata para listarlo. Persiste hasta que se
  // CARGA (promueve a oficial) o se DESCARTA — sin purga automática.
  const loteId = randomUUID();
  const LOTE_STAGING = 1000;
  for (let i = 0; i < extr.filasCrudas.length; i += LOTE_STAGING) {
    await prisma.balanceImportacionStaging.createMany({
      data: extr.filasCrudas.slice(i, i + LOTE_STAGING).map((f) => ({
        loteId, clienteId: null, hoja: f.hoja, filaNum: f.filaNum, codigoCrudo: f.codigoCrudo,
        codigo: f.codigo, nombre: f.nombre, nivel: f.nivel, tipoFila: f.tipoFila,
        saldoInicial: f.saldoInicial, debitos: f.debitos, creditos: f.creditos, saldoFinal: f.saldoFinal,
      })),
    });
  }
  await prisma.balanceImportacionLote.create({
    data: {
      loteId, clienteId: null,
      archivoNombre: p.archivoNombre, archivoTam: tamArchivo(p.archivoTamBytes),
      nitDetectado: nitFinal.valor,
      periodoInicial: extr.cabecera.periodoInicial.valor ? fechaCalendarioPrisma(extr.cabecera.periodoInicial.valor) : null,
      periodoFinal: extr.cabecera.periodoFinal.valor ? fechaCalendarioPrisma(extr.cabecera.periodoFinal.valor) : null,
      estandar: extr.cabecera.estandar, convencionCredito: extr.resumen.convencionCredito,
      cuentasMovimiento: extr.resumen.cuentasMovimiento, filasLeidas: extr.resumen.filasLeidas, filasExcluidas: extr.resumen.filasExcluidas,
      partidaDobleDiff: diagFinal.partidaDobleDiff, ecuacionDiff: diagFinal.ecuacionDiff,
      cuadrado: diagFinal.cuadrado,
      cargadoPor: p.usuario?.name ?? null, cargadoPorId: p.usuario?.id ?? null,
      huella: huellaFinal, origenExtraccion: p.origenExtraccion,
      ...(specCarga ? { specJson: specCarga } : {}),
    },
  });

  // Registra la huella diagnóstica del cargue (best-effort; sobrevive a la purga del
  // lote al confirmar/descartar porque vive en su propia tabla).
  await registrarDiagnosticoInicial({
    loteId, clienteId: null, archivoNombre: p.archivoNombre,
    modo: extr.modo ?? null,
    formato: (p.archivoNombre.split(".").pop() ?? "").toLowerCase() || null,
    confianza: extr.confianza ?? null,
    diag: diagInicial,
  });

  // Correcciones por cuenta MEMORIZADAS del cliente (detectado por NIT): se
  // re-aplican al staging recién creado — el borrador abre ya corregido, sin
  // repetir a mano los ajustes de cargas anteriores. El resumen del lote se
  // recalcula adentro. Best-effort: sin correcciones la lectura sigue igual.
  if (p.clienteDetectadoId != null) {
    try {
      await aplicarCorreccionesGuardadas(loteId, p.clienteDetectadoId);
    } catch {
      /* best-effort */
    }
  }

  const payload: PayloadCargaBalance = {
    v: 2,
    loteId,
    archivoNombre: p.archivoNombre,
    archivoTam: tamArchivo(p.archivoTamBytes),
    nitDetectado: nitFinal.valor,
    nitFuente: nitFinal.fuente,
    periodoInicial: extr.cabecera.periodoInicial.valor,
    periodoFinal: extr.cabecera.periodoFinal.valor,
    estandar: extr.cabecera.estandar,
    convencionCredito: extr.resumen.convencionCredito,
    filasLeidas: extr.resumen.filasLeidas,
    filasExcluidas: extr.resumen.filasExcluidas,
    filasDescuadre: extr.resumen.filasDescuadre,
    cuentasMovimiento: extr.resumen.cuentasMovimiento,
    cuentasAgrupadoras: extr.resumen.cuentasAgrupadoras,
    cuentas: extr.importReady.length,
    cuadreArchivo: extr.cuadre.detectado ? { totalDebitos: extr.cuadre.totalDebitos, totalCreditos: extr.cuadre.totalCreditos } : null,
    origenExtraccion: p.origenExtraccion,
    proveedorIA: p.proveedorIA,
    huella: huellaFinal,
  };

  return {
    ok: true,
    excepciones: extr.excepciones,
    sugerencia: {
      firma: firmarPayloadServidor(payload, CONTEXTO_PAYLOAD_BALANCE),
      payload,
      render: {
        cuadre: extr.cuadre,
        validacion,
        importReady: extr.importReady,
        spec: specCarga,
        encabezados,
        hojas: p.ingesta?.modo === "tabular" ? p.ingesta.hojas.map((h) => h.nombre) : [],
        clienteDetectadoId: p.clienteDetectadoId,
        proveedorIA: p.origenExtraccion === "ia" ? p.proveedorIA : null,
      },
    },
  };
}

/**
 * REPROCESO determinista con el spec AJUSTADO A MANO en el editor de estructura
 * (fase revisar del modal): recibe otra vez el archivo (el navegador aún lo
 * tiene), aplica `transformarTabular` con el spec editado — SIN llamadas a IA —
 * y reemplaza el lote de staging anterior. Devuelve una sugerencia nueva.
 */
export async function reprocesarBalanceConSpec(
  _prev: LeerBalanceState,
  formData: FormData,
): Promise<LeerBalanceState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "No se encontró el archivo original. Vuelve a leerlo." };
  }
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 20 MB." };

  let specBruto: unknown;
  try {
    specBruto = JSON.parse(String(formData.get("spec") ?? ""));
  } catch {
    return { ok: false, message: "Los ajustes de estructura no son válidos. Vuelve a intentarlo." };
  }
  const parsed = SpecCargaBalanceSchema.safeParse(specBruto);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Los ajustes de estructura no son válidos." };
  }
  const loteIdAnterior = String(formData.get("loteIdAnterior") ?? "").trim();

  try {
    const proveedorIA = await proveedorIABalanceSesion(formData.get("modeloIA"));
    const datosArchivo = await archivo.arrayBuffer();
    const ingesta = await ingerir(datosArchivo, archivo.name);
    if (ingesta.modo !== "tabular") {
      return { ok: false, message: "El editor de estructura solo aplica a archivos tabulares (Excel/CSV/TXT delimitado/JSON)." };
    }
    const params: ParamsExtraccion = { nit: null, periodoInicial: null, periodoFinal: null, estandar: TIPO_BALANCE_CARGA };
    const spec = specDesdePerfil(aplanarSpec(parsed.data));
    const nitDeterminista = detectarNit(ingesta.hojas);
    const clienteDetectadoId = await clientePorNit(nitDeterminista);
    const extr = transformarTabular(spec, ingesta.hojas, params);
    const usuario = await getCurrentUser();

    const res = await persistirLoteYSugerencia({
      extr,
      archivoNombre: archivo.name,
      archivoTamBytes: archivo.size,
      usuario: usuario ? { id: usuario.id, name: usuario.name } : null,
      origenExtraccion: "manual",
      spec,
      ingesta,
      nitDeterminista,
      clienteDetectadoId,
      proveedorIA,
    });

    // El lote anterior se purga SOLO si el reproceso quedó persistido (si falló,
    // el borrador previo sigue disponible). Best-effort.
    if (res.ok && loteIdAnterior) {
      try {
        await prisma.balanceImportacionStaging.deleteMany({ where: { loteId: loteIdAnterior } });
        await prisma.balanceImportacionLote.deleteMany({ where: { loteId: loteIdAnterior } });
      } catch {
        /* best-effort */
      }
    }
    return res;
  } catch (e) {
    return { ok: false, message: mensajeErrorIA("reprocesarBalanceConSpec", e) };
  }
}

/**
 * AUDITORÍA RÁPIDA pre-carga (determinista, sin IA): dado el cliente elegido y las
 * cuentas leídas, evidencia (a) **posibles omisiones** —cuentas imputables del
 * ÚLTIMO balance del cliente que NO vienen en este archivo— y (b) cuentas que se
 * **cargarán sin mapeo** al estándar. No escribe nada ni bloquea; es para que la
 * persona revise antes de confirmar.
 */
export type AuditoriaCarga = {
  ok: boolean;
  message?: string;
  hayPrevio: boolean;
  omisiones: { code: string; name: string }[];
  sinMapeo: { code: string; name: string }[];
  // Preferencias de carga guardadas del cliente elegido (null si no tiene), para
  // avisar en el modal si difieren de lo aplicado en la lectura.
  ajustes?: AjustesCarga | null;
};

export async function auditarCargaBalance(clienteId: number, loteId: string): Promise<AuditoriaCarga> {
  const vacio: AuditoriaCarga = { ok: false, hayPrevio: false, omisiones: [], sinMapeo: [] };
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ...vacio, message: authz.message };
  const scope = await authorizePermiso("balance:crear", { clientId: clienteId });
  if (!scope.ok) return { ...vacio, message: scope.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ...vacio, message: "Borrador inválido. Vuelve a leer el archivo." };
  try {
    // Las cuentas salen del STAGING del lote (misma vista que se promoverá al
    // confirmar) — ya no viajan de ida y vuelta por el navegador.
    const cuentas = await cuentasDesdeStaging(id);
    if (cuentas.length === 0) return { ...vacio, message: "El borrador ya no existe. Vuelve a leer el archivo." };
    // Mismo criterio de normalización que la carga (quita sufijos INAC/A/AS), para
    // que la comparación sea consistente: `236550INAC` ≡ `236550`.
    const enArchivo = new Set(cuentas.map((c) => limpiarCodigo(c.code)));

    // (a) Omisiones: imputables del último balance del cliente ausentes en el archivo.
    const previo = await prisma.balancePruebaEncabezado.findFirst({
      where: { clienteId }, orderBy: { creadoEn: "desc" }, select: { id: true },
    });
    let omisiones: { code: string; name: string }[] = [];
    if (previo) {
      const det = await prisma.balancePruebaDetalle.findMany({ where: { encabezadoId: previo.id }, select: { cuenta8: true, nombreCuenta: true } });
      omisiones = det.filter((d) => !enArchivo.has(limpiarCodigo(d.cuenta8))).map((d) => ({ code: d.cuenta8, name: d.nombreCuenta }));
    }

    // (b) Sin mapeo: cascada determinista (config guardada + exacto + descripción), SIN IA.
    const cuentasEstandar = await getCuentasEstandar();
    const configRows = await prisma.clientAccount.findMany({
      where: { clienteId, cuenta6Russell: { not: null } },
      select: { code: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true },
    });
    const configCliente = new Map<string, { std: string; coincidencia: number | null }>();
    for (const r of configRows) {
      const c6 = r.code.slice(0, 6);
      if (!configCliente.has(c6) || r.origenMapeo === "manual") configCliente.set(c6, { std: r.cuenta6Russell as string, coincidencia: r.coincidencia != null ? Number(r.coincidencia) : null });
    }
    const calc = calcularBalance(cuentas, cuentasEstandar, undefined, undefined, configCliente);
    const sinMapeo = calc.breakdown.flatMap((g) => g.items).filter((it) => !it.mapped).map((it) => ({ code: it.code, name: it.name }));

    const ajustes = await ajustesCargaDeCliente(clienteId);

    return { ok: true, hayPrevio: !!previo, omisiones, sinMapeo, ajustes };
  } catch (e) {
    return { ...vacio, message: mensajeErrorBD("auditarCargaBalance", e) };
  }
}

/**
 * Guarda/actualiza el PERFIL de carga del cliente tras una promoción exitosa
 * (checkbox del modal). El spec y la huella salen del LOTE (leídos ANTES de la
 * promoción, que purga el lote). Best-effort: nunca tumba la carga.
 */
type ParamsPerfilCarga = {
  clientId: number;
  huella: string | null;
  specJson: unknown;
  origenExtraccion: PayloadCargaBalance["origenExtraccion"];
  archivoNombre: string;
};

/**
 * Núcleo del upsert del PERFIL de carga (clave clienteId+huella). LANZA si la BD falla
 * (para que el llamador reporte); devuelve false si faltan datos (sin huella o spec
 * inválido). Lo usan el guardado best-effort de la carga y el botón «Guardar» del editor.
 */
async function upsertPerfilCarga(p: ParamsPerfilCarga): Promise<boolean> {
  if (!p.huella) return false;
  const parsed = SpecCargaBalanceSchema.safeParse(p.specJson);
  if (!parsed.success) return false;
  const plano = aplanarSpec(parsed.data);
  // Un spec ajustado a mano queda (y se mantiene) como `manual`; el resto es
  // `ia` (automático). `manual` NUNCA se degrada por una carga automática.
  const esManual = p.origenExtraccion === "manual";
  const ahora = new Date();
  const existia = await prisma.perfilCargaBalance.findUnique({
    where: { clienteId_huella: { clienteId: p.clientId, huella: p.huella } },
    select: { id: true },
  });
  const usuario = await getCurrentUser();
  await prisma.perfilCargaBalance.upsert({
    where: { clienteId_huella: { clienteId: p.clientId, huella: p.huella } },
    create: {
      clienteId: p.clientId, huella: p.huella, ...plano,
      origen: esManual ? "manual" : "ia",
      vecesUsado: 1, ultimoUsoEn: ahora, archivoEjemplo: p.archivoNombre,
      creadoPor: usuario?.name ?? null, creadoPorId: usuario?.id ?? null,
    },
    update: {
      ...plano,
      vecesUsado: { increment: 1 }, ultimoUsoEn: ahora, archivoEjemplo: p.archivoNombre,
      ...(esManual ? { origen: "manual" } : {}),
    },
  });
  if (!existia) {
    await logAudit({
      user: usuario?.name ?? "Sistema",
      action: "GUARDÓ PERFIL de carga de balance",
      entity: `cliente ${p.clientId}`,
      detail: `huella ${p.huella} · ${esManual ? "ajustado a mano" : "detectado"} · ${p.archivoNombre}`,
    });
  }
  return true;
}

/** Guarda el perfil tras una carga exitosa (best-effort; nunca tumba la carga). */
async function guardarPerfilTrasCarga(p: ParamsPerfilCarga): Promise<void> {
  try { await upsertPerfilCarga(p); } catch { /* best-effort */ }
}

/**
 * GUARDA el spec ajustado en el editor de estructura como PERFIL del cliente, SIN
 * reprocesar el archivo. Usa la huella y el cliente (por NIT) del lote actual — para
 * dejar el ajuste memorizado para futuras cargas cuando reprocesar no hace falta.
 */
export async function guardarPerfilDesdeEditor(loteId: string, specJson: unknown, clientIdExplicito?: number): Promise<ActionState & { needsClient?: boolean }> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  const parsed = SpecCargaBalanceSchema.safeParse(specJson);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Los ajustes de estructura no son válidos." };
  try {
    const lote = await prisma.balanceImportacionLote.findUnique({
      where: { loteId: id },
      select: { huella: true, clienteId: true, nitDetectado: true, archivoNombre: true },
    });
    if (!lote) return { ok: false, message: "El borrador ya no existe." };
    if (!lote.huella) return { ok: false, message: "No hay huella del layout para guardar el perfil. Reprocesa una vez (sin IA) para generarla y vuelve a guardar." };
    // Cliente EXPLÍCITO (elegido en el prompt) manda; si no, el del lote o el detectado por NIT.
    const cidExpl = typeof clientIdExplicito === "number" && Number.isInteger(clientIdExplicito) && clientIdExplicito > 0 ? clientIdExplicito : null;
    const clientId = cidExpl ?? lote.clienteId ?? (await clientePorNit(lote.nitDetectado));
    // Sin cliente → se pide al usuario que lo elija para concluir el guardado (needsClient).
    if (clientId == null) return { ok: false, needsClient: true, message: "Elige el cliente para guardar el perfil del formato." };
    const scope = await authorizePermiso("balance:crear", { clientId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const ok = await upsertPerfilCarga({ clientId, huella: lote.huella, specJson: parsed.data, origenExtraccion: "manual", archivoNombre: lote.archivoNombre });
    if (!ok) return { ok: false, message: "No se pudo guardar el perfil (faltan datos del layout)." };
    revalidatePath("/config/clientes");
    return { ok: true, message: "Perfil de formato guardado para este cliente. Las próximas cargas del mismo layout lo aplicarán solas, sin IA." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarPerfilDesdeEditor", e) };
  }
}

/**
 * Guarda las NOTAS / observaciones de carga del cliente desde el editor de
 * estructura (per-cliente, texto libre). Resuelve el cliente igual que el perfil:
 * explícito → del lote → por NIT; si no hay, pide elegirlo (needsClient).
 */
export async function guardarNotasDesdeEditor(loteId: string, observaciones: string, clientIdExplicito?: number): Promise<ActionState & { needsClient?: boolean }> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  const texto = String(observaciones ?? "").trim();
  if (texto.length > 2000) return { ok: false, message: "Las notas son demasiado largas (máx. 2000 caracteres)." };
  const notas = texto || null;
  try {
    const lote = await prisma.balanceImportacionLote.findUnique({
      where: { loteId: id },
      select: { clienteId: true, nitDetectado: true },
    });
    if (!lote) return { ok: false, message: "El borrador ya no existe." };
    const cidExpl = typeof clientIdExplicito === "number" && Number.isInteger(clientIdExplicito) && clientIdExplicito > 0 ? clientIdExplicito : null;
    const clientId = cidExpl ?? lote.clienteId ?? (await clientePorNit(lote.nitDetectado));
    if (clientId == null) return { ok: false, needsClient: true, message: "Elige el cliente para guardar las notas." };
    const scope = await authorizePermiso("balance:crear", { clientId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    const user = await getCurrentUser();
    await prisma.ajustesCargaBalance.upsert({
      where: { clienteId: clientId },
      create: { clienteId: clientId, observaciones: notas, actualizadoPor: user?.name ?? null },
      update: { observaciones: notas, actualizadoPor: user?.name ?? null },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "GUARDÓ NOTAS de carga de balance",
      entity: cliente.name,
      detail: notas ? `${notas.length} caracteres` : "notas vacías",
    });
    revalidatePath("/config/clientes");
    return { ok: true, message: notas ? "Notas de carga guardadas." : "Notas de carga borradas." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarNotasDesdeEditor", e) };
  }
}

/**
 * CONFIRMACIÓN (paso final). Recibe el cliente/período confirmados por la persona
 * + el payload COMPACTO firmado de la lectura (v2: loteId + metadatos, sin
 * cuentas — el staging es la fuente de verdad). Recalcula en el servidor los
 * agregados Y el cuadre contra TOTALES desde el staging (solo toma del payload
 * los totales del archivo, no reconstruibles sin reabrirlo). Si la persona lo
 * pidió (checkbox), guarda el spec usado como PERFIL de carga del cliente.
 */
export async function confirmarCargaBalance(
  _prev: ImportBalanceState,
  formData: FormData,
): Promise<ImportBalanceState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ConfirmarBalanceSchema.safeParse({
    clientId: formData.get("clientId"),
    periodoInicio: formData.get("periodoInicio"),
    periodoFin: formData.get("periodoFin"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { clientId, periodoInicio, periodoFin } = parsed.data;

  const scope = await authorizePermiso("balance:crear", { clientId });
  if (!scope.ok) return { ok: false, message: scope.message };

  // El hidden `payload` trae { firma, payload } (v2). La firma se valida sobre el
  // objeto CRUDO (la serialización canónica ordena claves) y el payload se
  // re-valida con Zod para tipar con seguridad.
  let bruto: { firma?: unknown; payload?: unknown };
  try {
    bruto = JSON.parse(String(formData.get("payload") ?? "")) as { firma?: unknown; payload?: unknown };
  } catch {
    return { ok: false, message: "La lectura del archivo no es válida. Vuelve a leer el archivo." };
  }
  if (!bruto?.payload || !validarFirmaPayloadServidor(bruto.payload, bruto.firma, CONTEXTO_PAYLOAD_BALANCE)) {
    return { ok: false, message: "La lectura del archivo fue alterada o expiró. Vuelve a leer el archivo." };
  }
  const payloadParsed = PayloadCargaBalanceSchema.safeParse(bruto.payload);
  if (!payloadParsed.success) {
    return { ok: false, message: "La lectura del archivo no es válida. Vuelve a leer el archivo." };
  }
  const sug = payloadParsed.data;
  // Se RE-autoriza con la sesión al confirmar: un payload firmado en una sesión
  // autorizada no habilita Gemini si quien confirma ya no lo está.
  const proveedorIA = await proveedorIABalanceSesion(sug.proveedorIA);

  // El spec/huella para guardar el perfil se leen del lote ANTES de promover (la
  // promoción purga el lote). Best-effort: sin lote igual se puede cargar.
  let lote: { huella: string | null; specJson: unknown; origenExtraccion: string | null } | null = null;
  try {
    lote = await prisma.balanceImportacionLote.findUnique({
      where: { loteId: sug.loteId },
      select: { huella: true, specJson: true, origenExtraccion: true },
    });
  } catch {
    lote = null;
  }

  // PASO 2 — promoción a oficial (relee el staging del lote, análisis por cuentas,
  // persiste y purga). Núcleo compartido con `cargarBorrador`. La firma HMAC ata el
  // `loteId`; sin staging no hay carga (el payload ya no lleva cuentas).
  const res = await promoverStagingAOficial(
    {
      loteId: sug.loteId, clientId, periodoInicio, periodoFin, rolLabel: etiquetaRol(authz.role),
      archivoNombre: sug.archivoNombre, archivoTam: sug.archivoTam,
      nitDetectado: sug.nitDetectado, nitFuente: sug.nitFuente, convencionCredito: sug.convencionCredito,
      filasLeidas: sug.filasLeidas, filasExcluidas: sug.filasExcluidas, filasDescuadre: sug.filasDescuadre,
      cuentasMovimiento: sug.cuentasMovimiento, cuentas: sug.cuentas, cuentasAgrupadoras: sug.cuentasAgrupadoras,
      cuadreArchivo: sug.cuadreArchivo,
      proveedorIA,
    },
    "confirmarCargaBalance",
  );

  // Perfil de carga del cliente (checkbox «guardar este formato»): con la carga ya
  // promovida y el cliente confirmado. Best-effort.
  if (res.ok && formData.get("guardarPerfil") === "1") {
    await guardarPerfilTrasCarga({
      clientId,
      huella: lote?.huella ?? sug.huella,
      specJson: lote?.specJson ?? null,
      origenExtraccion: sug.origenExtraccion,
      archivoNombre: sug.archivoNombre,
    });
  }

  return res;
}

/**
 * Carga (promueve a oficial) un BORRADOR persistido desde su página, eligiendo
 * cliente y período. Relee el staging del lote por `loteId` (fuente de verdad) y
 * reutiliza el mismo núcleo de promoción que el modal. No usa payload firmado: el
 * `loteId` viene del encabezado persistido y la autorización protege la escritura.
 */
export async function cargarBorrador(_prev: ImportBalanceState, formData: FormData): Promise<ImportBalanceState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ConfirmarBalanceSchema.safeParse({
    clientId: formData.get("clientId"),
    periodoInicio: formData.get("periodoInicio"),
    periodoFin: formData.get("periodoFin"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { clientId, periodoInicio, periodoFin } = parsed.data;
  const loteId = String(formData.get("loteId") ?? "").trim();
  if (!loteId) return { ok: false, message: "Borrador inválido. Vuelve a la lista de borradores." };

  const scope = await authorizePermiso("balance:crear", { clientId });
  if (!scope.ok) return { ok: false, message: scope.message };

  // El encabezado (si existe) enriquece la metadata; el staging es lo que se
  // promueve. Un borrador «huérfano» (sin encabezado) también se puede cargar.
  const lote = await prisma.balanceImportacionLote.findUnique({ where: { loteId } });
  const movEnStaging = await prisma.balanceImportacionStaging.count({ where: { loteId, tipoFila: "movimiento" } });
  if (!lote && movEnStaging === 0) return { ok: false, message: "El borrador ya no existe (fue cargado o descartado)." };

  const res = await promoverStagingAOficial(
    {
      loteId, clientId, periodoInicio, periodoFin, rolLabel: etiquetaRol(authz.role),
      archivoNombre: lote?.archivoNombre ?? "—", archivoTam: lote?.archivoTam ?? "—",
      nitDetectado: lote?.nitDetectado ?? null, nitFuente: lote?.nitDetectado ? "FUENTE" : "NINGUNO",
      convencionCredito: lote?.convencionCredito ?? "firmado",
      filasLeidas: lote?.filasLeidas ?? 0, filasExcluidas: lote?.filasExcluidas ?? 0, filasDescuadre: 0,
      cuentasMovimiento: lote?.cuentasMovimiento ?? movEnStaging, cuentas: lote?.cuentasMovimiento ?? movEnStaging, cuentasAgrupadoras: 0,
      cuadreArchivo: null,
    },
    "cargarBorrador",
  );
  // Éxito: redirige EN EL SERVIDOR al balance oficial. El borrador ya se purgó, así
  // que re-renderizar su página daría 404; el redirect del servidor evita esa carrera
  // (la confirmación se muestra con FlashToast en el destino). `redirect()` lanza una
  // excepción especial: va FUERA de cualquier try/catch.
  if (res.ok && res.resumen?.id) redirect(`/balance/${res.resumen.id}?cargado=1`);
  return res; // solo el caso de error llega aquí
}

/** Descarta (elimina) un borrador: borra su staging + encabezado. */
export async function descartarBorrador(loteId: string): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    // Cierra la huella diagnóstica (best-effort, ANTES de purgar): resultado descartado
    // + intervención manual acumulada.
    try {
      const [nOmi, nPad, nDes] = await Promise.all([
        prisma.balanceImportacionStaging.count({ where: { loteId: id, omitida: true } }),
        prisma.balanceImportacionStaging.count({ where: { loteId: id, padreManual: { not: null } } }),
        prisma.balanceImportacionStaging.count({ where: { loteId: id, desacoplada: true } }),
      ]);
      await cerrarDiagnostico({ loteId: id, resultado: "descartado", manual: { omitidas: nOmi, reparentadas: nPad, desacopladas: nDes } });
    } catch {
      /* best-effort */
    }
    await prisma.balanceImportacionStaging.deleteMany({ where: { loteId: id } });
    await prisma.balanceImportacionLote.deleteMany({ where: { loteId: id } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "—", action: "DESCARTÓ BORRADOR de balance", entity: id, detail: "" });
    revalidatePath("/balance/borradores");
    return { ok: true, message: "Borrador descartado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("descartarBorrador", e) };
  }
}

/**
 * GUARDA en el staging los cambios que el usuario hizo en el borrador (hasta ahora
 * TEMPORALES en el navegador): reclasificaciones AGRUPADORA↔MOVIMIENTO y correcciones
 * de "lados invertidos" (débito↔crédito). Se aplica en lote:
 *  - `override`: código → tipo nuevo. Flip de las filas del lote con ese código que
 *    hoy tienen el tipo OPUESTO (no toca una fila del mismo código pero del otro
 *    tipo — p. ej. un encabezado repetido).
 *  - `invertidos`: códigos cuyo débito/crédito se intercambia SOLO en las filas cuyo
 *    control hoy no cuadra pero SÍ al intercambiar (no daña sucursales correctas; el
 *    saldo no se toca).
 *  - `desacopladas`: código → on/off del flag `desacoplada` (anidar por prefijo, no por
 *    orden). No afecta el balance cargado (la carga agrega por código, no por árbol);
 *    solo corrige DÓNDE se muestra el descuadre en la revisión del borrador.
 *  - `omitidas`: filaNum → on/off del flag `omitida`. La fila se conserva en el crudo
 *    (comparativo línea a línea) pero se excluye de los cálculos y NO se vuelca al
 *    balance al cargar. Se aplica por FILA (no por código) para precisión.
 *  - `padres`: filaNum → `padreManual` (filaNum de la agrupadora destino, o null para
 *    quitar el override). Re-parentado manual (tabulador: indentar/desindentar).
 *
 * Además de escribir el staging, MEMORIZA las correcciones por cuenta en el perfil
 * del cliente (`correcciones_carga_balance`) para re-aplicarlas solas en las
 * próximas cargas. El cliente sale del parámetro (selección de la página) →
 * encabezado del lote → NIT detectado; sin cliente resoluble solo se guarda el
 * staging (como antes). Best-effort: memorizar nunca tumba el guardado.
 */
export async function aplicarCambiosBorrador(
  loteId: string,
  override: Record<string, "agrupadora" | "movimiento">,
  invertidos: string[],
  desacopladas: Record<string, boolean> = {},
  omitidas: Record<string, boolean> = {},
  padres: Record<string, number | null> = {},
  clienteId: number | null = null,
): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  const reclas = Object.entries(override ?? {}).filter(([c, t]) => /^\d+$/.test(c) && (t === "agrupadora" || t === "movimiento"));
  const invs = [...new Set((invertidos ?? []).filter((c) => /^\d+$/.test(c)))];
  const desac = Object.entries(desacopladas ?? {}).filter(([c]) => /^\d+$/.test(c));
  const omit = Object.entries(omitidas ?? {}).filter(([f]) => /^\d+$/.test(f));
  const pads = Object.entries(padres ?? {}).filter(([f]) => /^\d+$/.test(f));
  if (reclas.length === 0 && invs.length === 0 && desac.length === 0 && omit.length === 0 && pads.length === 0) return { ok: false, message: "No hay cambios para guardar." };
  try {
    // La UI filtra los destinos, pero una Server Action también es invocable por POST:
    // valida el grafo completo ANTES de cualquier escritura para evitar referencias a
    // otra fila, destinos que no agrupan o ciclos enviados desde un cliente alterado.
    if (pads.length > 0) {
      const staging = await filasStagingCorreccion(id);
      const tiposForzados = new Map(reclas);
      const filasValidacion: FilaBorrador[] = staging.map((f) => ({
        ...f,
        nivel: /^\d+$/.test(f.codigo) ? f.codigo.length : null,
        tipoFila: tiposForzados.get(f.codigo) ?? (f.tipoFila as FilaBorrador["tipoFila"]),
        omitida: f.omitida ?? undefined,
      }));
      const validacionReubicacion = validarReubicacionesBorrador(filasValidacion, Object.fromEntries(pads));
      if (!validacionReubicacion.ok) return { ok: false, message: validacionReubicacion.message };
    }

    let nRe = 0;
    let nInv = 0;
    let nDes = 0;
    let nOmi = 0;
    let nPad = 0;
    // Reclasificación en LOTE por destino (una consulta por dirección, no por código):
    // «Evitar doble conteo de subtotales» produce muchos códigos → agrupadora, así que un bucle
    // por código sería lento. Solo se voltea la fila si su tipo actual es el opuesto.
    const codsAgrup = reclas.filter(([, t]) => t === "agrupadora").map(([c]) => c);
    const codsMov = reclas.filter(([, t]) => t === "movimiento").map(([c]) => c);
    if (codsAgrup.length > 0) {
      const r = await prisma.balanceImportacionStaging.updateMany({ where: { loteId: id, codigo: { in: codsAgrup }, tipoFila: "movimiento" }, data: { tipoFila: "agrupadora" } });
      nRe += r.count;
    }
    if (codsMov.length > 0) {
      const r = await prisma.balanceImportacionStaging.updateMany({ where: { loteId: id, codigo: { in: codsMov }, tipoFila: "agrupadora" }, data: { tipoFila: "movimiento" } });
      nRe += r.count;
    }
    if (invs.length > 0) {
      const rows = await prisma.balanceImportacionStaging.findMany({
        where: { loteId: id, codigo: { in: invs } },
        select: { id: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
      });
      const controlOk = (si: number, db: number, cr: number, s: number) => Math.abs(si + db - cr - s) <= 1;
      const aInvertir = rows.filter((r) => {
        const si = Number(r.saldoInicial), db = Number(r.debitos), cr = Number(r.creditos), s = Number(r.saldoFinal);
        return !controlOk(si, db, cr, s) && controlOk(si, cr, db, s);
      });
      if (aInvertir.length > 0) {
        await prisma.$transaction(aInvertir.map((r) => prisma.balanceImportacionStaging.update({ where: { id: r.id }, data: { debitos: r.creditos, creditos: r.debitos } })));
        nInv = aInvertir.length;
      }
    }
    for (const [cod, on] of desac) {
      const r = await prisma.balanceImportacionStaging.updateMany({ where: { loteId: id, codigo: cod }, data: { desacoplada: on } });
      nDes += r.count;
    }
    for (const [fila, on] of omit) {
      const r = await prisma.balanceImportacionStaging.updateMany({ where: { loteId: id, filaNum: Number(fila) }, data: { omitida: on } });
      nOmi += r.count;
    }
    for (const [fila, destino] of pads) {
      const padreManual = typeof destino === "number" && Number.isInteger(destino) ? destino : null;
      const r = await prisma.balanceImportacionStaging.updateMany({ where: { loteId: id, filaNum: Number(fila) }, data: { padreManual } });
      nPad += r.count;
    }
    await actualizarResumenLoteBorrador(id);
    const user = await getCurrentUser();

    // PERFIL del cliente: memoriza las correcciones por cuenta para re-aplicarlas
    // solas en las próximas cargas. Best-effort: nunca tumba el guardado del staging.
    let nMemorizadas = 0;
    try {
      const cidParam = typeof clienteId === "number" && Number.isInteger(clienteId) && clienteId > 0 ? clienteId : null;
      const lote = cidParam == null
        ? await prisma.balanceImportacionLote.findUnique({ where: { loteId: id }, select: { clienteId: true, nitDetectado: true } })
        : null;
      const cid = cidParam ?? lote?.clienteId ?? (await clientePorNit(lote?.nitDetectado ?? null));
      if (cid != null) {
        const scope = await authorizePermiso("balance:crear", { clientId: cid });
        if (scope.ok) {
          const filas = await filasStagingCorreccion(id);
          const correcciones = construirCorrecciones(filas, {
            override: Object.fromEntries(reclas),
            invertidos: invs,
            desacopladas: Object.fromEntries(desac),
            omitidas: Object.fromEntries(omit),
            padres: Object.fromEntries(pads),
          });
          if (correcciones.length > 0) {
            nMemorizadas = await memorizarCorreccionesCliente(cid, correcciones, user?.name ?? null);
            revalidatePath("/config/clientes");
          }
        }
      }
    } catch {
      /* best-effort */
    }

    await logAudit({ user: user?.name ?? "—", action: "GUARDÓ cambios en balance borrador", entity: id, detail: `${nRe} reclasificada(s), ${nInv} inversión(es), ${nDes} desacople(s), ${nOmi} omitida(s), ${nPad} re-parentada(s)${nMemorizadas > 0 ? ` · ${nMemorizadas} cuenta(s) memorizadas en el perfil del cliente` : ""}` });
    // Huella diagnóstica: reclasificar/invertir mutan el staging sin marca durable,
    // así que se acumulan aquí (best-effort; los otros contadores se toman al cerrar).
    await acumularIntervencionManual(id, { reclasificadas: nRe, invertidas: nInv });
    revalidatePath(`/balance/borradores/${id}`);
    revalidatePath("/balance/borradores");
    const nTotal = nRe + nInv + nDes + nOmi + nPad;
    return {
      ok: true,
      message: `Cambios guardados (${nTotal} fila${nTotal === 1 ? "" : "s"}).${nMemorizadas > 0 ? ` Se memorizaron ${nMemorizadas} corrección(es) en el perfil del cliente: las próximas cargas las aplicarán solas.` : ""}`,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("aplicarCambiosBorrador", e) };
  }
}

/**
 * ASIGNA a un borrador el cliente elegido A MANO (cuando el NIT del archivo no se
 * detectó o no coincide con ningún cliente): PERSISTE el `clienteId` en el lote —
 * el borrador deja de estar «sin cliente» en la lista y la compuerta no vuelve a
 * pedirlo — y RE-APLICA sus correcciones memorizadas (la re-aplicación automática
 * de la lectura no corrió). La compuerta y el selector del borrador la llaman al
 * confirmar el cliente. Devuelve cuántas filas cambió para avisar y refrescar.
 */
export async function asignarClienteBorrador(loteId: string, clienteId: number): Promise<ActionState & { aplicadas?: number }> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  const cid = Number(clienteId);
  if (!id || !Number.isInteger(cid) || cid <= 0) return { ok: false, message: "Borrador o cliente inválido." };
  const scope = await authorizePermiso("balance:crear", { clientId: cid });
  if (!scope.ok) return { ok: false, message: scope.message };
  try {
    const cliente = await prisma.client.findUnique({ where: { id: cid }, select: { id: true } });
    if (!cliente) return { ok: false, message: "El cliente elegido ya no existe." };
    // FK suave: el lote puede no existir (borrador huérfano sin encabezado);
    // `updateMany` con 0 filas no falla y la asignación queda solo en la sesión.
    await prisma.balanceImportacionLote.updateMany({ where: { loteId: id }, data: { clienteId: cid } });
    const aplicadas = await aplicarCorreccionesGuardadas(id, cid);
    revalidatePath(`/balance/borradores/${id}`);
    revalidatePath("/balance/borradores");
    return {
      ok: true,
      aplicadas,
      message: aplicadas > 0
        ? `Cliente asignado al borrador. Se aplicaron ${aplicadas} corrección(es) memorizadas de su perfil.`
        : "Cliente asignado al borrador.",
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("asignarClienteBorrador", e) };
  }
}

/**
 * VALIDA (da OK) una alerta de naturaleza/saldo contrario de una cuenta del balance.
 * Exige un COMENTARIO justificativo (obligatorio), que se publica en la conversación
 * de la cuenta (anclado por su código) y queda ligado a la validación. Tras validar,
 * la alerta se retira de la vista (deja «Validado ✓», reversible). Autoriza como
 * operar el balance: `balance:crear` + alcance de escritura sobre el cliente.
 */
export async function validarAlerta(input: { balanceId: number; anchor: string; tipoAlerta: string; comentario: string }): Promise<ActionState> {
  const balanceId = Number(input?.balanceId);
  const anchor = String(input?.anchor ?? "").trim();
  const tipoAlerta = input?.tipoAlerta === "naturaleza" ? "naturaleza" : "saldo_contrario";
  const comentario = String(input?.comentario ?? "").trim();
  if (!Number.isInteger(balanceId) || balanceId <= 0 || !anchor) return { ok: false, message: "Alerta inválida." };
  if (comentario.length < 3) return { ok: false, message: "El comentario es obligatorio para validar la alerta." };
  const bal = await prisma.balancePruebaEncabezado.findUnique({ where: { id: balanceId }, select: { clienteId: true } });
  if (!bal) return { ok: false, message: "Balance no encontrado." };
  const authz = await authorizePermiso("balance:crear", { clientId: bal.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sesión no válida." };
  try {
    // Comentario + validación de forma ATÓMICA. La validación es única por
    // (balance, cuenta): re-validar reemplaza el comentario ligado.
    await prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({ data: { entityType: "balance", entityId: balanceId, anchor, authorId: user.id, body: comentario } });
      await tx.validacionAlerta.upsert({
        where: { balanceId_anchor: { balanceId, anchor } },
        update: { tipoAlerta, commentId: c.id, validadoPor: user.name, validadoPorId: user.id, validadoEn: new Date() },
        create: { balanceId, anchor, tipoAlerta, commentId: c.id, validadoPor: user.name, validadoPorId: user.id },
      });
    });
    await logAudit({ user: user.name, action: "VALIDÓ alerta de balance", entity: `${balanceId}:${anchor}`, detail: tipoAlerta });
    revalidatePath(`/balance/${balanceId}`);
    return { ok: true, message: "Alerta validada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("validarAlerta", e) };
  }
}

/**
 * REVIERTE la validación de una alerta: reaparece la alerta. El comentario
 * justificativo se CONSERVA como historial en la conversación de la cuenta.
 */
export async function revertirValidacionAlerta(input: { balanceId: number; anchor: string }): Promise<ActionState> {
  const balanceId = Number(input?.balanceId);
  const anchor = String(input?.anchor ?? "").trim();
  if (!Number.isInteger(balanceId) || balanceId <= 0 || !anchor) return { ok: false, message: "Alerta inválida." };
  const bal = await prisma.balancePruebaEncabezado.findUnique({ where: { id: balanceId }, select: { clienteId: true } });
  if (!bal) return { ok: false, message: "Balance no encontrado." };
  const authz = await authorizePermiso("balance:crear", { clientId: bal.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const del = await prisma.validacionAlerta.deleteMany({ where: { balanceId, anchor } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "—", action: "REVIRTIÓ validación de alerta", entity: `${balanceId}:${anchor}`, detail: `${del.count} validación(es)` });
    revalidatePath(`/balance/${balanceId}`);
    return { ok: true, message: "Validación revertida." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("revertirValidacionAlerta", e) };
  }
}

/**
 * ELIMINA una línea del detalle de un balance oficial — p. ej. una fila-total basura
 * («Totales Prueba», gran total) que se coló como cuenta. Recalcula el resumen del
 * encabezado (sumas, mapeo, críticas) desde el detalle restante, igual que al cargar.
 * BLOQUEADO si el balance está CONGELADO. Autoriza como operar el balance:
 * `balance:crear` + alcance de escritura sobre el cliente.
 */
export async function eliminarDetalleBalance(detalleId: number): Promise<ActionState> {
  const id = Number(detalleId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Cuenta del balance inexistente." };
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const fila = await prisma.balancePruebaDetalle.findUnique({
      where: { id },
      select: { cuenta8: true, nombreCuenta: true, encabezado: { select: { id: true, clienteId: true, estaCongelado: true } } },
    });
    if (!fila) return { ok: false, message: "La cuenta del balance ya no existe." };
    const alcance = await authorizePermiso("balance:crear", { clientId: fila.encabezado.clienteId });
    if (!alcance.ok) return { ok: false, message: alcance.message };
    if (fila.encabezado.estaCongelado) return { ok: false, message: "El balance está congelado: no se pueden eliminar cuentas." };
    const encId = fila.encabezado.id;

    await prisma.balancePruebaDetalle.delete({ where: { id } });

    // Recalcula el resumen del encabezado desde el detalle RESTANTE (misma lógica que
    // la carga), para que las sumas, el mapeo y las críticas queden consistentes.
    const [restantes, cuentasEstandar] = await Promise.all([
      prisma.balancePruebaDetalle.findMany({ where: { encabezadoId: encId }, select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true } }),
      getCuentasEstandar(),
    ]);
    const calc = reconstruirBalance(
      restantes.map((f) => ({ cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell, saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal) })),
      cuentasEstandar,
    );
    await prisma.balancePruebaEncabezado.update({
      where: { id: encId },
      data: {
        sumaActivo: calc.sums?.activo ?? 0, filasTotales: calc.totalRows,
        mapeadas: calc.mapped, sinMapear: calc.unmapped, criticas: calc.critical,
        completitud: calc.totalRows > 0 ? Math.round((calc.mapped / calc.totalRows) * 100) : 100,
      },
    });

    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "ELIMINÓ cuenta del balance", entity: fila.cuenta8, detail: `${fila.cuenta8} — ${fila.nombreCuenta}` });
    revalidatePath(`/balance/${encId}`);
    return { ok: true, message: `Cuenta ${fila.cuenta8} eliminada del balance.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarDetalleBalance", e) };
  }
}
