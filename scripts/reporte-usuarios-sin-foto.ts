/**
 * Reporte one-shot: usuarios sin foto de perfil (clave_foto nula).
 * La carga masiva empareja fotos por cédula; si no hay coincidencia, el perfil
 * queda sin foto.
 *
 * Uso: npx tsx scripts/reporte-usuarios-sin-foto.ts
 */
import "dotenv/config";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import prisma from "../src/lib/prisma";

type Fila = {
  id: number;
  name: string;
  email: string;
  cedula: string | null;
  cargo: string | null;
  role: string;
  active: boolean;
  initials: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

function motivo(u: Fila): string {
  if (!u.cedula || !u.cedula.trim()) {
    return "Sin cédula en el perfil: no es posible emparejar con fotos nombradas por documento";
  }
  return "Con cédula pero sin foto asignada: no hubo coincidencia con las fotos enviadas (o no se cargó imagen para ese documento)";
}

function categoria(u: Fila): string {
  if (!u.cedula || !u.cedula.trim()) return "Sin documento de identidad";
  return "Documento sin coincidencia de foto";
}

async function main() {
  const [total, conFoto, sinFoto] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { avatarKey: { not: null } } }),
    prisma.user.count({ where: { avatarKey: null } }),
  ]);

  const filas = await prisma.user.findMany({
    where: { avatarKey: null },
    select: {
      id: true,
      name: true,
      email: true,
      cedula: true,
      cargo: true,
      role: true,
      active: true,
      initials: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const sinCedula = filas.filter((u) => !u.cedula?.trim());
  const conCedulaSinFoto = filas.filter((u) => !!u.cedula?.trim());

  const outDir = path.join(process.cwd(), "output");
  await mkdir(outDir, { recursive: true });
  const fecha = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `usuarios-sin-foto-perfil_${fecha}.xlsx`);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell LFM";
  wb.created = new Date();

  // --- Resumen ---
  const wsResumen = wb.addWorksheet("Resumen", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  wsResumen.columns = [
    { header: "Métrica", key: "metrica", width: 55 },
    { header: "Valor", key: "valor", width: 18 },
  ];
  wsResumen.getRow(1).font = { bold: true };
  wsResumen.addRows([
    { metrica: "Total usuarios", valor: total },
    { metrica: "Con foto asignada (clave_foto)", valor: conFoto },
    { metrica: "Sin foto asignada", valor: sinFoto },
    {
      metrica: "Sin foto · con cédula (documento sin coincidencia de foto)",
      valor: conCedulaSinFoto.length,
    },
    {
      metrica: "Sin foto · sin cédula (no se puede emparejar por documento)",
      valor: sinCedula.length,
    },
    { metrica: "Fecha del reporte", valor: fecha },
  ]);

  // --- Detalle principal: los que tienen cédula pero no foto ---
  const wsMatch = wb.addWorksheet("Documento sin coincidencia", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  escribirDetalle(wsMatch, conCedulaSinFoto);

  // --- Sin cédula ---
  const wsSinDoc = wb.addWorksheet("Sin documento", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  escribirDetalle(wsSinDoc, sinCedula);

  // --- Todos sin foto ---
  const wsTodos = wb.addWorksheet("Todos sin foto", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  escribirDetalle(wsTodos, filas);

  await wb.xlsx.writeFile(outPath);

  console.log(
    JSON.stringify(
      {
        total,
        conFoto,
        sinFoto,
        conCedulaSinFoto: conCedulaSinFoto.length,
        sinCedula: sinCedula.length,
        archivo: outPath,
      },
      null,
      2,
    ),
  );
}

function escribirDetalle(ws: ExcelJS.Worksheet, filas: Fila[]) {
  ws.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Nombre", key: "nombre", width: 32 },
    { header: "Correo", key: "correo", width: 36 },
    { header: "Cédula / documento", key: "cedula", width: 18 },
    { header: "Cargo", key: "cargo", width: 28 },
    { header: "Rol", key: "rol", width: 20 },
    { header: "Activo", key: "activo", width: 10 },
    { header: "Iniciales", key: "iniciales", width: 10 },
    { header: "Categoría", key: "categoria", width: 32 },
    { header: "Motivo", key: "motivo", width: 80 },
    { header: "Último inicio de sesión", key: "ultimoLogin", width: 22 },
    { header: "Creado en", key: "creado", width: 22 },
    { header: "Actualizado en", key: "actualizado", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF5" },
  };

  for (const u of filas) {
    ws.addRow({
      id: u.id,
      nombre: u.name,
      correo: u.email,
      cedula: u.cedula ?? "",
      cargo: u.cargo ?? "",
      rol: u.role,
      activo: u.active ? "Sí" : "No",
      iniciales: u.initials,
      categoria: categoria(u),
      motivo: motivo(u),
      ultimoLogin: u.lastLoginAt ? u.lastLoginAt.toISOString() : "",
      creado: u.createdAt.toISOString(),
      actualizado: u.updatedAt.toISOString(),
    });
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columnCount },
  };
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
