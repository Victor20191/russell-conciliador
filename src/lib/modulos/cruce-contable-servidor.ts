import "server-only";

/**
 * Cruce contable de un cargue de módulo, resuelto contra la BD.
 *
 * Es el MISMO cálculo que pinta la pestaña «Cruce contable» de
 * `/modulos/[codigo]/[id]` y el que verifica la Server Action al CERRAR la
 * conciliación: una sola implementación para que la precondición del cierre
 * («cuadra o todas las diferencias tienen marca») se evalúe sobre exactamente lo
 * que vio el usuario. La página aporta los insumos que ya cargó; la acción los
 * carga con `cargarInsumosCruceModulo`.
 */
import prisma from "@/lib/prisma";
import { fmtDateTime } from "@/lib/format";
import { descriptorModulo, bloqueoCrucePorVerificacionesCriticasModulo } from "@/lib/modulos/descriptores";
import { cuenta4DelModulo, filtrarSubgruposPorModulo, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { construirCruceContable, type ResumenCruceContable } from "@/lib/modulos/cruce-contable";
import { anotarCruceConMarcas, type FilaCruceMarcada, type MarcaCruce, type ResumenMarcas } from "@/lib/modulos/marcas-cruce";
import { calcularValorContableModulo } from "@/lib/modulos/valor-contable";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";
import {
  cuentasAgrupadorasExcluidas,
  seleccionarBalanceCruceModulo,
  validarCompuertaPrevalidador,
  validarRangoBalanceModulo,
} from "@/lib/modulos/compuerta-cruce";

export type InsumosCruceModulo = {
  encabezado: {
    id: number;
    clienteId: number;
    nombreCliente: string;
    moduloCodigo: string;
    periodo: string;
    verificaciones: unknown;
    detalles: { clasificador: string | null; valor: number }[];
  };
  consolidacionRows: { clasificador: string; cuenta4: string }[];
  subgrupos: { codigo: string; nombre: string }[];
  catalogoPrevalidador: Awaited<ReturnType<typeof getCatalogoPrevalidador>>;
};

export type BalanceFuenteCruce = {
  id: number;
  version: string;
  periodo: string;
  periodoInicio: string;
  periodoFin: string;
  esOficial: boolean;
  estaCongelado: boolean;
};

export type ResultadoCruceModulo = {
  balanceEmparejado: BalanceFuenteCruce | null;
  bloqueo: string | null;
  cruceContable: ResumenCruceContable | null;
  sinMapeoContable: { total: number; filas: number } | null;
  sinReglaContableFilas: number;
  marcas: MarcaCruce[];
  filasMarcadas: FilaCruceMarcada[];
  resumenMarcas: ResumenMarcas | null;
};

export async function cargarInsumosCruceModulo(encabezadoId: number): Promise<InsumosCruceModulo | null> {
  const encabezado = await prisma.moduloDatoEncabezado.findUnique({
    where: { id: encabezadoId },
    select: {
      id: true,
      clienteId: true,
      nombreCliente: true,
      moduloCodigo: true,
      periodo: true,
      verificaciones: true,
      detalles: { select: { clasificador: true, valor: true } },
    },
  });
  if (!encabezado) return null;
  const [consolidacionRows, subgrupos, catalogoPrevalidador] = await Promise.all([
    prisma.consolidacionModuloCliente.findMany({
      where: { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo },
      select: { clasificador: true, cuenta4: true },
    }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true }, orderBy: { codigo: "asc" } }),
    getCatalogoPrevalidador(),
  ]);
  return {
    encabezado: {
      ...encabezado,
      detalles: encabezado.detalles.map((d) => ({ clasificador: d.clasificador, valor: Number(d.valor) })),
    },
    consolidacionRows,
    subgrupos,
    catalogoPrevalidador,
  };
}

/**
 * Cruce contable completo: selección del balance del período, compuerta del
 * prevalidador, agregado contable por cuenta Russell de 4 díg., cédula y marcas.
 */
