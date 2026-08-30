import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";
import { PageHeader, BackLink } from "@/components/ui";
import Conversacion from "@/components/conversacion";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import {
  filtrarSubgruposPorModulo,
  prefijosCuentaModulo,
  cuenta4DelModulo,
} from "@/lib/modulos/cuentas-modulo";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { detectarNegativos, detectarDescuadres } from "@/lib/modulos/validaciones";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { fmtDateTime } from "@/lib/format";
import { construirCruceContable, type ResumenCruceContable } from "@/lib/modulos/cruce-contable";
import { construirCruceTercero, type ResumenCruceTercero } from "@/lib/modulos/cruce-tercero";
import { normalizarTerceroModulo } from "@/lib/modulos/tercero";
import { agregarPorNit } from "@/lib/modulos/agregar-por-nit";
import { anotarCruceConMarcas, type MarcaCruce } from "@/lib/modulos/marcas-cruce";
import DatoCargadoClient, { type FilaDetalleVm, type ConsolidadoVm, type NovedadesVm, type VersionModuloVm, type CruceContableVm, type CruceTerceroVm } from "./dato-cargado-client";

/** ¿El `periodoFin` del balance cae en el mismo año-mes que el período del módulo ("YYYY-MM")? */
function mismoAnioMes(periodoFin: Date, periodoModulo: string): boolean {
  const [anioStr, mesStr] = periodoModulo.split("-");
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  if (!Number.isInteger(anio) || !Number.isInteger(mes)) return false;
  return periodoFin.getUTCFullYear() === anio && periodoFin.getUTCMonth() + 1 === mes;
}

