import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { CODIGOS_ERP_BASE } from "../src/lib/erp-procesos";
import { resolverErp, type CatalogoRef } from "../src/lib/import/erp-sector-alias";
import { leerErpsClientesExcel } from "../src/lib/import/erps-clientes-workbook";
import { claveNit, nucleoNit } from "../src/lib/nit";

type CodigoBase = (typeof CODIGOS_ERP_BASE)[number];

function argumentos(argv: string[]): { archivo: string; aplicar: boolean } {
  const aplicar = argv.includes("--aplicar");
  const archivo = argv.find((valor) => !valor.startsWith("--"));
  if (!archivo || argv.some((valor) => valor.startsWith("--") && valor !== "--aplicar")) {
    throw new Error("Uso: npx tsx scripts/importar-erps-clientes-por-nit.ts <archivo.xlsx> [--aplicar]");
  }
  return { archivo: resolve(archivo), aplicar };
}

const { archivo, aplicar } = argumentos(process.argv.slice(2));
const bytes = readFileSync(archivo);
const huella = createHash("sha256").update(bytes).digest("hex");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está definida.");

  const lectura = await leerErpsClientesExcel(bytes);
  const nitsExcel = new Map<string, number>();
  const nucleosExcel = new Map<string, number>();
  for (const fila of lectura.filas) {
    const nit = claveNit(fila.nit);
    const nucleo = nucleoNit(fila.nit);
    if (!nit) throw new Error(`NIT inválido en la fila ${fila.fila}: ${fila.nit}`);
    const repetida = nitsExcel.get(nit);
    if (repetida) throw new Error(`NIT duplicado en filas ${repetida} y ${fila.fila}: ${fila.nit}`);
    const mismoNucleo = nucleosExcel.get(nucleo);
    if (mismoNucleo) {
      throw new Error(`NIT duplicado por núcleo en filas ${mismoNucleo} y ${fila.fila}: ${fila.nit}`);
    }
    nitsExcel.set(nit, fila.fila);
    nucleosExcel.set(nucleo, fila.fila);
  }

  const [clientes, procesos, erpsCatalogo] = await Promise.all([
    prisma.client.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        nit: true,
        erp: { select: { id: true, code: true, name: true } },
        erpsPorProceso: {
          where: { process: { code: { in: [...CODIGOS_ERP_BASE] } } },
          select: {
            process: { select: { code: true } },
            erp: { select: { code: true, name: true } },
            status: true,
            source: true,
          },
        },
      },
    }),
    prisma.erpProcess.findMany({
      where: { active: true, code: { in: [...CODIGOS_ERP_BASE] } },
      select: { id: true, code: true },
    }),
    prisma.erp.findMany({ select: { id: true, code: true, name: true, active: true } }),
  ]);

  const procesoId = new Map(procesos.map((proceso) => [proceso.code, proceso.id]));
  if (CODIGOS_ERP_BASE.some((codigo) => !procesoId.has(codigo))) {
    throw new Error("El catálogo activo de procesos no contiene CONT, NOM e INV.");
  }

  const clientesPorNit = new Map<string, typeof clientes>();
  const clientesPorNucleo = new Map<string, typeof clientes>();
  for (const cliente of clientes) {
    const nit = claveNit(cliente.nit);
    const lista = clientesPorNit.get(nit) ?? [];
    lista.push(cliente);
    clientesPorNit.set(nit, lista);
    const nucleo = nucleoNit(cliente.nit);
    const listaNucleo = clientesPorNucleo.get(nucleo) ?? [];
    listaNucleo.push(cliente);
    clientesPorNucleo.set(nucleo, listaNucleo);
  }

  const faltantes: string[] = [];
  const ambiguos: string[] = [];
  const resueltas = lectura.filas.flatMap((fila) => {
    const nit = claveNit(fila.nit);
    const exactas = clientesPorNit.get(nit) ?? [];
    const coincidencias = exactas.length > 0
      ? exactas
      : (clientesPorNucleo.get(nucleoNit(fila.nit)) ?? []);
    if (coincidencias.length === 0) {
      faltantes.push(`${fila.fila}:${fila.nit}`);
      return [];
    }
    if (coincidencias.length > 1) {
      ambiguos.push(`${fila.fila}:${fila.nit}`);
      return [];
    }
    const erps = Object.fromEntries(
      CODIGOS_ERP_BASE.map((codigo) => [
        codigo,
        fila.erps[codigo] == null ? null : resolverErp(fila.erps[codigo]!),
      ]),
    ) as Record<CodigoBase, CatalogoRef | null>;
    return [{ fila, cliente: coincidencias[0], erps }];
  });

  if (faltantes.length || ambiguos.length || resueltas.length !== lectura.filas.length) {
    throw new Error(
      `La conciliación por NIT no es uno a uno. Faltantes: ${faltantes.join(", ") || "0"}. Ambiguos: ${ambiguos.join(", ") || "0"}.`,
    );
  }

  const erpObjetivoPorCodigo = new Map<string, CatalogoRef>();
  for (const item of resueltas) {
    for (const erp of Object.values(item.erps)) if (erp) erpObjetivoPorCodigo.set(erp.code, erp);
  }
  const catalogoPorCodigo = new Map(erpsCatalogo.map((erp) => [erp.code, erp]));
  const inactivos = [...erpObjetivoPorCodigo.keys()].filter(
    (codigo) => catalogoPorCodigo.get(codigo)?.active === false,
  );
  if (inactivos.length) {
    throw new Error(`Hay ERP inactivos en el archivo: ${inactivos.join(", ")}. Reactívalos o corrige el archivo.`);
  }

  const resumenProceso = Object.fromEntries(
    CODIGOS_ERP_BASE.map((codigo) => [codigo, { confirmados: 0, pendientes: 0, cambios: 0 }]),
  ) as Record<CodigoBase, { confirmados: number; pendientes: number; cambios: number }>;
  let cambiosLegadoCont = 0;

  for (const item of resueltas) {
    const actualPorCodigo = new Map(item.cliente.erpsPorProceso.map((asignacion) => [asignacion.process.code, asignacion]));
    for (const codigo of CODIGOS_ERP_BASE) {
      const objetivo = item.erps[codigo]?.code ?? null;
      const actual = actualPorCodigo.get(codigo);
      const estadoObjetivo = objetivo == null ? "pendiente" : "confirmado";
      if (objetivo == null) resumenProceso[codigo].pendientes++;
      else resumenProceso[codigo].confirmados++;
      if (
        (actual?.erp?.code ?? null) !== objetivo
        || actual?.status !== estadoObjetivo
        || actual?.source !== "importacion_excel"
      ) resumenProceso[codigo].cambios++;
    }
    if ((item.cliente.erp?.code ?? null) !== (item.erps.CONT?.code ?? null)) cambiosLegadoCont++;
  }

  console.log(`Archivo: ${archivo}`);
  console.log(`Hoja: ${lectura.hoja} · encabezado: fila ${lectura.filaEncabezado}`);
  console.log(`SHA-256: ${huella}`);
  console.log(`Clientes leídos y conciliados por NIT: ${resueltas.length}`);
  for (const codigo of CODIGOS_ERP_BASE) {
    const r = resumenProceso[codigo];
    console.log(`${codigo}: ${r.confirmados} confirmados · ${r.pendientes} pendientes · ${r.cambios} filas por actualizar`);
  }
  const nuevosErp = [...erpObjetivoPorCodigo.keys()].filter((codigo) => !catalogoPorCodigo.has(codigo));
  console.log(`ERP nuevos por crear: ${nuevosErp.length ? nuevosErp.join(", ") : "ninguno"}`);
  console.log(`ERP contable legado por sincronizar: ${cambiosLegadoCont}`);

  const aba = resueltas.find((item) => nucleoNit(item.fila.nit) === "901603550");
  if (aba) {
    console.log(
      `ABA TECH S.A.S.: CONT=${aba.erps.CONT?.name ?? "Pendiente"} · NOM=${aba.erps.NOM?.name ?? "Pendiente"} · INV=${aba.erps.INV?.name ?? "Pendiente"}`,
    );
  }

  if (!aplicar) {
    console.log("DRY-RUN: no se modificó la base de datos. Repite con --aplicar para confirmar.");
    return;
  }

  const totalCambios = CODIGOS_ERP_BASE.reduce(
    (total, codigo) => total + resumenProceso[codigo].cambios,
    0,
  );
  if (totalCambios === 0 && cambiosLegadoCont === 0 && nuevosErp.length === 0) {
    console.log("SIN CAMBIOS: la base ya coincide con el archivo; no se escribieron filas ni auditoría.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const erpIdPorCodigo = new Map<string, number>();
    for (const erp of erpObjetivoPorCodigo.values()) {
      const registro = await tx.erp.upsert({
        where: { code: erp.code },
        create: { code: erp.code, name: erp.name },
        update: {},
      });
      erpIdPorCodigo.set(erp.code, registro.id);
    }

    for (const item of resueltas) {
      for (const codigo of CODIGOS_ERP_BASE) {
        const objetivo = item.erps[codigo];
        const erpId = objetivo ? erpIdPorCodigo.get(objetivo.code)! : null;
        await tx.clientErpProcess.upsert({
          where: {
            clientId_processId: {
              clientId: item.cliente.id,
              processId: procesoId.get(codigo)!,
            },
          },
          create: {
            clientId: item.cliente.id,
            processId: procesoId.get(codigo)!,
            erpId,
            status: erpId == null ? "pendiente" : "confirmado",
            source: "importacion_excel",
          },
          update: {
            erpId,
            status: erpId == null ? "pendiente" : "confirmado",
            source: "importacion_excel",
          },
        });
      }
      const erpContable = item.erps.CONT;
      await tx.client.update({
        where: { id: item.cliente.id },
        data: { erpId: erpContable ? erpIdPorCodigo.get(erpContable.code)! : null },
      });
    }

    await tx.auditEntry.create({
      data: {
        user: "Sistema",
        action: "IMPORTÓ ERP POR PROCESO",
        entity: "clientes",
        detail: `archivo ${archivo} · sha256 ${huella} · clientes ${resueltas.length} · CONT/NOM/INV por NIT · N/A y vacíos como pendiente`,
      },
    });
  }, { isolationLevel: "Serializable", maxWait: 15_000, timeout: 120_000 });

  console.log(`APLICADO: ${resueltas.length} clientes sincronizados en CONT, NOM e INV.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