export async function construirCruceContableModulo(insumos: InsumosCruceModulo): Promise<ResultadoCruceModulo> {
  const { encabezado, consolidacionRows, subgrupos, catalogoPrevalidador } = insumos;
  const moduloCodigo = encabezado.moduloCodigo;
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) {
    return vacio(null, `Módulo ${moduloCodigo} no reconocido.`);
  }

  const cuentasPorClasificador = new Map<string, string[]>();
  for (const r of consolidacionRows) {
    const lista = cuentasPorClasificador.get(r.clasificador) ?? [];
    lista.push(r.cuenta4);
    cuentasPorClasificador.set(r.clasificador, lista);
  }
  for (const [k, v] of cuentasPorClasificador) cuentasPorClasificador.set(k, [...new Set(v)].sort());
  const nombrePorCuenta = new Map(subgrupos.map((s) => [s.codigo, s.nombre]));
  const prefijosModulo = prefijosCuentaModulo(moduloCodigo, catalogoPrevalidador);
  const codigosModulo = new Set(filtrarSubgruposPorModulo(subgrupos, prefijosModulo).map((c) => c.codigo));
  const consolidado = consolidarPorClasificador(encabezado.detalles.map((d) => ({ clasificador: d.clasificador, valor: d.valor })));
  const verifGuardadas = (encabezado.verificaciones ?? {}) as Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>;

  // Para módulos de movimiento se prioriza el balance oficial y congelado que cubra
  // exactamente el mes calendario; después, la compuerta común exige que ese balance
  // conserve una aprobación vigente del prevalidador.
  const balancesConfirmados = await prisma.balancePruebaEncabezado.findMany({
    where: { clienteId: encabezado.clienteId },
    select: { id: true, periodo: true, periodoInicio: true, periodoFin: true, version: true, esOficial: true, estaCongelado: true },
    orderBy: [{ esOficial: "desc" }, { periodoFin: "desc" }, { id: "desc" }],
  });
  const emparejado = seleccionarBalanceCruceModulo(balancesConfirmados, catalogoPrevalidador, moduloCodigo, encabezado.periodo);
  const balanceEmparejado: BalanceFuenteCruce | null = emparejado
    ? {
        id: emparejado.id,
        version: emparejado.version,
        periodo: emparejado.periodo,
        periodoInicio: emparejado.periodoInicio.toISOString().slice(0, 10),
        periodoFin: emparejado.periodoFin.toISOString().slice(0, 10),
        esOficial: emparejado.esOficial,
        estaCongelado: emparejado.estaCongelado,
      }
    : null;

  let cruceContable: ResumenCruceContable | null = null;
  let sinMapeoContable: { total: number; filas: number } | null = null;
  let sinReglaContableFilas = 0;
  let bloqueo = bloqueoCrucePorVerificacionesCriticasModulo(descriptor, verifGuardadas);
  let contextoBalance: Awaited<ReturnType<typeof cargarContextoPrevalidadorBalance>> | null = null;

  if (emparejado && !bloqueo) {
    try {
      contextoBalance = await cargarContextoPrevalidadorBalance(emparejado.id);
      bloqueo =
        validarCompuertaPrevalidador(contextoBalance, encabezado.clienteId, moduloCodigo) ??
        validarRangoBalanceModulo(contextoBalance, moduloCodigo, encabezado.periodo);
    } catch {
      bloqueo = "No fue posible verificar de forma íntegra el prevalidador del balance seleccionado.";
    }
  }
  if (emparejado && contextoBalance && !bloqueo) {
    const cuentasAgrupadoras = cuentasAgrupadorasExcluidas(contextoBalance.prevalidador);
    const contablePorCuenta: Record<string, number> = {};
    let sinMapeoTotal = 0;
    let sinMapeoFilas = 0;
    for (const d of contextoBalance.filas) {
      const cuenta8 = d.cuenta8.replace(/\D/g, "");
      if (cuentasAgrupadoras.has(cuenta8)) continue;
      const cuenta4 = cuenta8.slice(0, 4);
      const filaContable = { debitos: d.debitos, creditos: d.creditos, saldoFinal: d.saldoFinal };
      if (d.cuenta6Russell) {
        const sub4 = d.cuenta6Russell.replace(/\D/g, "").slice(0, 4);
        if (!codigosModulo.has(sub4)) continue;
        const calculo = calcularValorContableModulo({ moduloCodigo, cuentaRussell: d.cuenta6Russell, fila: filaContable, catalogo: contextoBalance.catalogo });
        if (!calculo) {
          sinReglaContableFilas += 1;
          continue;
        }
        contablePorCuenta[sub4] = (contablePorCuenta[sub4] ?? 0) + calculo.valor;
      } else if (cuenta4DelModulo(cuenta4, prefijosModulo)) {
        const calculo = calcularValorContableModulo({ moduloCodigo, cuentaRussell: cuenta4, fila: filaContable, catalogo: contextoBalance.catalogo });
        if (!calculo) {
          sinReglaContableFilas += 1;
          continue;
        }
        sinMapeoTotal += calculo.valor;
        sinMapeoFilas += 1;
      }
    }
    cruceContable = construirCruceContable({
      contablePorCuenta,
      consolidado: consolidado.map((c) => ({ clasificador: c.clasificador, total: c.total, cuentas4: cuentasPorClasificador.get(c.clasificador) ?? [] })),
      nombrePorCuenta: (cod) => nombrePorCuenta.get(cod) ?? null,
    });
    if (sinMapeoFilas > 0) sinMapeoContable = { total: sinMapeoTotal, filas: sinMapeoFilas };
    if (sinReglaContableFilas > 0) {
      bloqueo = `Se omitieron ${sinReglaContableFilas} fila(s) contable(s) porque no tienen una regla activa aplicable. Configura y aprueba nuevamente el prevalidador antes de conciliar.`;
      cruceContable = null;
      sinMapeoContable = null;
    }
  }

  // Marcas de auditoría: viven por (cliente, módulo, período), NO por cargue.
  const marcasPeriodo = await prisma.marcaCruceModulo.findMany({
    where: { clienteId: encabezado.clienteId, moduloCodigo, periodo: encabezado.periodo },
    orderBy: { numero: "asc" },
    select: {
      cuenta4: true, numero: true, nota: true, referenciaAnexo: true, diferencia: true, comentarioId: true, marcadoPor: true, marcadoEn: true,
      adjuntos: { orderBy: { id: "asc" }, select: { id: true, nombreArchivo: true, tipoContenido: true, tamanoBytes: true } },
    },
  });
  const marcas: MarcaCruce[] = marcasPeriodo.map((m) => ({
    cuenta4: m.cuenta4,
    numero: m.numero,
    nota: m.nota,
    referenciaAnexo: m.referenciaAnexo,
    diferencia: Number(m.diferencia),
    comentarioId: m.comentarioId,
    marcadoPor: m.marcadoPor,
    marcadoEn: fmtDateTime(m.marcadoEn),
    adjuntos: m.adjuntos,
  }));
  const anotado = cruceContable ? anotarCruceConMarcas(cruceContable.filas, marcas) : null;

  return {
    balanceEmparejado,
    bloqueo,
    cruceContable,
    sinMapeoContable,
    sinReglaContableFilas,
    marcas,
    filasMarcadas: anotado?.filas ?? [],
    resumenMarcas: anotado?.resumen ?? null,
  };
}

function vacio(balanceEmparejado: BalanceFuenteCruce | null, bloqueo: string | null): ResultadoCruceModulo {
  return {
    balanceEmparejado,
    bloqueo,
    cruceContable: null,
    sinMapeoContable: null,
    sinReglaContableFilas: 0,
    marcas: [],
    filasMarcadas: [],
    resumenMarcas: null,
  };
}
