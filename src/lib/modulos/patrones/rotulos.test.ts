import { describe, expect, it } from "vitest";
import { descriptorModulo } from "../descriptores";
import { TOKEN_FAMILIA } from "../huella-modulo";
import { clavesEncabezado, encabezadoParaGuardar } from "./rotulos";

const CAR = descriptorModulo("CAR")!;

describe("rótulos del encabezado", () => {
  it("una fila dispersa (celdas nunca escritas) se guarda con vacíos, nunca con undefined", () => {
    const fila: unknown[] = [];
    fila[1] = "Código";
    fila[3] = "  Total   saldo ";
    fila[5] = null;
    const guardado = encabezadoParaGuardar(fila);
    expect(guardado).toEqual(["", "Código", "", "Total saldo"]);
    expect(JSON.parse(JSON.stringify(guardado))).toEqual(guardado);
  });

  it("las claves recorren los huecos y los rangos de vencimiento comparten token", () => {
    const fila: unknown[] = [];
    fila[0] = "NIT";
    fila[2] = "De 1 a 30";
    expect(clavesEncabezado(CAR, fila)).toEqual(["nit", "", TOKEN_FAMILIA]);
  });
});
