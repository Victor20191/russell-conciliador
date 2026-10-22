import { describe, expect, it } from "vitest";
import { motivoNoEliminarCliente, type DatosDelCliente } from "./cliente-eliminacion";

const vacio: DatosDelCliente = { balances: 0, borradoresBalance: 0, cargues: 0, borradoresModulo: 0, archivosModulo: 0, conciliaciones: 0 };

describe("motivoNoEliminarCliente", () => {
  it("un cliente sin datos de trabajo se puede eliminar", () => {
    expect(motivoNoEliminarCliente(vacio)).toBeNull();
  });

  it("dice qué tiene, en singular o plural", () => {
    expect(motivoNoEliminarCliente({ ...vacio, balances: 1 })).toBe(
      "No se puede eliminar el cliente: tiene 1 balance. Elimínalos primero desde Balance de comprobación y desde cada módulo.",
    );
    expect(motivoNoEliminarCliente({ ...vacio, balances: 3, borradoresBalance: 1, cargues: 2 })).toContain(
      "tiene 3 balances, 1 borrador de balance y 2 cargues de módulo.",
    );
  });

  it("también bloquea con solo un borrador, un archivo recibido o una conciliación", () => {
    expect(motivoNoEliminarCliente({ ...vacio, borradoresModulo: 1 })).toContain("1 borrador de módulo");
    expect(motivoNoEliminarCliente({ ...vacio, archivosModulo: 2 })).toContain("2 archivos recibidos en los módulos");
    expect(motivoNoEliminarCliente({ ...vacio, conciliaciones: 1 })).toContain("1 conciliación de módulo");
  });
});
