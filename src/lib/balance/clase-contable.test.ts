import { describe, expect, it } from "vitest";
import { claseContable, cruzaClaseContable } from "./clase-contable";

describe("claseContable", () => {
  it("toma el primer dígito del código", () => {
    expect(claseContable("14059805")).toBe("1");
    expect(claseContable("799505")).toBe("7");
    expect(claseContable(" 5120 ")).toBe("5");
  });

  it("devuelve cadena vacía sin código", () => {
    expect(claseContable("")).toBe("");
    expect(claseContable(null)).toBe("");
    expect(claseContable(undefined)).toBe("");
  });
});

describe("cruzaClaseContable", () => {
  // Novedad de operación (QUIFARMA S.A.S., balance 183): cinco auxiliares de
  // inventarios homologadas a la cuenta de cierre de costos, que sacaron
  // $4.159.857.241,71 del grupo 14.
  it("detecta el caso reportado: inventarios homologados a cierre de costos", () => {
    expect(cruzaClaseContable("14059805", "799505")).toBe(true);
    expect(cruzaClaseContable("14309805", "799505")).toBe(true);
  });

  it("detecta los cruces por nombre idéntico entre gasto y activo", () => {
    // La depreciación de construcciones (gasto) no es el activo depreciado.
    expect(cruzaClaseContable("51201005", "151605")).toBe(true);
    // Un costo indirecto de producción no es una cuenta por pagar.
    expect(cruzaClaseContable("73103505", "233530")).toBe(true);
  });

  it("acepta la homologación dentro de la misma clase aunque cambie de grupo", () => {
    expect(cruzaClaseContable("14059805", "140505")).toBe(false);
    expect(cruzaClaseContable("73353005", "730505")).toBe(false);
    expect(cruzaClaseContable("11051014", "110510")).toBe(false);
  });

  it("no juzga cuando falta alguno de los dos códigos", () => {
    expect(cruzaClaseContable("14059805", null)).toBe(false);
    expect(cruzaClaseContable("14059805", "")).toBe(false);
    expect(cruzaClaseContable(null, "799505")).toBe(false);
  });
});
