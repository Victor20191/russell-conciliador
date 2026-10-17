import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";
import { PageHeader, BackLink } from "@/components/ui";
import Conversacion from "@/components/conversacion";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import {
  claveCedula,
  claveCruceContable,
  cuentasCedula6,
  opcionesCedula,
} from "@/lib/modulos/cuentas-modulo";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { validacionDelCargue } from "@/lib/modulos/validacion-cargue";
import { detectarNegativos, detectarDescuadres, detectarAlertasCosto } from "@/lib/modulos/validaciones";
import { resolverDescriptorVigente } from "@/lib/parametros/cuentas-conciliacion";
import { fmtDateTime } from "@/lib/format";
import type { MarcaPeriodo } from "@/lib/modulos/marcas-cruce";
import { cedulaDelCargue, llaveAsignacion } from "@/lib/modulos/asignacion-periodo";
import { cargarInsumosPeriodo } from "@/lib/modulos/insumos-periodo-servidor";
import { columnasDetalleModulo } from "@/lib/modulos/cartera/columnas-cartera";
import { cargarCuentasEstandarDeCedula, cierreFijadoDe, construirCruceContableModulo } from "@/lib/modulos/cruce-contable-servidor";
import { construirCruceTerceroModulo, etiquetasCruceTercero } from "@/lib/modulos/cruce-tercero-servidor";
import { finDePeriodo } from "@/lib/modulos/cartera/fecha-corte";
import { CLAVE_MONEDA } from "@/lib/modulos/cartera/detalle-cartera";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { ESTADO_CIERRE_FIRME, estadoEdicionCargue, evaluarCierreConciliacion } from "@/lib/conciliacion/cuentas-bloqueo";
import { descripcionCopiaCierre } from "@/lib/conciliacion/copia-cierre";
import { autorizarCierreConciliacion, autorizarComentarioAlertaModulo } from "@/lib/conciliacion/verificar-bloqueo";
import { alertasConComentarioDelCargue, comentaValidacionesActivos, validacionesTerceroDelCargue } from "@/lib/modulos/comentarios-alertas-servidor";
import { validarActivos } from "@/lib/modulos/activos/validaciones-activos";
import DatoCargadoClient, { type FilaDetalleVm, type ConsolidadoVm, type AgrupadorVm, type NovedadesVm, type VersionModuloVm, type CruceContableVm, type CruceTerceroVm, type CierreConciliacionVm } from "./dato-cargado-client";
import { construirConsolidadoNominaDeGrupos } from "@/lib/modulos/nomina/consolidado-nomina";
import { validarNominaConNovedades } from "@/lib/modulos/nomina/validaciones-nomina";
import { agruparPorDisponibles, columnasConDatosCargue, conteoDetalleCargue, gruposNominaDelCargue, nombresCuentasCliente, novedadesFilaNominaDelCargue } from "@/lib/modulos/cargue-servidor";
import { agruparPorDeEncabezado, etiquetaAgruparPor, etiquetaAgruparPorPlural } from "@/lib/modulos/nomina/agrupar-por";
import type { ClaseNomina } from "@/lib/modulos/nomina/homologacion";
import { cuentasClientePorClasificador, motivoPropuestaClasificador, proponerCuentaDeClasificador, type PropuestaCuentaClasificador } from "@/lib/modulos/cuenta-clasificador";
import { leerContenidoArchivos } from "@/lib/modulos/ingresos/contenido-archivo";

