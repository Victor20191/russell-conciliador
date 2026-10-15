// ============================================================
// COPIA CONGELADA para las conciliaciones de módulo que ya estaban EN FIRME antes del 14/Oct/2026
// (migración 20261014120000_copia_congelada_cierre_modulo).
//
// Desde ese día, al cerrar una conciliación se guarda en `conciliacion_modulo_cierre.copia_congelada`
// lo que el cruce evaluó y que se comparte entre meses (el Consolidado ya fundido con el período, las
// reglas del prevalidador del módulo, las clases por centro y la homologación de Nómina, las
// agrupadoras excluidas y el umbral del cruce por tercero). Los cierres anteriores no la tienen y su
// cruce sigue leyendo esos insumos EN VIVO: un cambio desde otro mes los altera. Este script les toma
// la copia AHORA (`origen: "respaldo"`).
//
// No puede saber cómo estaban los insumos el día del cierre: congela desde hoy y LISTA las señales
// de que algo cambió después de cerrar (memoria del Consolidado, clases, homologación del cliente,
// reglas del prevalidador, otra versión del balance en el corte), para que un senior revise esas
// conciliaciones —y, si hace falta, las desbloquee y vuelva a cerrar—.
//
//   npx tsx scripts/respaldar-copia-cierres.ts             # simulación (solo lectura)
//   npx tsx scripts/respaldar-copia-cierres.ts --aplicar   # escribe la copia (una transacción por cierre)
//   npx tsx scripts/respaldar-copia-cierres.ts --revertir  # quita las copias de RESPALDO (las del cierre no)
//
// Orden: migración → despliegue del código → este script. `.env` apunta a PRODUCCIÓN.
// ============================================================
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";
import { tomarCandadoTransaccion } from "../src/lib/candados";
import { ESTADO_CIERRE_FIRME } from "../src/lib/conciliacion/cuentas-bloqueo";
import { construirCopiaCierre, leerCopiaCierre } from "../src/lib/conciliacion/copia-cierre";
import { leerConsolidacionDelPeriodo } from "../src/lib/modulos/asignacion-periodo-lectura";
import { leerHomologacionNomina } from "../src/lib/modulos/insumos-periodo-lectura";
import { agruparPorDeEncabezado } from "../src/lib/modulos/nomina/agrupar-por";
import { descriptorModulo } from "../src/lib/modulos/descriptores";
import { cuentasAgrupadorasExcluidas, seleccionarBalanceCruceModulo } from "../src/lib/modulos/compuerta-cruce";
import { leerDatosPrevalidador, resolverContextoPrevalidador } from "../src/lib/balance/prevalidador/contexto";
import { mapearCatalogoPrevalidador } from "../src/lib/balance/prevalidador/catalogo";
import { UMBRALES_ALERTAS_DEFECTO } from "../src/lib/balance/umbrales-alertas";

const APLICAR = process.argv.includes("--aplicar");
const REVERTIR = process.argv.includes("--revertir");
const ACTOR = "Sistema · copia congelada de cierres (14/Oct/2026)";

async function umbralDescuadre(): Promise<number> {
  const fila = await prisma.umbralAlerta.findFirst({ where: { clave: "descuadre" }, select: { valor: true } });
  const n = Number(fila?.valor);
  return Number.isFinite(n) && n >= 0 ? n : UMBRALES_ALERTAS_DEFECTO.descuadre;
}

async function revertir() {
  const cierres = await prisma.conciliacionModuloCierre.findMany({ select: { id: true, clienteId: true, moduloCodigo: true, periodo: true, copiaCongelada: true } });
  const deRespaldo = cierres.filter((c) => {
    const lectura = c.copiaCongelada ? leerCopiaCierre(c.copiaCongelada, c.moduloCodigo) : null;
    return lectura?.ok === true && lectura.copia.origen === "respaldo";
  });
  console.log(`Copias de respaldo: ${deRespaldo.length}${deRespaldo.length ? ` → ${deRespaldo.map((c) => `#${c.id} ${c.moduloCodigo} ${c.periodo}`).join(", ")}` : ""}`);
  if (!APLICAR) {
    console.log("Simulación: no se quitó nada. Corre con --revertir --aplicar para quitarlas.");
    return;
  }
  for (const c of deRespaldo) {
    await prisma.$transaction(async (tx) => {
      await tomarCandadoTransaccion(tx, `conciliacion-cierre:${c.clienteId}:${c.moduloCodigo}:${c.periodo}`);
      // Solo si sigue siendo la copia de respaldo: un cierre posterior la habría reemplazado.
      const actual = await tx.conciliacionModuloCierre.findUnique({ where: { id: c.id }, select: { copiaCongelada: true } });
      const lectura = actual?.copiaCongelada ? leerCopiaCierre(actual.copiaCongelada, c.moduloCodigo) : null;
      if (!(lectura?.ok && lectura.copia.origen === "respaldo")) return;
      await tx.$executeRaw`UPDATE "conciliacion_modulo_cierre" SET "copia_congelada" = NULL WHERE "id" = ${c.id}`;
      await tx.auditEntry.create({
        data: { user: ACTOR, action: "QUITÓ COPIA CONGELADA DE RESPALDO", entity: `${c.moduloCodigo} · ${c.periodo}`, detail: `cierre #${c.id}`, clientId: c.clienteId },
      });
    });
  }
  console.log(`REVERTIDO: ${deRespaldo.length} copia(s) de respaldo quitada(s).`);
}

