import { describe, expect, it } from "vitest";
import { ordenarCruceContable, ordenarCruceTercero, siguienteOrdenCruce } from "./orden-cruce";

const tercero = (clave: string, diferencia: number, extra: { nombre?: string | null; contable?: number; modulo?: number; porCuenta?: Record<string, number> } = {}) => ({
  clave,
  nombre: extra.nombre ?? null,
  contable: { porCuenta: extra.porCuenta ?? {}, total: extra.contable ?? 0 },
  modulo: { nacional: 0, exterior: 0, sinOrigen: 0, total: extra.modulo ?? 0 },
  diferencia,
});

describe("siguienteOrdenCruce", () => {
  it("recorre dirección inicial → contraria → orden del sistema", () => {
    const a = siguienteOrdenCruce(null, "diferencia", "desc");
    expect(a).toEqual({ columna: "diferencia", direccion: "desc" });
    const b = siguienteOrdenCruce(a, "diferencia", "desc");
    expect(b).toEqual({ columna: "diferencia", direccion: "asc" });
    expect(siguienteOrdenCruce(b, "diferencia", "desc")).toBeNull();
  });

  it("otra columna empieza en su dirección inicial", () => {
    expect(siguienteOrdenCruce({ columna: "diferencia", direccion: "asc" }, "nombre", "asc")).toEqual({ columna: "nombre", direccion: "asc" });
  });
});

describe("ordenarCruceTercero", () => {
  const filas = [
    tercero("444444003", -6_507_534.23),
    tercero("860059294", 14_329_514, { nombre: "BANCO B" }),
    tercero("890903938", -14_329_514.5, { nombre: "BANCOLOMBIA SA" }),
    tercero("115221809", 0, { nombre: "INVERSIONES", porCuenta: { "220505": 1_666_000 } }),
  ];

  it("la diferencia ordena por tamaño, sin importar el signo", () => {
    expect(ordenarCruceTercero(filas, { columna: "diferencia", direccion: "desc" }).map((f) => f.clave))
      .toEqual(["890903938", "860059294", "444444003", "115221809"]);
    expect(ordenarCruceTercero(filas, { columna: "diferencia", direccion: "asc" }).map((f) => f.clave))
      .toEqual(["115221809", "444444003", "860059294", "890903938"]);
  });

  it("sin orden conserva el del sistema y no muta la lista", () => {
    const copia = [...filas];
    expect(ordenarCruceTercero(filas, null)).toEqual(filas);
    ordenarCruceTercero(filas, { columna: "clave", direccion: "asc" });
    expect(filas).toEqual(copia);
  });

  it("los nombres vacíos van al final en las dos direcciones", () => {
    expect(ordenarCruceTercero(filas, { columna: "nombre", direccion: "asc" }).map((f) => f.clave).slice(-1)).toEqual(["444444003"]);
    expect(ordenarCruceTercero(filas, { columna: "nombre", direccion: "desc" }).map((f) => f.clave).slice(-1)).toEqual(["444444003"]);
  });

  it("una cuenta ordena por su importe con signo (vacía = 0)", () => {
    expect(ordenarCruceTercero(filas, { columna: "c:220505", direccion: "desc" })[0].clave).toBe("115221809");
  });
});

describe("ordenarCruceContable", () => {
  const fila = (cuenta4: string, diferencia: number, contable = 0) => ({
    cuenta4, contable, inventario: 0, diferenciaBruta: diferencia, noModular: 0, noModularModulo: 0, diferencia,
  });

  it("ordena la cédula por el tamaño de la diferencia", () => {
    const filas = [fila("1405", 10), fila("1410", -500), fila("1430", 0), fila("SIN_CUENTA", 200)];
    expect(ordenarCruceContable(filas, { columna: "diferencia", direccion: "desc" }).map((f) => f.cuenta4))
      .toEqual(["1410", "SIN_CUENTA", "1405", "1430"]);
  });

  it("los importes ordenan con signo y la cuenta como texto numérico", () => {
    const filas = [fila("1410", 0, -50), fila("1405", 0, 30), fila("14055", 0, 0)];
    expect(ordenarCruceContable(filas, { columna: "contable", direccion: "desc" }).map((f) => f.cuenta4)).toEqual(["1405", "14055", "1410"]);
    expect(ordenarCruceContable(filas, { columna: "cuenta", direccion: "asc" }).map((f) => f.cuenta4)).toEqual(["1405", "1410", "14055"]);
  });
});
