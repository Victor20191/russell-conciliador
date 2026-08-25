import { describe, expect, it } from "vitest";
import {
  coincideBusquedaModulo,
  direccionInicialColumnaModulo,
  filtrarGruposCargaModulo,
  ordenarFilasModulo,
  type FilaListadoModulo,
} from "./listado";

const fila = (parcial: Partial<FilaListadoModulo> = {}): FilaListadoModulo => ({
  archivoNombre: "Inventario MARZO.xlsx",
  clienteNombre: "GRUPO LA CONGREGACIÓN S.A.S.",
  clienteNit: "900368731-2",
  periodo: "2026-03",
  version: 1,
  filas: 120,
  total: 5_000_000,
  ordenFecha: "2026-03-15T10:00:00.000Z",
  ...parcial,
});

describe("coincideBusquedaModulo", () => {
  it("sin término devuelve todas", () => {
    expect(coincideBusquedaModulo(fila(), "")).toBe(true);
    expect(coincideBusquedaModulo(fila(), "   ")).toBe(true);
  });

  it("busca por razón social sin acentos ni mayúsculas", () => {
    expect(coincideBusquedaModulo(fila(), "congregacion")).toBe(true);
    expect(coincideBusquedaModulo(fila(), "GRUPO LA")).toBe(true);
    expect(coincideBusquedaModulo(fila(), "inexistente")).toBe(false);
  });

  it("busca por archivo y por período", () => {
    expect(coincideBusquedaModulo(fila(), "marzo")).toBe(true);
    expect(coincideBusquedaModulo(fila(), "2026-03")).toBe(true);
    expect(coincideBusquedaModulo(fila(), "2026-04")).toBe(false);
  });

  it("busca por NIT con o sin dígito de verificación y con puntos", () => {
    expect(coincideBusquedaModulo(fila(), "900368731")).toBe(true);
    expect(coincideBusquedaModulo(fila(), "900.368.731-2")).toBe(true);
    expect(coincideBusquedaModulo(fila(), "811911909")).toBe(false);
  });

  it("tolera fila sin archivo, sin NIT y sin período", () => {
    const sinDatos = fila({ archivoNombre: null, clienteNit: null, periodo: null });
    expect(coincideBusquedaModulo(sinDatos, "")).toBe(true);
    expect(coincideBusquedaModulo(sinDatos, "marzo")).toBe(false);
    expect(coincideBusquedaModulo(sinDatos, "congregacion")).toBe(true);
  });
});

