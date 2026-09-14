import "server-only";

/**
 * Cruce POR TERCERO de un cargue de módulo, resuelto contra la BD.
 *
 * Es el cálculo de la pestaña «Cruce por tercero» de `/modulos/[codigo]/[id]`, de su
 * exportación y el que verifican las Server Actions al marcar, emparejar y CERRAR la
 * conciliación. Se apoya en lo que ya resolvió el cruce contable (`cruce-contable-servidor.ts`):
 * el MISMO balance de comprobación del período (el oficial o, si no lo hay, la versión más
 * reciente: congelar no es requisito) y sus MISMAS compuertas
 * (prevalidador, verificaciones críticas). Del balance toma el detalle por tercero LIGADO por
 * `loteId` —la captura que se hizo al confirmarlo—, nunca uno parecido del mismo mes.
 *
 * El lado del módulo sale de los saldos materializados (`cartera_saldo_tercero`) en Cartera y
 * CxP, y del detalle en Ingresos; antes de comparar se aplican los emparejamientos manuales del
 * cliente. La comparación la hace el puro `construirCruceTerceroCartera` y las marcas de
 * auditoría por tercero se pegan con `anotarCruceTerceroConMarcas`.
 */
import prisma from "@/lib/prisma";
import { fmtDateTime } from "@/lib/format";
import { descriptorModulo, type DescriptorModulo } from "@/lib/modulos/descriptores";
import { cuenta4DelModulo, filtrarSubgruposPorModulo, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { calcularValorContableTercero } from "@/lib/modulos/valor-contable";
import { esFilaPropiaDeCuenta, filasEfectivasTercero } from "@/lib/balance/staging-tercero";
import { leerIdentidadTercero } from "@/lib/balance/identidad-tercero";
import { claveTerceroCanonica } from "@/lib/nit";
import { normalizarTerceroModulo } from "@/lib/modulos/tercero";
import { claveSinNit } from "@/lib/modulos/cartera/tercero-cartera";
import { materializarSaldosTercero } from "@/lib/modulos/cartera/saldos-tercero";
import { filaCarteraDesdeDetalle } from "@/lib/modulos/cartera/detalle-cartera";
import { ubicadorCuentaCliente } from "@/lib/modulos/cartera/origen-cartera";
import {
  construirCruceTerceroCartera,
  type MovimientoContableTercero,
  type ResumenCruceTerceroCartera,
  type SaldoModuloTercero,
} from "@/lib/modulos/cartera/cruce-tercero-cartera";
import {
  anotarCruceTerceroConMarcas,
  type FilaCruceTerceroMarcada,
  type MarcaCruce,
  type ResumenMarcas,
} from "@/lib/modulos/marcas-cruce";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import type { BalanceFuenteCruce, InsumosCruceModulo, ResultadoCruceModulo } from "@/lib/modulos/cruce-contable-servidor";

export type DetalleCruceTercero = {
  filaNum: number;
  valor: number;
  datos: Record<string, unknown>;
  nivel: string | null;
  imputable: boolean;
  cuentaCliente: string | null;
  origenCartera: string | null;
};

export type InsumosCruceTercero = {
  encabezado: {
    id: number;
    clienteId: number;
    moduloCodigo: string;
    periodo: string;
    total: number;
    nivelSaldo: string | null;
    detalles: readonly DetalleCruceTercero[];
  };
  /** Balance de comprobación que emparejó el cruce contable, y su compuerta. */
  balanceEmparejado: BalanceFuenteCruce | null;
  bloqueo: string | null;
  subgrupos: readonly { codigo: string; nombre: string }[];
  catalogoPrevalidador: InsumosCruceModulo["catalogoPrevalidador"];
  /** Homologación del cliente, para ubicar la cuenta que trae el archivo del módulo. */
  cuentasCliente: readonly { code: string; cuenta6Russell: string | null }[];
  /** Umbral de descuadre ya resuelto por quien llama; sin él se lee de `/config/parametros`. */
  umbralDescuadre?: number;
};

export type EstadoCruceTerceroModulo = "sin_balance" | "sin_detalle_tercero" | "bloqueado" | "listo";

/** Emparejamiento manual vigente para el período, tal como lo muestra la pestaña. */
export type EmparejamientoTerceroVm = {
  id: number;
  claveModulo: string;
  claveBalance: string;
  nombreModulo: string | null;
  nombreBalance: string | null;
  /** `null` = vale para todos los períodos del cliente. */
  periodo: string | null;
  origen: string;
  nota: string | null;
  creadoPor: string | null;
  creadoEn: string;
};

/** El resumen del cruce con cada tercero ya anotado con su marca. */
export type ResumenCruceTerceroMarcado = Omit<ResumenCruceTerceroCartera, "filas"> & { filas: FilaCruceTerceroMarcada[] };

export type ResultadoCruceTerceroModulo = {
  estado: EstadoCruceTerceroModulo;
  /** Qué falta para cruzar, en palabras para quien concilia. */
  mensaje: string | null;
  balanceTercero: { id: number; version: string } | null;
  resumen: ResumenCruceTerceroMarcado | null;
  /** Diferencias por tercero que exigen marca para cerrar, y cuántas la tienen. */
  resumenMarcas: ResumenMarcas | null;
  emparejamientos: EmparejamientoTerceroVm[];
  /** Umbral de descuadre de `/config/parametros` desde el que una diferencia exige marca. */
  umbralDescuadre: number;
  /** Filas contables del módulo sin homologación Russell o sin regla activa. */
  contableExcluidoFilas: number;
  /** El cargue es anterior a los saldos materializados: el lado módulo se calculó del detalle. */
  moduloDerivadoDelDetalle: boolean;
  /** Parte del total del cargue que no quedó atribuida a ningún tercero (debe ser 0). */
  moduloNoAtribuido: number;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/** Rótulos de la clave del cruce: «NIT»/«Nombre», o «Cédula»/«Empleado» en Nómina. */
export function etiquetasCruceTercero(descriptor: DescriptorModulo): { etiquetaClave: string; etiquetaNombre: string } {
  const cedula = descriptor.crucePorTercero.rolClave === "cedula";
  return { etiquetaClave: cedula ? "Cédula" : "NIT", etiquetaNombre: cedula ? "Empleado" : "Nombre" };
}

const origenDe = (origen: string | null | undefined): SaldoModuloTercero["origenCartera"] =>
  origen === "nacional" || origen === "exterior" ? origen : null;

const resultado = (
  estado: EstadoCruceTerceroModulo,
  mensaje: string | null,
  balanceTercero: ResultadoCruceTerceroModulo["balanceTercero"] = null,
): ResultadoCruceTerceroModulo => ({
  estado,
  mensaje,
  balanceTercero,
  resumen: null,
  resumenMarcas: null,
  emparejamientos: [],
  umbralDescuadre: 0,
  contableExcluidoFilas: 0,
  moduloDerivadoDelDetalle: false,
  moduloNoAtribuido: 0,
});

/**
 * Emparejamientos que valen para el período: los generales del cliente y los del período,
 * que prevalecen sobre un general de la misma clave del auxiliar.
 */
async function emparejamientosDelPeriodo(clienteId: number, moduloCodigo: string, periodo: string): Promise<EmparejamientoTerceroVm[]> {
  const filas = await prisma.emparejamientoTerceroModulo.findMany({
    where: { clienteId, moduloCodigo, periodo: { in: [periodo, ""] } },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
  });
  const porClave = new Map<string, (typeof filas)[number]>();
  for (const f of filas) {
    const previo = porClave.get(f.claveModulo);
    if (!previo || (previo.periodo === "" && f.periodo !== "")) porClave.set(f.claveModulo, f);
  }
  return [...porClave.values()].map((f) => ({
    id: f.id,
    claveModulo: f.claveModulo,
    claveBalance: f.claveBalance,
    nombreModulo: f.nombreModulo,
    nombreBalance: f.nombreBalance,
    periodo: f.periodo || null,
    origen: f.origen,
    nota: f.nota,
    creadoPor: f.creadoPor,
    creadoEn: fmtDateTime(f.creadoEn),
  }));
}

/** Marcas de auditoría por tercero del período, con sus soportes. */
async function marcasTerceroDelPeriodo(clienteId: number, moduloCodigo: string, periodo: string): Promise<MarcaCruce[]> {
  const filas = await prisma.marcaCruceModulo.findMany({
    where: { clienteId, moduloCodigo, periodo, dimension: "tercero" },
    orderBy: { numero: "asc" },
    select: {
      clave: true, numero: true, nota: true, referenciaAnexo: true, diferencia: true, comentarioId: true, marcadoPor: true, marcadoEn: true,
      adjuntos: { orderBy: { id: "asc" }, select: { id: true, nombreArchivo: true, tipoContenido: true, tamanoBytes: true } },
    },
  });
  return filas.map((m) => ({
    dimension: "tercero",
    cuenta4: "",
    clave: m.clave,
    numero: m.numero,
    nota: m.nota,
    referenciaAnexo: m.referenciaAnexo,
    diferencia: Number(m.diferencia),
    comentarioId: m.comentarioId,
    marcadoPor: m.marcadoPor,
    marcadoEn: fmtDateTime(m.marcadoEn),
    adjuntos: m.adjuntos,
    noModulares: [],
  }));
}

export async function construirCruceTerceroModulo(insumos: InsumosCruceTercero): Promise<ResultadoCruceTerceroModulo> {
  const { encabezado, balanceEmparejado } = insumos;
  const descriptor = descriptorModulo(encabezado.moduloCodigo);
  if (!descriptor?.crucePorTercero.habilitado) return resultado("sin_balance", null);
  if (!balanceEmparejado) return resultado("sin_balance", null);

  const balance = await prisma.balancePruebaEncabezado.findUnique({
    where: { id: balanceEmparejado.id },
    select: { loteId: true },
  });
  const balanceTercero = balance?.loteId
    ? await prisma.balanceTerceroEncabezado.findUnique({
        where: { loteId: balance.loteId },
        select: { id: true, version: true, clienteId: true },
      })
    : null;
  if (!balanceTercero || balanceTercero.clienteId !== encabezado.clienteId) {
    return resultado(
      "sin_detalle_tercero",
      `El balance ${balanceEmparejado.version} del período no conserva detalle por tercero. `
        + "Se captura al confirmar el borrador del balance declarando la apertura «Por terceros»: vuelve a cargarlo así para cruzar por tercero.",
    );
  }
  const ref = { id: balanceTercero.id, version: balanceTercero.version };
  if (insumos.bloqueo) return resultado("bloqueado", insumos.bloqueo, ref);

  const conDetalle = descriptor.crucePorTercero.detalleTercero === true;
  const prefijos = prefijosCuentaModulo(encabezado.moduloCodigo, insumos.catalogoPrevalidador);
  const codigosModulo = new Set(filtrarSubgruposPorModulo([...insumos.subgrupos], prefijos).map((s) => s.codigo));

  const [crudas, emparejamientos, marcas, umbrales] = await Promise.all([
    prisma.balanceTerceroDetalle.findMany({
      where: {
        encabezadoId: balanceTercero.id,
        OR: prefijos.flatMap((p) => [{ cuenta6Russell: { startsWith: p } }, { cuenta4: { startsWith: p } }]),
      },
      select: {
        cuenta4: true, cuenta8: true, cuenta6Russell: true,
        nitTercero: true, claveTercero: true, nombreTercero: true, identidadTercero: true,
        debitos: true, creditos: true, saldoFinal: true,
      },
    }),
    emparejamientosDelPeriodo(encabezado.clienteId, encabezado.moduloCodigo, encabezado.periodo),
    marcasTerceroDelPeriodo(encabezado.clienteId, encabezado.moduloCodigo, encabezado.periodo),
    insumos.umbralDescuadre != null ? Promise.resolve({ descuadre: insumos.umbralDescuadre }) : getUmbralesAlertas(),
  ]);

  // ===== Lado contable =====
  let contableExcluidoFilas = 0;
  const movimientos: MovimientoContableTercero[] = [];
  // Dedup de la fila «propia»: una cuenta con detalle usa solo sus terceros.
  for (const d of filasEfectivasTercero(crudas)) {
    if (!d.cuenta6Russell) {
      if (cuenta4DelModulo(d.cuenta4, prefijos)) contableExcluidoFilas += 1;
      continue;
    }
    const russell = d.cuenta6Russell.replace(/\D/g, "");
    if (!codigosModulo.has(russell.slice(0, 4))) continue;
    const calculo = calcularValorContableTercero({
      moduloCodigo: encabezado.moduloCodigo,
      cuentaRussell: d.cuenta6Russell,
      fila: { debitos: Number(d.debitos), creditos: Number(d.creditos), saldoFinal: Number(d.saldoFinal) },
      catalogo: insumos.catalogoPrevalidador,
      naturaleza: descriptor.crucePorTercero.naturaleza,
    });
    if (!calculo) {
      contableExcluidoFilas += 1;
      continue;
    }
    let clave: string | null = null;
    if (!esFilaPropiaDeCuenta(d)) {
      // Cartera y CxP cruzan por el documento completo; el resto conserva el núcleo de 9
      // con el que su auxiliar se lee.
      clave = conDetalle
        ? d.claveTercero
          ?? claveTerceroCanonica(leerIdentidadTercero(d.identidadTercero)?.numeroDocumento ?? d.nitTercero)
          ?? claveSinNit(d.nombreTercero)
        : d.nitTercero?.trim() || null;
    }
    movimientos.push({ cuenta6: russell.slice(0, 6), clave, nombre: d.nombreTercero?.trim() || null, valor: calculo.valor });
  }

  // ===== Lado del módulo =====
  let moduloDerivadoDelDetalle = false;
  let saldosModulo: SaldoModuloTercero[];
  if (conDetalle) {
    const cuenta6DelArchivo = ubicadorCuentaCliente(insumos.cuentasCliente);
    const materializados = await prisma.saldoTerceroModulo.findMany({
      where: { encabezadoId: encabezado.id, origen: { in: ["imputable", "agregado"] } },
      select: { claveTercero: true, nombre: true, saldo: true, origenCartera: true, cuentaCliente: true },
    });
    let fuente = materializados.map((s) => ({ ...s, saldo: Number(s.saldo) }));
    if (fuente.length === 0 && encabezado.detalles.length > 0) {
      moduloDerivadoDelDetalle = true;
      const nivel = encabezado.nivelSaldo === "documento" ? "documento" : "tercero";
      fuente = materializarSaldosTercero(
        encabezado.detalles.map((d) => filaCarteraDesdeDetalle(d, nivel)),
        { loteId: "detalle", nivelImputable: nivel },
      ).saldos.filter((s) => s.origen !== "declarado");
    }
    saldosModulo = fuente.map((s) => ({
      clave: s.claveTercero,
      nombre: s.nombre,
      saldo: s.saldo,
      origenCartera: origenDe(s.origenCartera),
      cuenta6: cuenta6DelArchivo(s.cuentaCliente),
    }));
  } else {
    const rolClave = descriptor.crucePorTercero.rolClave ?? "tercero";
    const rolNombre = descriptor.crucePorTercero.rolNombre ?? null;
    saldosModulo = encabezado.detalles.map((d) => {
      const t = normalizarTerceroModulo(d.datos[rolClave] as string | number | null | undefined);
      const nombreAparte = rolNombre ? String(d.datos[rolNombre] ?? "").trim() || null : null;
      return { clave: t.nitCanonico, nombre: t.nombre ?? nombreAparte, saldo: d.valor, origenCartera: null, cuenta6: null };
    });
  }
  const sumaModulo = saldosModulo.reduce((suma, s) => suma + s.saldo, 0);
  const noAtribuido = redondear(encabezado.total - sumaModulo);

  const cruce = construirCruceTerceroCartera({
    contable: movimientos,
    modulo: saldosModulo,
    cuentasModulo: descriptor.crucePorTercero.cuentasRussell6?.length ? descriptor.crucePorTercero.cuentasRussell6 : null,
    emparejamientos,
  });
  const anotado = anotarCruceTerceroConMarcas(cruce.filas, marcas, { umbralDescuadre: umbrales.descuadre });

  return {
    estado: "listo",
    mensaje: null,
    balanceTercero: ref,
    resumen: { ...cruce, filas: anotado.filas },
    resumenMarcas: anotado.resumen,
    emparejamientos,
    umbralDescuadre: umbrales.descuadre,
    contableExcluidoFilas,
    moduloDerivadoDelDetalle,
    moduloNoAtribuido: Math.abs(noAtribuido) <= 0.01 ? 0 : noAtribuido,
  };
}

/**
 * El cruce por tercero de un cargue a partir de los insumos y el resultado del cruce contable
 * que ya calculó quien llama (acciones de marca, emparejamiento y cierre; exportación). Carga lo
 * que el cruce contable no necesita: el detalle con la identidad del tercero y la homologación.
 * `null` si el módulo no cruza por tercero o el cargue ya no existe.
 */
export async function cruceTerceroDeCargue(
  insumos: InsumosCruceModulo,
  cruce: Pick<ResultadoCruceModulo, "balanceEmparejado" | "bloqueo">,
): Promise<ResultadoCruceTerceroModulo | null> {
  const descriptor = descriptorModulo(insumos.encabezado.moduloCodigo);
  if (!descriptor?.crucePorTercero.habilitado) return null;
  const [encabezado, cuentasCliente] = await Promise.all([
    prisma.moduloDatoEncabezado.findUnique({
      where: { id: insumos.encabezado.id },
      select: {
        total: true,
        nivelSaldo: true,
        detalles: { select: { filaNum: true, valor: true, datos: true, nivel: true, imputable: true, cuentaCliente: true, origenCartera: true } },
      },
    }),
    prisma.clientAccount.findMany({
      where: { clienteId: insumos.encabezado.clienteId, cuenta6Russell: { not: null } },
      select: { code: true, cuenta6Russell: true },
    }),
  ]);
  if (!encabezado) return null;
  return construirCruceTerceroModulo({
    encabezado: {
      id: insumos.encabezado.id,
      clienteId: insumos.encabezado.clienteId,
      moduloCodigo: insumos.encabezado.moduloCodigo,
      periodo: insumos.encabezado.periodo,
      total: Number(encabezado.total),
      nivelSaldo: encabezado.nivelSaldo,
      detalles: encabezado.detalles.map((d) => ({
        filaNum: d.filaNum,
        valor: Number(d.valor),
        datos: (d.datos ?? {}) as Record<string, unknown>,
        nivel: d.nivel,
        imputable: d.imputable,
        cuentaCliente: d.cuentaCliente,
        origenCartera: d.origenCartera,
      })),
    },
    balanceEmparejado: cruce.balanceEmparejado,
    bloqueo: cruce.bloqueo,
    subgrupos: insumos.subgrupos,
    catalogoPrevalidador: insumos.catalogoPrevalidador,
    cuentasCliente,
  });
}