export default async function DatoModuloPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePermiso("modulos_datos:ver");
  const [{ codigo, id }, query] = await Promise.all([params, searchParams]);
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  const encabezadoId = Number(id);
  if (!descriptor || !Number.isInteger(encabezadoId)) notFound();

  const encabezado = await prisma.moduloDatoEncabezado.findUnique({
    where: { id: encabezadoId },
    include: { detalles: { orderBy: { filaNum: "asc" } } },
  });
  if (!encabezado || encabezado.moduloCodigo !== moduloCodigo) notFound();

  // Alcance de lectura sobre el cliente del dato (fail-closed).
  const scope = await authorizePermiso("modulos_datos:ver", { clientId: encabezado.clienteId });
  if (!scope.ok) notFound();

  // ¿Puede editar la consolidación de este cliente?
  const puedeEditar = (await authorizePermiso("modulos_datos:editar", { clientId: encabezado.clienteId })).ok;

  const [consolidacionRows, subgrupos, catalogoPrevalidador, comentariosGrp, cuentasCliente, hermanos] = await Promise.all([
    prisma.consolidacionModuloCliente.findMany({
      where: { clienteId: encabezado.clienteId, moduloCodigo },
      select: { clasificador: true, descripcion: true, cuenta4: true },
    }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true }, orderBy: { codigo: "asc" } }),
    getCatalogoPrevalidador(),
    prisma.comment.groupBy({ by: ["anchor"], where: { entityType: "modulos_datos", entityId: encabezadoId }, _count: { _all: true } }),
    // Homologación del cliente: cuentas propias mapeadas al plan Russell (para detallar por subgrupo).
    prisma.clientAccount.findMany({
      where: { clienteId: encabezado.clienteId, cuenta6Russell: { not: null } },
      select: { code: true, name: true, level: true, cuenta6Russell: true },
      orderBy: { code: "asc" },
    }),
    prisma.moduloDatoEncabezado.findMany({
      where: {
        clienteId: encabezado.clienteId,
        moduloCodigo,
        periodo: encabezado.periodo,
      },
      orderBy: [{ version: "desc" }, { ultimaCarga: "desc" }, { id: "desc" }],
      select: {
        id: true,
        version: true,
        esOficial: true,
        filas: true,
        total: true,
        archivoNombre: true,
        archivoTam: true,
        origenExtraccion: true,
        observaciones: true,
        cargadoPor: true,
        ultimaCarga: true,
      },
    }),
  ]);
  // Un clasificador puede tener 1..N cuentas: agrupamos en lista (ordenada).
  const cuentasPorClasificador = new Map<string, string[]>();
  // Nombre legible del clasificador cuando existe (Nómina: el clasificador es el CÓDIGO
  // del concepto y la descripción es su nombre, cargado en /config/conceptos-nomina).
  const descripcionPorClasificador = new Map<string, string>();
  for (const r of consolidacionRows) {
    const lista = cuentasPorClasificador.get(r.clasificador) ?? [];
    lista.push(r.cuenta4);
    cuentasPorClasificador.set(r.clasificador, lista);
    if (r.descripcion && !descripcionPorClasificador.has(r.clasificador)) {
      descripcionPorClasificador.set(r.clasificador, r.descripcion);
    }
  }
  for (const [k, v] of cuentasPorClasificador) cuentasPorClasificador.set(k, [...new Set(v)].sort());
  // Nombres del plan completo (por si hay un mapeo legado fuera del módulo).
  const nombrePorCuenta = new Map(subgrupos.map((s) => [s.codigo, s.nombre]));
  const comentariosPorAncla: Record<string, number> = {};
  for (const g of comentariosGrp) if (g.anchor) comentariosPorAncla[g.anchor] = g._count._all;
  // El datalist solo ofrece cuentas Russell del módulo (p. ej. INV → 14xx).
  const prefijosModulo = prefijosCuentaModulo(moduloCodigo, catalogoPrevalidador);
  const cuentasModulo = filtrarSubgruposPorModulo(subgrupos, prefijosModulo);
  // Cuentas del CLIENTE homologadas a cada subgrupo Russell del módulo (14XX → [143505 «…»]).
  const codigosModulo = new Set(cuentasModulo.map((c) => c.codigo));
  const homologacionPorSubgrupo: Record<string, { codigo: string; nombre: string }[]> = {};
  // Índice INVERSO (cuenta del cliente → su cuenta Russell de 4 díg) para que el campo
  // rápido del cruce acepte que el usuario escriba su propia cuenta. Va SIN filtrar por
  // módulo a propósito: así se puede avisar «143504 está homologada a 4175, que no
  // pertenece a Inventarios» en vez de un «no encontrada» que haría pensar que falta
  // parametrizarla. Quien decide si entra es `resolverCuenta4`.
  const resolucionCliente: Record<string, { cuenta4: string; nombre: string }> = {};
  for (const a of cuentasCliente) {
    const sub = (a.cuenta6Russell ?? "").replace(/\D/g, "").slice(0, 4);
    if (sub) resolucionCliente[a.code] = { cuenta4: sub, nombre: a.name };
    if (!codigosModulo.has(sub)) continue;
    (homologacionPorSubgrupo[sub] ??= []).push({ codigo: a.code, nombre: a.name });
  }

  const detalleVm: FilaDetalleVm[] = encabezado.detalles.map((d) => ({
    filaNum: d.filaNum,
    clasificador: d.clasificador,
    valor: Number(d.valor),
    datos: (d.datos ?? {}) as Record<string, string | number | null>,
  }));

  // Novedades: negativos y descuadres RECALCULADOS del detalle + checklist/observaciones guardados.
  const filasVal = detalleVm.map((d) => ({ filaNum: d.filaNum, clasificador: d.clasificador, datos: d.datos }));
  const negativos = detectarNegativos(descriptor, filasVal);
  const descuadres = detectarDescuadres(descriptor, filasVal);
  const verifGuardadas = (encabezado.verificaciones ?? {}) as Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>;
  const novedades: NovedadesVm = {
    negativos: negativos.map((n) => ({ filaNum: n.filaNum, etiqueta: n.etiqueta, referencia: n.referencia, valor: n.valor })),
    descuadres: descuadres.map((d) => ({ filaNum: d.filaNum, referencia: d.referencia, etiqueta: d.resultadoEtiqueta, declarado: d.declarado, esperado: d.esperado })),
    observaciones: encabezado.observaciones ?? null,
    verificaciones: (descriptor.verificaciones ?? []).map((v) => ({ texto: v.texto, respuesta: verifGuardadas[v.id]?.respuesta ?? null, nota: verifGuardadas[v.id]?.nota ?? null })),
  };

  const consolidado = consolidarPorClasificador(detalleVm.map((d) => ({ clasificador: d.clasificador, valor: d.valor })));
  const consolidadoVm: ConsolidadoVm[] = consolidado.map((c) => ({
    clasificador: c.clasificador,
    descripcion: descripcionPorClasificador.get(c.clasificador) ?? null,
    total: c.total,
    filas: c.filas,
    cuentas4: (cuentasPorClasificador.get(c.clasificador) ?? []).map((cod) => ({ codigo: cod, nombre: nombrePorCuenta.get(cod) ?? null })),
  }));
  // Cruce contable: saldo del balance de comprobación CONFIRMADO (fuera de borrador) cuyo
  // período (año-mes de `periodoFin`) coincida con el período del módulo, contra el
  // consolidado por clasificador que se está viendo (`encabezadoId` actual). No exige el
  // congelado: basta con que el balance ya esté cargado. Si el período tiene una versión
  // marcada oficial/vigente (`esOficial`) se prefiere esa; si no, la última versión cargada.
  const balancesConfirmados = await prisma.balancePruebaEncabezado.findMany({
    where: { clienteId: encabezado.clienteId },
    select: { id: true, periodoFin: true },
    orderBy: [{ esOficial: "desc" }, { periodoFin: "desc" }, { id: "desc" }],
  });
  const balanceEmparejado = balancesConfirmados.find((b) => mismoAnioMes(b.periodoFin, encabezado.periodo)) ?? null;

  let cruceContable: ResumenCruceContable | null = null;
  let sinMapeoContable: { total: number; filas: number } | null = null;
  if (balanceEmparejado) {
    const detallesBalance = await prisma.balancePruebaDetalle.findMany({
      where: { encabezadoId: balanceEmparejado.id },
      select: { cuenta4: true, cuenta6Russell: true, saldoFinal: true },
    });
    const contablePorCuenta: Record<string, number> = {};
    let sinMapeoTotal = 0;
    let sinMapeoFilas = 0;
    for (const d of detallesBalance) {
      const saldo = Number(d.saldoFinal);
      if (d.cuenta6Russell) {
        const sub4 = d.cuenta6Russell.replace(/\D/g, "").slice(0, 4);
        if (codigosModulo.has(sub4)) contablePorCuenta[sub4] = (contablePorCuenta[sub4] ?? 0) + saldo;
      } else if (cuenta4DelModulo(d.cuenta4, prefijosModulo)) {
        sinMapeoTotal += saldo;
        sinMapeoFilas += 1;
      }
    }
    cruceContable = construirCruceContable({
      contablePorCuenta,
      consolidado: consolidadoVm.map((c) => ({ clasificador: c.clasificador, total: c.total, cuentas4: c.cuentas4.map((x) => x.codigo) })),
      nombrePorCuenta: (cod) => nombrePorCuenta.get(cod) ?? null,
    });
    if (sinMapeoFilas > 0) sinMapeoContable = { total: sinMapeoTotal, filas: sinMapeoFilas };
  }
  // Marcas de auditoría de las diferencias del cruce: viven por (cliente, módulo,
  // período), NO por cargue, así que siguen visibles al abrir otra versión del período.
  const marcasPeriodo = await prisma.marcaCruceModulo.findMany({
    where: { clienteId: encabezado.clienteId, moduloCodigo, periodo: encabezado.periodo },
    orderBy: { numero: "asc" },
    select: {
      cuenta4: true,
      numero: true,
      nota: true,
      referenciaAnexo: true,
      diferencia: true,
      comentarioId: true,
      marcadoPor: true,
      marcadoEn: true,
      adjuntos: {
        orderBy: { id: "asc" },
        select: { id: true, nombreArchivo: true, tipoContenido: true, tamanoBytes: true },
      },
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
  const cruceAnotado = cruceContable ? anotarCruceConMarcas(cruceContable.filas, marcas) : null;

  const cruceContableVm: CruceContableVm = {
    balanceEncontrado: balanceEmparejado != null,
    periodo: encabezado.periodo,
    nombreCliente: encabezado.nombreCliente,
    resumen: cruceContable,
    sinMapeoContable,
    filasMarcadas: cruceAnotado?.filas ?? [],
    resumenMarcas: cruceAnotado?.resumen ?? null,
  };

  // Cruce por tercero (NIT): SOLO para módulos cuyo descriptor tiene columna "tercero"
  // (CAR/CXP). Mismo criterio de emparejamiento de período que el cruce contable, pero
  // contra el balance abierto POR TERCERO del cliente (`balance_tercero_*`).
  const tieneRolTercero = descriptor.columnas.some((c) => c.nombre === "tercero");
  let cruceTercero: ResumenCruceTercero | null = null;
  let balanceTerceroEncontrado = false;
  // Cargue por tercero emparejado (mismo año-mes): lo necesita el enlace de la pestaña.
  let balanceTerceroRef: { id: number; version: string } | null = null;
  let contableSinNit: { total: number; filas: number } | null = null;
  let moduloSinNit: { total: number; filas: number } | null = null;

  if (tieneRolTercero) {
    const balancesTercero = await prisma.balanceTerceroEncabezado.findMany({
      where: { clienteId: encabezado.clienteId },
      select: { id: true, periodoFin: true, version: true },
      orderBy: [{ esOficial: "desc" }, { periodoFin: "desc" }, { id: "desc" }],
    });
    const balanceTerceroEmparejado = balancesTercero.find((b) => mismoAnioMes(b.periodoFin, encabezado.periodo)) ?? null;
    balanceTerceroEncontrado = balanceTerceroEmparejado != null;
    balanceTerceroRef = balanceTerceroEmparejado
      ? { id: balanceTerceroEmparejado.id, version: balanceTerceroEmparejado.version }
      : null;

    if (balanceTerceroEmparejado) {
      const detallesTercero = await prisma.balanceTerceroDetalle.findMany({
        where: { encabezadoId: balanceTerceroEmparejado.id },
        select: { cuenta4: true, nitTercero: true, nombreTercero: true, saldoFinal: true },
      });
      const itemsContables = detallesTercero
        .filter((d) => cuenta4DelModulo(d.cuenta4, prefijosModulo))
        .map((d) => ({ nit: d.nitTercero, nombre: d.nombreTercero, saldo: Number(d.saldoFinal) }));
      const { aportes: contablePorNit, sinNit: contableSinNitCalc } = agregarPorNit(itemsContables);
      contableSinNit = contableSinNitCalc;

      // Cada fila del detalle ya llegó a `modulo_dato_detalle` como IMPUTABLE (movimiento,
      // no omitida, no en cero): la promoción (`esImputable`) filtra antes de persistir.
      const itemsModulo = detalleVm.map((d) => {
        const t = normalizarTerceroModulo(d.datos.tercero as string | number | null | undefined);
        return { nit: t.nitCanonico, nombre: t.nombre, saldo: d.valor };
      });
      const { aportes: moduloPorNit, sinNit: moduloSinNitCalc } = agregarPorNit(itemsModulo);
      moduloSinNit = moduloSinNitCalc;

      cruceTercero = construirCruceTercero({ contablePorNit, moduloPorNit });
    }
  }

  const cruceTerceroVm: CruceTerceroVm = {
    aplica: tieneRolTercero,
    balanceEncontrado: balanceTerceroEncontrado,
    balanceTerceroId: balanceTerceroRef?.id ?? null,
    balanceTerceroVersion: balanceTerceroRef?.version ?? null,
    periodo: encabezado.periodo,
    nombreCliente: encabezado.nombreCliente,
    resumen: cruceTercero,
    contableSinNit,
    moduloSinNit,
  };

  const versiones: VersionModuloVm[] = hermanos.map((hermano) => ({
    id: hermano.id,
    version: hermano.version,
    esOficial: hermano.esOficial,
    filas: hermano.filas,
    total: Number(hermano.total),
    archivoNombre: hermano.archivoNombre,
    archivoTam: hermano.archivoTam,
    origenExtraccion: hermano.origenExtraccion,
    observaciones: hermano.observaciones,
    cargadoPor: hermano.cargadoPor,
    ultimaCarga: fmtDateTime(hermano.ultimaCarga),
  }));
  const vigente = hermanos.find((hermano) => hermano.esOficial) ?? hermanos[0] ?? null;

  return (
    <div>
      <div className="mb-3"><BackLink href={`/modulos/${codigo.toLowerCase()}`} label={`Volver a ${descriptor.label}`} /></div>
      <PageHeader
        title={`${descriptor.label} · ${encabezado.nombreCliente}`}
        subtitle={`Período ${encabezado.periodo} · v${encabezado.version}${encabezado.esOficial ? " vigente" : " histórica"} · ${encabezado.filas} filas`}
      />
      {!encabezado.esOficial && vigente && vigente.id !== encabezado.id && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
          <span>Estás consultando una versión histórica. La versión vigente es v{vigente.version}.</span>
          <Link href={`/modulos/${codigo.toLowerCase()}/${vigente.id}?tab=versiones`} className="font-semibold text-blue-700 hover:underline">
            Abrir versión vigente
          </Link>
        </div>
      )}
      <DatoCargadoClient
        moduloCodigo={moduloCodigo}
        encabezadoId={encabezado.id}
        comentarios={comentariosPorAncla}
        clienteId={encabezado.clienteId}
        total={Number(encabezado.total)}
        columnas={descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo }))}
        clasificadorEtiqueta={descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiqueta ?? "Clasificador"}
        detalle={detalleVm}
        consolidado={consolidadoVm}
        cruceContable={cruceContableVm}
        cruceTercero={cruceTerceroVm}
        novedades={novedades}
        cuentas={cuentasModulo.map((s) => ({ codigo: s.codigo, nombre: s.nombre }))}
        homologacionCliente={homologacionPorSubgrupo}
        resolucionCliente={resolucionCliente}
        moduloLabel={descriptor.label}
        puedeEditar={puedeEditar}
        versiones={versiones}
        versionActualId={encabezado.id}
        tabInicial={query.tab === "versiones" ? "versiones" : null}
      />
      <div className="mt-4">
        <Conversacion
          tipo="modulos_datos"
          entityId={encabezado.id}
          titulo={`Conversación · ${descriptor.label} · ${encabezado.nombreCliente} · ${encabezado.periodo} v${encabezado.version}`}
        />
      </div>
    </div>
  );
}
