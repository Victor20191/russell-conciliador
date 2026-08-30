import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import { crearExportacionPuc, etiquetaOrigen, type DatosExportacionPuc } from "./puc";

const DATOS: DatosExportacionPuc = {
  cliente: "El Zarzal S.A",
  clienteNit: "800123456-7",
  estandar: [
    {
      code: "110505",
      name: "Caja general",
      level: 6,
      nature: "Débito",
      parent: "1105",
      critical: true,
      russellAccount: "1105",
      categoryType: "Efectivo",
      includes: "Billetes y monedas",
      excludes: "Cheques posfechados",
      possibleAccounts: "1105xx",
      supportingDocuments: "Arqueo de caja",
      controlSupports: "Acta de arqueo",
      mappingNotes: null,
    },
    {
      code: "413550",
      name: "Comercio al por mayor",
      level: 6,
      nature: "Crédito",
      parent: "4135",
      critical: false,
      russellAccount: null,
      categoryType: null,
      includes: null,
      excludes: null,
      possibleAccounts: null,
      supportingDocuments: null,
      controlSupports: null,
      mappingNotes: "Revisar devoluciones",
    },
  ],
  pucCliente: [
    {
      code: "11050501",
      name: "Caja menor sede norte",
      level: 8,
      cuenta6Russell: "110505",
      nombreRussell: "Caja general",
      coincidencia: 100,
      origenMapeo: "manual_cuenta",
    },
    {
      code: "13050501",
      name: "Clientes nacionales",
      level: 8,
      cuenta6Russell: null,
      nombreRussell: null,
      coincidencia: null,
      origenMapeo: null,
    },
  ],
  mapeoCliente: [
    {
      cuenta6: "110505",
      nombreCuenta: "Caja",
      nivel: 6,
      cuenta6Russell: "110505",
      nombreRussell: "Caja general",
      coincidencia: 98,
      origen: "manual",
      actualizadoPor: "Staff Uno",
      actualizadoEn: "2026-08-01T15:00:00.000Z",
    },
    {
      cuenta6: "4135",
      nombreCuenta: "Comercio",
      nivel: 4,
      cuenta6Russell: "",
      nombreRussell: null,
      coincidencia: null,
      origen: null,
      actualizadoPor: null,
      actualizadoEn: null,
    },
  ],
  subgrupos: [
    { codigo: "1105", nombre: "Caja", grupo: "11", nombreGrupo: "Disponible", naturaleza: "Débito" },
  ],
};

async function abrir(datos: DatosExportacionPuc): Promise<ExcelJS.Workbook> {
  const buffer = await crearExportacionPuc(datos, new Date("2026-08-30T12:00:00.000Z"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

test("el libro trae las cuatro pestañas del PUC más el resumen", async () => {
  const wb = await abrir(DATOS);
  expect(wb.worksheets.map((w) => w.name)).toEqual([
    "Resumen",
    "Plan estándar",
    "PUC cliente",
    "Mapeo cliente",
    "Subgrupos",
  ]);
});

test("cada hoja lista TODAS sus filas bajo su encabezado", async () => {
  const wb = await abrir(DATOS);

  const std = wb.getWorksheet("Plan estándar")!;
  expect(std.getRow(1).getCell(1).value).toBe("Código");
  expect(std.getRow(2).getCell(1).value).toBe("110505");
  expect(std.getRow(3).getCell(1).value).toBe("413550");
  expect(std.rowCount).toBe(1 + DATOS.estandar.length);

  const puc = wb.getWorksheet("PUC cliente")!;
  expect(puc.getRow(2).getCell(1).value).toBe("11050501");
  expect(puc.rowCount).toBe(1 + DATOS.pucCliente.length);

  const mapeo = wb.getWorksheet("Mapeo cliente")!;
  expect(mapeo.getRow(2).getCell(1).value).toBe("110505");
  expect(mapeo.rowCount).toBe(1 + DATOS.mapeoCliente.length);

  const sub = wb.getWorksheet("Subgrupos")!;
  expect(sub.getRow(2).getCell(1).value).toBe("1105");
  expect(sub.rowCount).toBe(1 + DATOS.subgrupos.length);
});

test("los vacíos salen como «—» y el origen se traduce a su etiqueta", async () => {
  const wb = await abrir(DATOS);

  const puc = wb.getWorksheet("PUC cliente")!;
  // Fila 3: cuenta sin homologar → cuenta Russell, nombre y coincidencia vacíos.
  expect(puc.getRow(3).getCell(4).value).toBe("—");
  expect(puc.getRow(3).getCell(5).value).toBe("—");
  expect(puc.getRow(3).getCell(6).value).toBe("—");
  expect(puc.getRow(3).getCell(7).value).toBe("Sin asignar");
  expect(puc.getRow(2).getCell(7).value).toBe("Manual (solo esta cuenta)");

  const mapeo = wb.getWorksheet("Mapeo cliente")!;
  expect(mapeo.getRow(2).getCell(7).value).toBe("Manual (grupo)");
  expect(mapeo.getRow(3).getCell(4).value).toBe("—"); // cuenta6Russell = ""
  expect(mapeo.getRow(3).getCell(8).value).toBe("—"); // nunca la tocó nadie
  expect(mapeo.getRow(3).getCell(9).value).toBe("—");
});

test("el resumen cuenta las filas de cada PUC y las reglas manuales", async () => {
  const wb = await abrir(DATOS);
  const ws = wb.getWorksheet("Resumen")!;
  const filas = new Map<string, unknown>();
  ws.eachRow((row) => filas.set(String(row.getCell(1).value ?? ""), row.getCell(2).value));

  expect(filas.get("Cliente")).toBe("El Zarzal S.A");
  expect(filas.get("NIT")).toBe("800123456-7");
  expect(filas.get("  Plan estándar Russell (cuentas)")).toBe(2);
  expect(filas.get("  PUC del cliente (cuentas)")).toBe(2);
  expect(filas.get("  · homologadas a cuenta Russell")).toBe(1);
  expect(filas.get("  Memoria de mapeo (reglas)")).toBe(2);
  expect(filas.get("  · fijadas a mano")).toBe(1);
  expect(filas.get("  Subgrupos nivel 4")).toBe(1);
});

test("sin cliente el libro conserva sus hojas y explica por qué están vacías", async () => {
  const wb = await abrir({
    cliente: null,
    clienteNit: null,
    estandar: DATOS.estandar,
    pucCliente: [],
    mapeoCliente: [],
    subgrupos: DATOS.subgrupos,
  });

  expect(wb.worksheets).toHaveLength(5);
  const puc = wb.getWorksheet("PUC cliente")!;
  expect(puc.rowCount).toBe(2); // encabezado + nota
  expect(String(puc.getRow(2).getCell(1).value)).toContain("no hay PUC de cliente");
  expect(wb.getWorksheet("Resumen")!.getRow(3).getCell(2).value).toBe("Sin cliente seleccionado");
});

test("etiquetaOrigen cubre los tres orígenes de `cuentas_cliente`", () => {
  expect(etiquetaOrigen("manual").label).toBe("Manual (grupo)");
  expect(etiquetaOrigen("manual_cuenta").label).toBe("Manual (solo esta cuenta)");
  expect(etiquetaOrigen("automatico").label).toBe("Automático");
  expect(etiquetaOrigen(null).label).toBe("Sin asignar");
});
