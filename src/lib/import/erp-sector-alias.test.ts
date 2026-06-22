import { test, expect } from "vitest";
import { resolverErp, resolverSector } from "./erp-sector-alias";

test("resolverErp fusiona variantes de un mismo ERP", () => {
  expect(resolverErp("SIESA")?.code).toBe("SIESA");
  expect(resolverErp("Siesa")?.code).toBe("SIESA");
  expect(resolverErp("SIESA (Enterprise/ERP)")?.code).toBe("SIESA");
  expect(resolverErp(" Ofimática ")?.code).toBe("OFIMATICA");
  expect(resolverErp("OFFIMATICA")?.code).toBe("OFIMATICA");
  expect(resolverErp("CNT")?.code).toBe("CONTAI");
});

test("resolverErp crea entrada tolerante para ERP desconocido", () => {
  const r = resolverErp("Nuevo ERP 2.0");
  expect(r?.code).toBe("NUEVOERP20"); // mayúsculas, sin espacios ni símbolos
  expect(r?.name).toBe("Nuevo ERP 2.0"); // conserva el texto original
});

test("resolverErp devuelve null cuando está vacío (ERP opcional)", () => {
  expect(resolverErp("")).toBeNull();
  expect(resolverErp("   ")).toBeNull();
});

test("resolverSector parte «N-Nombre» en código + nombre", () => {
  expect(resolverSector("15-ESAL")).toEqual({ code: "15", name: "ESAL" });
  expect(resolverSector("5-Comercio y Distribución")).toEqual({
    code: "5",
    name: "Comercio y Distribución",
  });
});

test("resolverSector devuelve null cuando está vacío (sector opcional)", () => {
  expect(resolverSector("")).toBeNull();
  expect(resolverSector("   ")).toBeNull();
});

test("resolverSector sin número usa slug del nombre", () => {
  expect(resolverSector("Comercio")).toEqual({ code: "COMERCIO", name: "Comercio" });
});