async function main() {
  console.log(`BD destino: ${new URL(process.env.DATABASE_URL ?? "").hostname} · modo: ${REVERTIR ? "REVERTIR" : ""}${APLICAR ? " APLICAR" : " simulación"}`);
  if (REVERTIR) return revertir();

  const cierres = await prisma.conciliacionModuloCierre.findMany({
    where: { estado: ESTADO_CIERRE_FIRME },
    select: { id: true, clienteId: true, moduloCodigo: true, periodo: true, balanceEncabezadoId: true, moduloDatoEncabezadoId: true, cerradoPor: true, cerradoEn: true, copiaCongelada: true },
    orderBy: { id: "asc" },
  });
  const sinCopia = cierres.filter((c) => c.copiaCongelada == null);
  console.log(`Cierres en firme: ${cierres.length} · sin copia congelada: ${sinCopia.length}`);
  const umbral = await umbralDescuadre();

  let escritas = 0;
  let omitidos = 0;
  for (const c of sinCopia) {
    const descriptor = descriptorModulo(c.moduloCodigo);
    const titulo = `#${c.id} ${c.moduloCodigo} ${c.periodo} (cliente ${c.clienteId}, cargue #${c.moduloDatoEncabezadoId}, cerró ${c.cerradoPor} el ${c.cerradoEn.toISOString().slice(0, 10)})`;
    if (!descriptor) {
      console.log(`  ✗ ${titulo}: módulo no reconocido, se omite.`);
      omitidos += 1;
      continue;
    }
    const esNomina = descriptor.nomina != null;
    const [encabezado, balance] = await Promise.all([
      prisma.moduloDatoEncabezado.findUnique({ where: { id: c.moduloDatoEncabezadoId }, select: { agruparPor: true } }),
      prisma.balancePruebaEncabezado.findUnique({ where: { id: c.balanceEncabezadoId }, select: { id: true } }),
    ]);
    if (!balance) {
      console.log(`  ✗ ${titulo}: el balance conciliado (#${c.balanceEncabezadoId}) ya no existe; su cruce queda bloqueado hasta desbloquear. Se omite.`);
      omitidos += 1;
      continue;
    }
    const agruparPor = agruparPorDeEncabezado(encabezado?.agruparPor ?? null);
    const datosPrevalidador = await leerDatosPrevalidador(prisma, c.balanceEncabezadoId);
    const contexto = resolverContextoPrevalidador(datosPrevalidador);
    if (contexto.prevalidador.estado !== "listo") {
      console.log(`  ✗ ${titulo}: el prevalidador del balance conciliado no está listo (${contexto.prevalidador.estado}); sin él no se saben las agrupadoras. Se omite.`);
      omitidos += 1;
      continue;
    }
    const [consolidacion, nomina] = await Promise.all([
      leerConsolidacionDelPeriodo(prisma, c.clienteId, c.moduloCodigo, c.periodo, esNomina ? agruparPor : undefined),
      esNomina ? leerHomologacionNomina(prisma, c.clienteId, c.moduloCodigo) : Promise.resolve(null),
    ]);
    const copia = construirCopiaCierre({
      origen: "respaldo",
      tomadaEn: new Date(),
      encabezadoId: c.moduloDatoEncabezadoId,
      moduloCodigo: c.moduloCodigo,
      agruparPor: esNomina ? agruparPor : "codigo",
      consolidacion,
      catalogo: mapearCatalogoPrevalidador(datosPrevalidador.catalogoVigente),
      nomina,
      agrupadorasExcluidas: cuentasAgrupadorasExcluidas(contexto.prevalidador),
      umbralDescuadre: descriptor.crucePorTercero.habilitado ? umbral : null,
    });

    // Señales de que algo pudo cambiar después del cierre (no lo prueban: el auditor revisa).
    const [memoria, clases, homologacion, reglas, balancesCorte] = await Promise.all([
      prisma.auditEntry.count({ where: { clientId: c.clienteId, action: "ACTUALIZÓ consolidación de módulo", detail: { contains: c.moduloCodigo }, createdAt: { gt: c.cerradoEn } } }),
      esNomina ? prisma.claseAgrupadorModulo.count({ where: { clienteId: c.clienteId, moduloCodigo: c.moduloCodigo, actualizadoEn: { gt: c.cerradoEn } } }) : Promise.resolve(0),
      esNomina ? prisma.clientAccount.count({ where: { clienteId: c.clienteId, actualizadoEn: { gt: c.cerradoEn } } }) : Promise.resolve(0),
      prisma.prevalidadorCuenta.count({ where: { module: { code: c.moduloCodigo }, actualizadoEn: { gt: c.cerradoEn } } }),
      prisma.balancePruebaEncabezado.findMany({
        where: { clienteId: c.clienteId },
        select: { id: true, periodoInicio: true, periodoFin: true, esOficial: true, estaCongelado: true },
        orderBy: [{ esOficial: "desc" }, { periodoFin: "desc" }, { id: "desc" }],
      }),
    ]);
    const vivo = seleccionarBalanceCruceModulo(balancesCorte, c.periodo);
    const senales = [
      memoria > 0 ? `${memoria} guardado(s) del Consolidado del cliente después de cerrar` : null,
      clases > 0 ? `${clases} clase(s) por centro cambiada(s)` : null,
      homologacion > 0 ? `${homologacion} homologación(es) del cliente cambiada(s)` : null,
      reglas > 0 ? `${reglas} regla(s) del prevalidador del módulo cambiada(s)` : null,
      vivo && vivo.id !== c.balanceEncabezadoId ? `hoy el cruce elegiría otro balance (#${vivo.id}); queda fijado al conciliado (#${c.balanceEncabezadoId})` : null,
    ].filter(Boolean);
    const tamano = Buffer.byteLength(JSON.stringify(copia));
    console.log(`  ${senales.length ? "⚠" : "✓"} ${titulo}: ${consolidacion.filas.length} fila(s) del Consolidado · ${copia.catalogo.length} regla(s)${nomina ? ` · ${nomina.reglasClase.size} clase(s), ${nomina.mapeoCliente.size} cuenta(s) homologada(s)` : ""} · ${copia.agrupadorasExcluidas.length} agrupadora(s) · ${(tamano / 1024).toFixed(1)} KB${senales.length ? `\n      revisar: ${senales.join("; ")}` : ""}`);

    if (!APLICAR) continue;
    const escrita = await prisma.$transaction(async (tx) => {
      await tomarCandadoTransaccion(tx, `conciliacion-cierre:${c.clienteId}:${c.moduloCodigo}:${c.periodo}`);
      // Idempotente: solo si sigue en firme y sin copia (un desbloqueo o un cierre nuevo la cambian).
      const actual = await tx.conciliacionModuloCierre.findUnique({ where: { id: c.id }, select: { estado: true, copiaCongelada: true } });
      if (!actual || actual.estado !== ESTADO_CIERRE_FIRME || actual.copiaCongelada != null) return false;
      await tx.conciliacionModuloCierre.update({ where: { id: c.id }, data: { copiaCongelada: copia as unknown as Prisma.InputJsonValue } });
      await tx.auditEntry.create({
        data: {
          user: ACTOR,
          action: "RESPALDÓ COPIA CONGELADA DE CIERRE",
          entity: `${c.moduloCodigo} · ${c.periodo}`,
          detail: `cierre #${c.id} · cargue #${c.moduloDatoEncabezadoId} · huella ${copia.huella.slice(0, 12)}${senales.length ? ` · revisar: ${senales.join("; ")}` : ""}`,
          clientId: c.clienteId,
        },
      });
      return true;
    }, { timeout: 60_000, maxWait: 30_000 });
    if (escrita) escritas += 1;
  }

  console.log(APLICAR
    ? `APLICADO: ${escritas} copia(s) de respaldo escrita(s) · ${omitidos} cierre(s) omitido(s). Envía la lista «revisar» a los seniors.`
    : `Simulación: no se escribió nada (${omitidos} cierre(s) se omitirían). Corre con --aplicar para escribir.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
