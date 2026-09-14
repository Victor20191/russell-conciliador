import { describe, expect, it } from "vitest";
import { calcularHuella } from "@/lib/balance/extraccion/huella";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "./descriptores";
import {
  estabilizarEncabezado,
  huellaParaGuardar,
  huellasCandidatasModulo,
  huellasDeEncabezado,
  usaHuellaEstabilizada,
} from "./huella-modulo";

const CAR = descriptorModulo("CAR")!;
const INV = descriptorModulo("INV")!;

const hoja = (nombre: string, filas: (string | number | null)[][]): GridHoja => ({ nombre, filas });

describe("usaHuellaEstabilizada", () => {
  it("solo los módulos con columnas de rótulo variable", () => {
    expect(usaHuellaEstabilizada(CAR)).toBe(true);
    expect(usaHuellaEstabilizada(INV)).toBe(false);
  });
});

describe("estabilizarEncabezado", () => {
  it("sustituye los baldes de edad y deja intacto el resto", () => {
    expect(estabilizarEncabezado(CAR, ["NIT", "NOMBRE", "1 - 30 DIAS", "POR VENCER", "Valor Total"]))
      .toEqual(["NIT", "NOMBRE", "«familia»", "«familia»", "Valor Total"]);
  });

  it("no toca el encabezado de un módulo sin familias", () => {
    const encabezado = ["Tipo", "Referencia", "1 - 30 DIAS"];
    expect(estabilizarEncabezado(INV, encabezado)).toEqual(encabezado);
  });
});

describe("huellasDeEncabezado", () => {
  it("el mismo formato con los rangos rotulados distinto comparte huella", () => {
    // Es el caso real: el mismo ERP publica «1-30 / 31-60» en un cliente y «De 1 a 30 /
    // De 31 a 60» en otro. Sin estabilizar, el segundo estrenaba perfil.
    const a = huellaParaGuardar(CAR, "CARTERA", ["NIT", "NOMBRE", "1-30 días", "31-60 días", "Valor Total"]);
    const b = huellaParaGuardar(CAR, "CARTERA", ["NIT", "NOMBRE", "De 1 a 30", "De 31 a 60", "Valor Total"]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it("un número distinto de baldes también comparte huella", () => {
    const cuatro = huellaParaGuardar(CAR, "H", ["NIT", "0-30 días", "31-60 días", "61-90 días", "Más de 90 días"]);
    const tres = huellaParaGuardar(CAR, "H", ["NIT", "0-30 días", "31-60 días", "61-90 días"]);
    // Distinta cantidad de columnas ⇒ distinta huella: el mapeo de columnas NO es el mismo.
    expect(cuatro).not.toBe(tres);
  });

  it("dos formatos realmente distintos NO comparten huella", () => {
    const a = huellaParaGuardar(CAR, "H", ["NIT", "NOMBRE", "1-30 días"]);
    const b = huellaParaGuardar(CAR, "H", ["Código de cliente", "Nombre del cliente", "1-30 días"]);
    expect(a).not.toBe(b);
  });

  it("devuelve también la huella cruda, para no perder los perfiles ya guardados", () => {
    const encabezado = ["NIT", "NOMBRE", "1-30 días"];
    const huellas = huellasDeEncabezado(CAR, "CARTERA", encabezado);
    expect(huellas).toHaveLength(2);
    expect(huellas).toContain(calcularHuella("CARTERA", encabezado));
    // La estabilizada es la primera: es con la que se memoriza de aquí en adelante.
    expect(huellas[0]).toBe(calcularHuella("CARTERA", estabilizarEncabezado(CAR, encabezado)));
  });

  it("sin baldes, la estabilizada y la cruda son la misma y no se duplica", () => {
    expect(huellasDeEncabezado(CAR, "H", ["NIT", "NOMBRE", "Saldo"])).toHaveLength(1);
  });

  it("un módulo sin familias conserva exactamente la huella del balance", () => {
    const encabezado = ["Tipo", "Referencia", "Valor total"];
    expect(huellasDeEncabezado(INV, "Hoja1", encabezado)).toEqual([calcularHuella("Hoja1", encabezado)]);
  });

  it("una fila sin contenido no produce huella", () => {
    expect(huellasDeEncabezado(CAR, "H", [null, "", null])).toEqual([]);
    expect(huellaParaGuardar(CAR, "H", [])).toBeNull();
  });
});

describe("huellasCandidatasModulo", () => {
  it("agrega la variante estabilizada de cada fila sin perder las crudas", () => {
    const h = hoja("CARTERA", [
      ["Reporte de cartera", null, null],
      ["NIT", "NOMBRE", "1-30 días"],
    ]);
    const candidatas = huellasCandidatasModulo(CAR, [h]);
    const huellas = candidatas.map((c) => c.huella);
    expect(huellas).toContain(calcularHuella("CARTERA", h.filas[1]));
    expect(huellas).toContain(calcularHuella("CARTERA", estabilizarEncabezado(CAR, h.filas[1])));
    // Cada candidata conserva la fila de la que salió, para poder fijar `filaEncabezado`.
    expect(candidatas.every((c) => c.fila >= 1 && c.hoja === "CARTERA")).toBe(true);
  });

  it("no duplica huellas", () => {
    const h = hoja("H", [["NIT", "NOMBRE", "Saldo"]]);
    const huellas = huellasCandidatasModulo(CAR, [h]).map((c) => c.huella);
    expect(new Set(huellas).size).toBe(huellas.length);
  });

  it("un módulo sin familias devuelve exactamente las del balance", () => {
    const h = hoja("Hoja1", [["Tipo", "Referencia"], ["MERCANCIA", "REF-1"]]);
    expect(huellasCandidatasModulo(INV, [h])).toEqual(huellasCandidatasModulo(INV, [h]));
    expect(huellasCandidatasModulo(INV, [h])).toHaveLength(2);
  });
});
