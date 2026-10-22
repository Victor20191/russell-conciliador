import { describe, expect, it } from "vitest";
import { motivoSubgrupoEnUso, type UsoSubgrupo } from "./subgrupo-en-uso";

const libre: UsoSubgrupo = { balances: false, memoriaModulos: false, filtrosModulos: false };

describe("motivoSubgrupoEnUso", () => {
  it("una cuenta sin uso se puede cambiar o eliminar", () => {
    expect(motivoSubgrupoEnUso("1105", libre, "eliminar")).toBeNull();
  });

  it("dice en qué está en uso", () => {
    expect(motivoSubgrupoEnUso("1435", { ...libre, balances: true }, "cambiar el código de")).toBe(
      "No puedes cambiar el código de la cuenta 1435: tiene balances de clientes homologados a sus subcuentas. Hacerlo rompería esas referencias.",
    );
    expect(motivoSubgrupoEnUso("1516", { balances: true, memoriaModulos: true, filtrosModulos: true }, "eliminar")).toContain(
      "tiene balances de clientes homologados a sus subcuentas, la usa la memoria del Consolidado de un módulo y está en los filtros de cuentas de un módulo.",
    );
  });
});