export default async function DatoModuloPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string; id: string }>;
  searchParams: Promise<{ tab?: string; panel?: string }>;
}) {
  await requirePermiso("modulos_datos:ver");
  const [{ codigo, id }, query] = await Promise.all([params, searchParams]);
  const moduloCodigo = codigo.toUpperCase();
  const descriptorBase = descriptorModulo(moduloCodigo);
  const encabezadoId = Number(id);
  if (!descriptorBase || !Number.isInteger(encabezadoId)) notFound();

  const encabezado = await prisma.moduloDatoEncabezado.findUnique({ where: { id: encabezadoId } });
  if (!encabezado || encabezado.moduloCodigo !== moduloCodigo) notFound();
  // Las cuentas que concilia el módulo: las de /config/prevalidador o, con la conciliación del
  // período en firme, las que guardó el cierre.
  const descriptor = await resolverDescriptorVigente(descriptorBase, { clienteId: encabezado.clienteId, periodo: encabezado.periodo });
  // Nómina: por qué se agrupan los conceptos del Consolidado (código, nombre o cuenta del cliente).
  // Rige la memoria que se lee, la clave de los renglones y el cruce.
  const agruparPor = agruparPorDeEncabezado(encabezado.agruparPor);
  // El detalle de un cargue de NÓMINA son cientos de miles de filas (INCODOL: 124.957 = 70 MB):
  // su consolidado y sus novedades se piden agregados y la pestaña «Detalle» pagina.
  const detalles = descriptor.nomina
    ? []
    : await prisma.moduloDatoDetalle.findMany({ where: { encabezadoId }, orderBy: { filaNum: "asc" } });

  // Alcance de lectura sobre el cliente del dato (fail-closed).
  const scope = await authorizePermiso("modulos_datos:ver", { clientId: encabezado.clienteId });
  if (!scope.ok) notFound();

  // ¿Puede editar la consolidación de este cliente? (Con la conciliación del período en firme, no:
  // `estadoEdicionCargue`, más abajo.)
  const permisoEditar = (await authorizePermiso("modulos_datos:editar", { clientId: encabezado.clienteId })).ok;

  // Consolidado DEL PERÍODO (la memoria del cliente con la asignación solo de este período encima),
  // reglas del prevalidador y, en Nómina, clases por centro y homologación del cliente. Con la
  // conciliación del período en firme salen de la copia congelada del cierre: lo que se cambie desde
  // otro mes no altera lo conciliado.
  const [insumosPeriodo, subgrupos, comentariosGrp, cuentasCliente, hermanos, marcasPeriodoRows] = await Promise.all([
    cargarInsumosPeriodo({ clienteId: encabezado.clienteId, moduloCodigo, periodo: encabezado.periodo, agruparPor, esNomina: descriptor.nomina != null }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true }, orderBy: { codigo: "asc" } }),
    prisma.comment.groupBy({ by: ["anchor"], where: { entityType: "modulos_datos", entityId: encabezadoId }, _count: { _all: true } }),
    // Homologación del cliente: cuentas propias mapeadas al plan Russell (para detallar por subgrupo).
    prisma.clientAccount.findMany({
      where: { clienteId: encabezado.clienteId, cuenta6Russell: { not: null } },
      select: { code: true, name: true, level: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoEn: true },
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
    // Todas las marcas del período (cuenta y tercero comparten la numeración): cada pestaña del
    // cruce lista también las de la otra para que la secuencia se lea completa.
    prisma.marcaCruceModulo.findMany({
      where: { clienteId: encabezado.clienteId, moduloCodigo, periodo: encabezado.periodo },
      orderBy: { numero: "asc" },
      select: {
        numero: true, dimension: true, cuenta4: true, clave: true, nota: true, diferencia: true, marcadoPor: true, marcadoEn: true,
        _count: { select: { adjuntos: true } },
        noModulares: { orderBy: { cuenta8: "asc" }, select: { cuenta8: true, nombreCuenta: true } },
      },
    }),
  ]);
  const marcasPeriodo: MarcaPeriodo[] = marcasPeriodoRows.map((m) => ({
    numero: m.numero,
    dimension: m.dimension === "tercero" ? "tercero" : m.dimension === "control" ? "control" : "cuenta4",
    llave: (m.dimension === "tercero" || m.dimension === "control" ? m.clave : m.cuenta4) ?? "",
    nota: m.nota,
    diferencia: Number(m.diferencia),
    marcadoPor: m.marcadoPor,
    marcadoEn: fmtDateTime(m.marcadoEn),
    soportes: m._count.adjuntos,
    noModulares: m.noModulares.map((n) => ({ cuenta8: n.cuenta8, nombre: n.nombreCuenta })),
  }));
  const { consolidacion, catalogoPrevalidador } = insumosPeriodo;
  const consolidacionRows = consolidacion.filas;
  const cuentasEstandar = await cargarCuentasEstandarDeCedula(descriptor, consolidacion.filasPeriodo.map((f) => f.cuenta6));
  // Cédula contable: subgrupo de 4 dígitos, cuenta Russell completa (Nómina, Cartera, CxP) o una
  // mezcla (Activos fijos abre la 1592; Ingresos suma la 422005). Es la del PERÍODO: incluye las
  // cuentas que el usuario asignó solo para este cliente y período.
  const { cedula, extras: cuentasPeriodo } = cedulaDelCargue(descriptor, moduloCodigo, catalogoPrevalidador, consolidacion.filasPeriodo);
  const nivel = cedula.nivel;
  // Renglones del Consolidado cuya asignación vale solo para este período.
  const renglonesSoloPeriodo = new Set(consolidacion.filasPeriodo.map((f) => llaveAsignacion(f.clasificador, f.agrupador)));
  // Un clasificador puede tener 1..N cuentas: agrupamos en lista (ordenada).
  const cuentasPorClasificador = new Map<string, string[]>();
  // Nombre legible del clasificador cuando existe (Nómina: el clasificador es el CÓDIGO
  // del concepto y la descripción es su nombre, cargado en /config/conceptos-nomina).
  const descripcionPorClasificador = new Map<string, string>();
  for (const r of consolidacionRows) {
    // A 6 dígitos solo cuenta la homologación completa: una fila con cuenta4 y sin cuenta6
    // (guardada antes de que el módulo cruzara a 6) deja el concepto «sin cuenta».
    const clave = claveCedula(cedula, r.cuenta6, r.cuenta4);
    if (clave) {
      const lista = cuentasPorClasificador.get(r.clasificador) ?? [];
      lista.push(clave);
      cuentasPorClasificador.set(r.clasificador, lista);
    }
    if (r.descripcion && !descripcionPorClasificador.has(r.clasificador)) {
      descripcionPorClasificador.set(r.clasificador, r.descripcion);
    }
  }
  for (const [k, v] of cuentasPorClasificador) cuentasPorClasificador.set(k, [...new Set(v)].sort());
  // Nombres del plan completo (por si hay un mapeo legado fuera del módulo).
  const nombrePorCuenta = new Map([
    ...subgrupos.map((s) => [s.codigo, s.nombre] as const),
    ...cuentasEstandar.map((c) => [c.codigo, c.nombre] as const),
  ]);
  const comentariosPorAncla: Record<string, number> = {};
  for (const g of comentariosGrp) if (g.anchor) comentariosPorAncla[g.anchor] = g._count._all;
  // El datalist solo ofrece cuentas Russell del módulo (p. ej. INV → 14xx; Nómina → 510506…;
  // Ingresos → 41xx y 422005). La 1592xx de Activos fijos no se asigna: sale de la relación.
  // Las solo visibles (Nómina) se asignan igual; el nombre lo dice para que no se confundan.
  const cuentasModulo = opcionesCedula(cedula, subgrupos, cuentasEstandar)
    .map((c) => (cedula.visibles.has(c.codigo) ? { ...c, nombre: `${c.nombre} · solo visible` } : c));
  // Cuentas del plan Russell que el usuario agregó solo para este período, con su nombre.
  const cuentasPeriodoVm = cuentasPeriodo.map((codigo) => ({ codigo, nombre: nombrePorCuenta.get(codigo) ?? "" }));
  // Cuentas del CLIENTE homologadas a cada cuenta Russell del módulo (14XX → [143505 «…»]).
  const codigosModulo = new Set([...cuentasModulo.map((c) => c.codigo), ...cuentasPeriodo]);
  const homologacionPorSubgrupo: Record<string, { codigo: string; nombre: string }[]> = {};
  // Índice INVERSO (cuenta del cliente → su cuenta Russell de 4 y de 6 díg) para que el campo
  // rápido del cruce acepte que el usuario escriba su propia cuenta. Va SIN filtrar por
  // módulo a propósito: así se puede avisar «143504 está homologada a 4175, que no
  // pertenece a Inventarios» en vez de un «no encontrada» que haría pensar que falta
  // parametrizarla. Quien decide si entra es `resolverCuenta4`.
  const resolucionCliente: Record<string, { cuenta4: string; cuenta6: string | null; nombre: string }> = {};
  for (const a of cuentasCliente) {
    const sub = (a.cuenta6Russell ?? "").replace(/\D/g, "").slice(0, 4);
    if (!sub) continue;
    resolucionCliente[a.code] = { cuenta4: sub, cuenta6: claveCruceContable(a.cuenta6Russell, 6), nombre: a.name };
    const clave = claveCedula(cedula, a.cuenta6Russell);
    if (!clave || !codigosModulo.has(clave)) continue;
    (homologacionPorSubgrupo[clave] ??= []).push({ codigo: a.code, nombre: a.name });
  }

  // ACTIVOS FIJOS: el grupo trae pegada la cuenta del CLIENTE («AF152805»). La lectura ya la
  // extrajo con el prefijo del patrón; aquí se homologa como se homologó el balance y se PROPONE,
  // sin guardarla: hasta que el auditor la apruebe, el renglón no cruza.
  const propuestasArchivo = new Map<string, PropuestaCuentaClasificador>();
  if (descriptor.cuentaDesdeClasificador) {
    const entornoArchivo = {
      subgruposModulo: codigosModulo,
      homologacionCliente: new Map(Object.entries(resolucionCliente)),
      nivel,
    };
    for (const [clasificador, cuentaCliente] of cuentasClientePorClasificador(
      detalles.map((d) => ({ clasificador: d.clasificador, datos: (d.datos ?? {}) as Record<string, unknown> })),
    )) {
      // Se resuelve sobre la cuenta ya extraída: el prefijo se aplicó al leer el archivo.
      propuestasArchivo.set(clasificador, proponerCuentaDeClasificador(cuentaCliente, entornoArchivo));
    }
  }

  const detalleVm: FilaDetalleVm[] = detalles.map((d) => ({
    filaNum: d.filaNum,
    clasificador: d.clasificador,
    valor: Number(d.valor),
    datos: (d.datos ?? {}) as Record<string, string | number | null>,
  }));

  // Novedades: negativos y descuadres RECALCULADOS del detalle + checklist/observaciones guardados.
  const filasVal = detalleVm.map((d) => ({ filaNum: d.filaNum, clasificador: d.clasificador, datos: d.datos }));
  const negativos = detectarNegativos(descriptor, filasVal);
  const descuadres = detectarDescuadres(descriptor, filasVal);
  const alertasCosto = descriptor.alertasCosto ? detectarAlertasCosto(descriptor, filasVal) : null;
  // Quién puede comentar las alertas que lo exigen para cerrar (staff, senior o gerente asignados).
  const comentarAuth = descriptor.alertasConComentario?.length ? await autorizarComentarioAlertaModulo(encabezado.clienteId) : null;
  const verifGuardadas = (encabezado.verificaciones ?? {}) as Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>;
  const novedades: NovedadesVm = {
    negativos: negativos.map((n) => ({ filaNum: n.filaNum, etiqueta: n.etiqueta, referencia: n.referencia, valor: n.valor })),
    descuadres: descuadres.map((d) => ({ filaNum: d.filaNum, referencia: d.referencia, etiqueta: d.resultadoEtiqueta, declarado: d.declarado, esperado: d.esperado })),
    // Inventarios: costo cero con existencias, sin existencias y con costo, costo unitario 1.
    alertasCosto: alertasCosto?.map((a) => ({ tipo: a.tipo, filaNum: a.filaNum, referencia: a.referencia, cantidad: a.cantidad, unitario: a.unitario, total: a.total })) ?? null,
    observaciones: encabezado.observaciones ?? null,
    // Ingresos: qué trae cada archivo del cargue (facturas / notas crédito) y si se invirtió.
    archivosCargue: leerContenidoArchivos(encabezado.contenidoArchivos),
    verificaciones: (descriptor.verificaciones ?? []).map((v) => ({ texto: v.texto, respuesta: verifGuardadas[v.id]?.respuesta ?? null, nota: verifGuardadas[v.id]?.nota ?? null })),
    // Único control que NO se recalcula del detalle: el total que declaró el archivo vive en
    // una fila no imputable y el staging que la traía se purga al promover, así que se lee de
    // lo que el encabezado congeló. `null` = cargue anterior a esta validación.
    validacionArchivo: validacionDelCargue({
      total: Number(encabezado.total),
      filas: encabezado.filas,
      totalDeclarado: encabezado.totalDeclarado == null ? null : Number(encabezado.totalDeclarado),
      filaTotalDeclarado: encabezado.filaTotalDeclarado,
      archivosDelCargue: encabezado.archivosDelCargue,
      archivosConTotal: encabezado.archivosConTotal,
    }),
  };

  // Nómina: un renglón por (concepto, centro de costo) con la memoria guardada para ese par y la
  // sugerencia de homologación (cuenta del archivo, memoria + regla de clase, grupo por nombre).
  const reglasClase = insumosPeriodo.nomina?.reglasClase ?? new Map<string, ClaseNomina>();
  const [gruposNomina, agruparPorConDatos] = descriptor.nomina
    ? await Promise.all([gruposNominaDelCargue(encabezadoId, agruparPor), agruparPorDisponibles(encabezadoId)])
    : [undefined, null];
  // Agrupando por cuenta, el renglón se nombra por la cuenta del cliente (también las que el
  // balance aún no tiene homologadas, que `cuentasCliente` no trae).
  const nombrePorCuentaCliente = descriptor.nomina && agruparPor === "cuenta" && gruposNomina
    ? await nombresCuentasCliente(encabezado.clienteId, gruposNomina.map((g) => g.codigo))
    : undefined;
  const consolidadoNomina = descriptor.nomina && gruposNomina
    ? construirConsolidadoNominaDeGrupos({
        grupos: gruposNomina,
        memoria: consolidacionRows.map((r) => ({ ...r, cuenta6: r.cuenta6 ?? "" })),
        reglasClase,
        mapeoCliente: insumosPeriodo.nomina?.mapeoCliente ?? new Map<string, string>(),
        cuentasRussell6: cuentasCedula6(descriptor, cuentasPeriodo),
        agruparPor,
        nombrePorCuentaCliente,
      })
    : null;
  const consolidado = consolidarPorClasificador(detalleVm.map((d) => ({ clasificador: d.clasificador, valor: d.valor })));
  const consolidadoVm: ConsolidadoVm[] = consolidadoNomina
    ? consolidadoNomina.renglones.map((c) => ({
        clasificador: c.clasificador,
        codigo: c.codigo,
        agrupador: c.agrupador,
        cuentaArchivo: c.cuentaArchivo,
        codigoArchivo: c.codigoArchivo ?? null,
        descripcion: c.descripcion,
        total: c.total,
        filas: c.filas,
        cuentas4: c.cuentas.map((cod) => ({ codigo: cod, nombre: nombrePorCuenta.get(cod) ?? null })),
        sugerencia: c.sugerencia,
        soloPeriodo: renglonesSoloPeriodo.has(llaveAsignacion(c.codigo, c.agrupador)),
      }))
    : consolidado.map((c) => {
        const propuesta = propuestasArchivo.get(c.clasificador);
        return {
          clasificador: c.clasificador,
          descripcion: descripcionPorClasificador.get(c.clasificador) ?? null,
          total: c.total,
          filas: c.filas,
          cuentas4: (cuentasPorClasificador.get(c.clasificador) ?? []).map((cod) => ({ codigo: cod, nombre: nombrePorCuenta.get(cod) ?? null })),
          soloPeriodo: renglonesSoloPeriodo.has(llaveAsignacion(c.clasificador, "")),
          // La cuenta que trae el archivo, ya homologada: propuesta, nunca guardada sola.
          propuestaArchivo: propuesta
            ? propuesta.ok
              ? { cuenta: propuesta.cuenta, cuentaCliente: propuesta.cuentaCliente, nombreCliente: propuesta.nombreCliente, via: propuesta.via }
              : { motivo: motivoPropuestaClasificador(propuesta, descriptor.label) }
            : null,
        };
      });
  const agrupadoresVm: AgrupadorVm[] = consolidadoNomina?.agrupadores ?? [];
  // Cruce contable (balance vs. archivos del módulo): el MISMO cálculo que verifica
  // la Server Action al cerrar la conciliación (`cruce-contable-servidor.ts`).
  const cruce = await construirCruceContableModulo({
    descriptor,
    encabezado: {
      id: encabezado.id,
      clienteId: encabezado.clienteId,
      nombreCliente: encabezado.nombreCliente,
      moduloCodigo,
      periodo: encabezado.periodo,
      verificaciones: encabezado.verificaciones,
      detalles: detalles.map((d) => ({
        clasificador: d.clasificador,
        valor: Number(d.valor),
        datos: (d.datos ?? {}) as Record<string, unknown>,
        imputable: d.imputable,
      })),
      gruposNomina,
      ...(descriptor.nomina ? { agruparPorNomina: agruparPor, nombrePorCuentaCliente } : {}),
    },
    consolidacionRows,
    asignacionesPeriodo: consolidacion.filasPeriodo,
    subgrupos,
    cuentasEstandar,
    catalogoPrevalidador,
    nomina: insumosPeriodo.nomina,
    cierreFijado: cierreFijadoDe(insumosPeriodo),
    umbralDescuadre: insumosPeriodo.umbralDescuadre,
    toleranciaCedula: insumosPeriodo.toleranciaCedula,
    toleranciaDetalleActivos: insumosPeriodo.toleranciaDetalleActivos,
  });
  const balanceEmparejado = cruce.balanceEmparejado;

  // Cruce por tercero (la compuerta tipada del descriptor decide si el módulo lo tiene). Se
  // resuelve antes del estado del cierre porque en Cartera y CxP la conciliación no se cierra
  // sin él. Mismo balance y compuertas del cruce contable, contra el detalle por tercero ligado.
  const cruceTercero = descriptor.crucePorTercero.habilitado
    ? await construirCruceTerceroModulo({
        descriptor,
        encabezado: {
          id: encabezado.id,
          clienteId: encabezado.clienteId,
          moduloCodigo,
          periodo: encabezado.periodo,
          total: Number(encabezado.total),
          nivelSaldo: encabezado.nivelSaldo,
          detalles: detalles.map((d) => ({
            filaNum: d.filaNum,
            valor: Number(d.valor),
            datos: (d.datos ?? {}) as Record<string, unknown>,
            nivel: d.nivel,
            imputable: d.imputable,
            cuentaCliente: d.cuentaCliente,
            origenCartera: d.origenCartera,
          })),
        },
        balanceEmparejado,
        bloqueo: cruce.bloqueo,
        subgrupos,
        catalogoPrevalidador,
        consolidacionRows,
        asignacionesPeriodo: consolidacion.filasPeriodo,
        conAlcance: true,
        umbralDescuadre: insumosPeriodo.umbralDescuadre ?? undefined,
      })
    : null;

  // Cartera y CxP: validaciones del auxiliar por tercero, recalculadas al leer sobre el detalle
  // y el cruce recién construidos (edades vs total, documentos repetidos, claves, naturaleza). Las
  // mismas que evalúa el cierre (`cargarValidacionesTercero`).
  const validacionesTercero = descriptor.crucePorTercero.detalleTercero
    ? await validacionesTerceroDelCargue({
        descriptor,
        encabezado,
        filas: detalles.map((d) => ({
          filaNum: d.filaNum,
          valor: Number(d.valor),
          imputable: d.imputable,
          nitCanonico: d.nitCanonico,
          datos: (d.datos ?? {}) as Record<string, unknown>,
          nivel: d.nivel,
        })),
        cruce: cruceTercero?.resumen ?? null,
      })
    : null;
  // Alertas que exigen un comentario por tipo para cerrar la conciliación (Inventarios, Cartera y
  // CxP), con el comentario del período y si quedó por revisar. El cierre evalúa estas mismas.
  // Activos fijos: costo o neto negativo por activo, depreciación sin costo y neto del archivo
  // contra el calculado (costo + adiciones + mejoras + valorización − depreciación − deterioro).
  const validacionesActivos = comentaValidacionesActivos(descriptor)
    ? validarActivos(detalles.map((d) => ({ filaNum: d.filaNum, valor: Number(d.valor), imputable: d.imputable, datos: (d.datos ?? {}) as Record<string, unknown> })))
    : null;
  const alertasComentario = await alertasConComentarioDelCargue(
    descriptor,
    { id: encabezado.id, clienteId: encabezado.clienteId, moduloCodigo, periodo: encabezado.periodo },
    { filas: filasVal, validacionesTercero, validacionesActivos },
  );

  // Conciliación en firme del (cliente, módulo, período): estado + quién puede
  // cerrar/desbloquear (senior o gerente asignado; Superadministrador por alcance).
  const [cierreRow, cerrarAuth, desbloquearAuth, administrarCuentasAuth] = await Promise.all([
    prisma.conciliacionModuloCierre.findUnique({
      where: { clienteId_moduloCodigo_periodo: { clienteId: encabezado.clienteId, moduloCodigo, periodo: encabezado.periodo } },
      select: {
        id: true, estado: true, balancePeriodo: true, balanceEncabezadoId: true, moduloDatoEncabezadoId: true,
        cerradoPor: true, cerradoEn: true, desbloqueadoPor: true, desbloqueadoEn: true, justificacionDesbloqueo: true,
        _count: { select: { cuentas: true } },
      },
    }),
    autorizarCierreConciliacion("conciliaciones:cerrar", encabezado.clienteId),
    autorizarCierreConciliacion("conciliaciones:desbloquear", encabezado.clienteId),
    // Quién puede editar las cuentas que concilia el módulo (Filtros de cuentas): el panel del cruce por tercero lo enlaza.
    authorizePermiso("parametros:administrar"),
  ]);
  const exigeTercero = descriptor.crucePorTercero.habilitado && descriptor.crucePorTercero.exigidoParaCierre === true;
  const evaluacionCierre = cruce.cruceContable
    ? evaluarCierreConciliacion(
        cruce.cruceContable,
        cruce.resumenMarcas,
        exigeTercero
          ? { exigido: true, estado: cruceTercero?.estado ?? "sin_balance", mensaje: cruceTercero?.mensaje ?? null, resumenMarcas: cruceTercero?.resumenMarcas ?? null }
          : null,
        alertasComentario,
        cruce.bloqueosCierre,
        cruce.resumenMarcasControl,
      )
    : null;
  const cierreVm: CierreConciliacionVm = {
    cierre: cierreRow
      ? {
          id: cierreRow.id,
          enFirme: cierreRow.estado === ESTADO_CIERRE_FIRME,
          balancePeriodo: cierreRow.balancePeriodo,
          balanceEncabezadoId: cierreRow.balanceEncabezadoId,
          moduloDatoEncabezadoId: cierreRow.moduloDatoEncabezadoId,
          cuentasBloqueadas: cierreRow._count.cuentas,
          cerradoPor: cierreRow.cerradoPor,
          cerradoEn: fmtDateTime(cierreRow.cerradoEn),
          desbloqueadoPor: cierreRow.desbloqueadoPor,
          desbloqueadoEn: cierreRow.desbloqueadoEn ? fmtDateTime(cierreRow.desbloqueadoEn) : null,
          justificacionDesbloqueo: cierreRow.justificacionDesbloqueo,
          insumos: cierreRow.estado === ESTADO_CIERRE_FIRME
            ? descripcionCopiaCierre(insumosPeriodo.cierre?.copia ?? null, (iso) => fmtDateTime(new Date(iso)))
            : null,
        }
      : null,
    puedeCerrar: cerrarAuth.ok,
    puedeDesbloquear: desbloquearAuth.ok,
    motivoNoCerrable: evaluacionCierre && !evaluacionCierre.ok ? evaluacionCierre.motivo : null,
  };

  // Con la conciliación del período EN FIRME el cargue es de solo lectura aunque haya permiso.
  const edicion = estadoEdicionCargue({
    puedeEditar: permisoEditar,
    cierre: cierreRow ? { estado: cierreRow.estado, cerradoPor: cierreRow.cerradoPor, cerradoEn: cierreRow.cerradoEn } : null,
  });

  const cruceContableVm: CruceContableVm = {
    balanceEncontrado: balanceEmparejado != null,
    periodo: encabezado.periodo,
    nombreCliente: encabezado.nombreCliente,
    resumen: cruce.cruceContable,
    sinMapeoContable: cruce.sinMapeoContable,
    sinReglaContableFilas: cruce.sinReglaContableFilas,
    bloqueo: cruce.bloqueo,
    avisoBalance: cruce.avisoBalance,
    balanceFuente: balanceEmparejado
      ? {
          id: balanceEmparejado.id,
          version: balanceEmparejado.version,
          periodoInicio: balanceEmparejado.periodoInicio,
          periodoFin: balanceEmparejado.periodoFin,
          esOficial: balanceEmparejado.esOficial,
          estaCongelado: balanceEmparejado.estaCongelado,
          descripcion: balanceEmparejado.descripcion,
        }
      : null,
    filasMarcadas: cruce.filasMarcadas,
    // Marcas de cuenta del período cuyo renglón ya no aparece: se pueden pasar al renglón actual.
    marcasSinRenglon: cruce.cruceContable
      ? cruce.marcas.filter((m) => !cruce.filasMarcadas.some((f) => f.cuenta4 === m.cuenta4))
      : [],
    resumenMarcas: cruce.resumenMarcas,
    toleranciaCedula: cruce.toleranciaCedula,
    detalleContablePorCuenta: cruce.detalleContablePorCuenta,
    detalleSinCuenta: cruce.detalleSinCuenta,
    fueraDelModulo: cruce.fueraDelModulo,
    soloVisibles: cruce.soloVisibles,
    cedulaActivos: cruce.cedulaActivos,
    sinEmparejarActivos: cruce.sinEmparejarActivos,
    depreciacionSinActivo: cruce.depreciacionSinActivo,
    controlMarcado: cruce.controlMarcado,
    resumenMarcasControl: cruce.resumenMarcasControl,
    toleranciaDetalleActivos: cruce.toleranciaDetalleActivos,
    avisoContenidoActivos: cruce.avisoContenidoActivos,
    conciliacion: cierreVm,
    nomina: cruce.nomina,
    cuentasPeriodo: cruce.cuentasPeriodo,
  };

  // Fecha de corte y divisa del cargue (Cartera, CxP): contra la fecha se miden días y edades.
  const fechaCorte = encabezado.fechaCorte ? fechaCalendarioISO(encabezado.fechaCorte) : finDePeriodo(encabezado.periodo);
  const monedasCargue = [...new Set(
    detalles
      .map((d) => (d.datos as Record<string, unknown> | null)?.[CLAVE_MONEDA])
      .filter((m): m is string => typeof m === "string"),
  )].sort();
  const cruceTerceroVm: CruceTerceroVm = {
    aplica: descriptor.crucePorTercero.habilitado,
    periodo: encabezado.periodo,
    nombreCliente: encabezado.nombreCliente,
    estado: cruceTercero?.estado ?? "sin_balance",
    mensaje: cruceTercero?.mensaje ?? null,
    avisoBalance: cruce.avisoBalance,
    balance: balanceEmparejado
      ? {
          id: balanceEmparejado.id,
          version: balanceEmparejado.version,
          periodoFin: balanceEmparejado.periodoFin,
          esOficial: balanceEmparejado.esOficial,
          estaCongelado: balanceEmparejado.estaCongelado,
          descripcion: balanceEmparejado.descripcion,
        }
      : null,
    balanceTercero: cruceTercero?.balanceTercero ?? null,
    resumen: cruceTercero?.resumen ?? null,
    resumenMarcas: cruceTercero?.resumenMarcas ?? null,
    emparejamientos: cruceTercero?.emparejamientos ?? [],
    umbralDescuadre: cruceTercero?.umbralDescuadre ?? 0,
    parametros: descriptor.crucePorTercero.detalleTercero
      ? {
          fechaCorte,
          fechaCorteDeclarada: encabezado.fechaCorte != null,
          trmCierre: encabezado.trmCierre == null ? null : Number(encabezado.trmCierre),
          monedas: monedasCargue,
        }
      : null,
    contableExcluidoFilas: cruceTercero?.contableExcluidoFilas ?? 0,
    contableNoModular: cruceTercero?.contableNoModular ?? { total: 0, filas: 0, cuentas: [] },
    moduloDerivadoDelDetalle: cruceTercero?.moduloDerivadoDelDetalle ?? false,
    moduloNoAtribuido: cruceTercero?.moduloNoAtribuido ?? 0,
    alcance: cruceTercero?.alcance ?? null,
    listaDelCierre: cierreRow?.estado === ESTADO_CIERRE_FIRME,
    // Filtros de cuentas del módulo, con regreso a esta pestaña y el panel de cuentas abierto.
    enlaceCuentasModulo: administrarCuentasAuth.ok
      ? {
          href: `/config/prevalidador/${moduloCodigo.toLowerCase()}?volver=${encodeURIComponent(`/modulos/${moduloCodigo.toLowerCase()}/${encabezado.id}?tab=cruceTercero&panel=cuentas`)}`,
          modulo: descriptor.label,
        }
      : null,
    abrirPanelCuentas: query.panel === "cuentas",
    ...etiquetasCruceTercero(descriptor),
  };

  // Cartera y CxP: validaciones del auxiliar por tercero, recalculadas al leer sobre el detalle
  // y el cruce recién construidos (edades vs total, documentos repetidos, claves, naturaleza).
  const novedadesBase: NovedadesVm = {
    ...novedades,
    comentariosAlertas: alertasComentario,
    activos: validacionesActivos,
    // Comenta el staff, el senior o el gerente asignados; con la conciliación en firme, nadie.
    puedeComentarAlertas: comentarAuth?.ok === true && !edicion.enFirme,
  };
  const novedadesVm: NovedadesVm = descriptor.nomina
    ? {
        ...novedadesBase,
        // Nómina: netos por fila, conceptos sin cuenta / con varias cuentas, deducciones de control,
        // cédulas con varios nombres y meses del archivo, sobre el mismo consolidado del cruce.
        nomina: validarNominaConNovedades({
          porFila: await novedadesFilaNominaDelCargue(encabezadoId),
          renglones: cruce.nomina?.renglones ?? consolidadoNomina?.renglones ?? [],
        }),
      }
    : descriptor.crucePorTercero.detalleTercero
    ? {
        ...novedadesBase,
        tercero: validacionesTercero,
      }
    : novedadesBase;

  // Columnas de la tabla de detalle: las del descriptor más, cuando el archivo las trajo,
  // una por cada rango de vencimiento. Ver `columnas-cartera.ts`.
  const columnasDeLaTabla = columnasDetalleModulo(descriptor, encabezado.rangosEdades);
  // La pestaña «Detalle» pide sus filas por páginas: al navegador solo viajan el conteo y qué
  // columnas trae el archivo (antes iban las 124.957 filas del cargue, 74 MB).
  const [totalFilasDetalle, columnasConDatos] = await Promise.all([
    conteoDetalleCargue(encabezadoId),
    columnasConDatosCargue(encabezadoId, columnasDeLaTabla),
  ]);
  const claveColumnaTabla = (c: (typeof columnasDeLaTabla)[number]) => (c.familia ? `${c.familia.clave}.${c.familia.etiqueta}` : c.nombre);
  const columnasVisiblesTabla = columnasDeLaTabla.filter((c) => c.esValor === true || c.nombre === descriptor.clasificador || columnasConDatos.has(claveColumnaTabla(c)));

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
        moduloLabel={descriptor.label}
        encabezadoId={encabezado.id}
        comentarios={comentariosPorAncla}
        clienteId={encabezado.clienteId}
        total={Number(encabezado.total)}
        columnas={columnasDeLaTabla}
        clasificadorEtiqueta={descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiqueta ?? "Clasificador"}
        clasificadorEtiquetaPlural={descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiquetaPlural ?? null}
        totalFilasDetalle={totalFilasDetalle}
        columnasVisiblesDetalle={columnasVisiblesTabla}
        consolidado={consolidadoVm}
        cruceContable={cruceContableVm}
        cruceTercero={cruceTerceroVm}
        marcasPeriodo={marcasPeriodo}
        novedades={novedadesVm}
        cuentas={cuentasModulo.map((s) => ({ codigo: s.codigo, nombre: s.nombre }))}
        cuentasPeriodo={cuentasPeriodoVm}
        nivelCruce={nivel}
        homologacionCliente={homologacionPorSubgrupo}
        resolucionCliente={resolucionCliente}
        agrupadores={agrupadoresVm}
        agruparPorNomina={descriptor.consolidado && agruparPorConDatos
          ? {
              actual: agruparPor,
              etiqueta: etiquetaAgruparPor(agruparPor),
              etiquetaPlural: etiquetaAgruparPorPlural(agruparPor),
              opciones: descriptor.consolidado.agruparPor.map((o) => {
                // La vigente siempre se ofrece: un cargue sin columna de código agrupa por el
                // nombre que hizo de clasificador y sigue siendo «Código».
                const disponible = o.id === agruparPor || agruparPorConDatos[o.id];
                return { id: o.id, etiqueta: o.etiqueta, disponible, motivo: disponible ? null : `Este cargue no trae ${o.etiqueta.toLocaleLowerCase("es")}.` };
              }),
            }
          : null}
        puedeEditar={edicion.puedeEditar}
        avisoSoloLectura={edicion.aviso}
        versiones={versiones}
        versionActualId={encabezado.id}
        tabInicial={query.tab === "versiones" ? "versiones" : query.tab === "cruceTercero" && descriptor.crucePorTercero.habilitado ? "cruceTercero" : null}
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