describe("ordenarFilasModulo", () => {
  const a = fila({ archivoNombre: "A.xlsx", clienteNombre: "Alfa", total: 10, filas: 3, version: 1, periodo: "2026-01", ordenFecha: "2026-01-10T00:00:00.000Z" });
  const b = fila({ archivoNombre: "B.xlsx", clienteNombre: "Beta", total: 30, filas: 1, version: 3, periodo: "2026-03", ordenFecha: "2026-03-10T00:00:00.000Z" });
  const c = fila({ archivoNombre: "C.xlsx", clienteNombre: "Cetro", total: 20, filas: 2, version: 2, periodo: "2026-02", ordenFecha: "2026-02-10T00:00:00.000Z" });
  const rows = [b, a, c];

  it("ordena por texto ascendente y descendente", () => {
    expect(ordenarFilasModulo(rows, "archivo", "asc").map((r) => r.archivoNombre)).toEqual(["A.xlsx", "B.xlsx", "C.xlsx"]);
    expect(ordenarFilasModulo(rows, "cliente", "desc").map((r) => r.clienteNombre)).toEqual(["Cetro", "Beta", "Alfa"]);
    expect(ordenarFilasModulo(rows, "periodo", "asc").map((r) => r.periodo)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("ordena numéricamente por filas, total y versión", () => {
    expect(ordenarFilasModulo(rows, "total", "desc").map((r) => r.total)).toEqual([30, 20, 10]);
    expect(ordenarFilasModulo(rows, "filas", "asc").map((r) => r.filas)).toEqual([1, 2, 3]);
    expect(ordenarFilasModulo(rows, "version", "desc").map((r) => r.version)).toEqual([3, 2, 1]);
  });

  it("ordena por fecha y deja al final las filas sin fecha al ordenar descendente", () => {
    const sinFecha = fila({ archivoNombre: "D.xlsx", ordenFecha: null });
    expect(ordenarFilasModulo([...rows, sinFecha], "fecha", "desc").map((r) => r.archivoNombre)).toEqual([
      "B.xlsx",
      "C.xlsx",
      "A.xlsx",
      "D.xlsx",
    ]);
  });

  it("no muta el arreglo original", () => {
    const original = [...rows];
    ordenarFilasModulo(rows, "total", "asc");
    expect(rows).toEqual(original);
  });

  it("desempata por fecha reciente y luego por archivo", () => {
    const uno = fila({ archivoNombre: "Z.xlsx", total: 5, ordenFecha: "2026-05-01T00:00:00.000Z" });
    const dos = fila({ archivoNombre: "Y.xlsx", total: 5, ordenFecha: "2026-06-01T00:00:00.000Z" });
    expect(ordenarFilasModulo([uno, dos], "total", "asc").map((r) => r.archivoNombre)).toEqual(["Y.xlsx", "Z.xlsx"]);
  });
});

describe("direccionInicialColumnaModulo", () => {
  it("texto arranca A→Z y números/fechas de mayor a menor", () => {
    expect(direccionInicialColumnaModulo("archivo")).toBe("asc");
    expect(direccionInicialColumnaModulo("cliente")).toBe("asc");
    expect(direccionInicialColumnaModulo("periodo")).toBe("asc");
    expect(direccionInicialColumnaModulo("filas")).toBe("desc");
    expect(direccionInicialColumnaModulo("total")).toBe("desc");
    expect(direccionInicialColumnaModulo("version")).toBe("desc");
    expect(direccionInicialColumnaModulo("fecha")).toBe("desc");
  });
});

describe("filtrarGruposCargaModulo", () => {
  const grupos = [
    {
      clienteNombre: "GRUPO LA CONGREGACIÓN S.A.S.",
      clienteNit: "900368731-2",
      periodos: [
        { periodo: "2026-03", archivoNombre: "Inventario MARZO.xlsx" },
        { periodo: "2026-04", archivoNombre: "Inventario ABRIL.xlsx" },
      ],
    },
    {
      clienteNombre: "QUIFARMA S.A.S.",
      clienteNit: "890938300",
      periodos: [{ periodo: "2026-03", archivoNombre: "Existencias.xlsx" }],
    },
  ];

  it("sin término devuelve todos los grupos intactos", () => {
    expect(filtrarGruposCargaModulo(grupos, "  ")).toEqual(grupos);
  });

  it("conserva la tarjeta completa cuando el término identifica al cliente", () => {
    const r = filtrarGruposCargaModulo(grupos, "congregacion");
    expect(r).toHaveLength(1);
    expect(r[0].periodos).toHaveLength(2);
  });

  it("encuentra al cliente por NIT con o sin dígito de verificación", () => {
    expect(filtrarGruposCargaModulo(grupos, "900368731").map((g) => g.clienteNit)).toEqual(["900368731-2"]);
    expect(filtrarGruposCargaModulo(grupos, "900368731-2").map((g) => g.clienteNit)).toEqual(["900368731-2"]);
  });

  it("deja solo los períodos que coinciden y descarta la tarjeta sin coincidencias", () => {
    const r = filtrarGruposCargaModulo(grupos, "ABRIL");
    expect(r).toHaveLength(1);
    expect(r[0].periodos.map((p) => p.periodo)).toEqual(["2026-04"]);
  });

  it("filtra por período en todos los clientes que lo tengan", () => {
    const r = filtrarGruposCargaModulo(grupos, "2026-03");
    expect(r).toHaveLength(2);
    expect(r.flatMap((g) => g.periodos.map((p) => p.periodo))).toEqual(["2026-03", "2026-03"]);
  });

  it("no muta el grupo original al recortar sus períodos", () => {
    filtrarGruposCargaModulo(grupos, "ABRIL");
    expect(grupos[0].periodos).toHaveLength(2);
  });
});
