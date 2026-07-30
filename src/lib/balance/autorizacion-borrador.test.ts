import { describe, expect, it } from "vitest";
import {
  filtroLotesVisibles,
  puedeVerBorrador,
  resolverVinculoClienteBorrador,
  type ContextoAccesoBorrador,
} from "./autorizacion-borrador";

const contextoCartera: ContextoAccesoBorrador = {
  usuarioId: 21,
  alcance: {
    todos: false,
    clientIds: [7, 9],
    clientNames: ["Cliente 7", "Cliente 9"],
  },
};

const contextoGlobal: ContextoAccesoBorrador = {
  usuarioId: 1,
  alcance: { todos: true },
};

const clientes = [
  { id: 7, name: "Cliente asignado", nit: "900123456-7" },
  { id: 9, name: "Cliente sugerido", nit: "830515061-1" },
];

describe("autorización central de borradores", () => {
  it("exige cartera cuando el cliente está realmente asignado", () => {
    expect(
      puedeVerBorrador(
        { clienteId: 7, cargadoPorId: 99 },
        contextoCartera,
      ),
    ).toBe(true);
    expect(
      puedeVerBorrador(
        { clienteId: 88, cargadoPorId: contextoCartera.usuarioId },
        contextoCartera,
      ),
    ).toBe(false);
    expect(
      puedeVerBorrador(
        { clienteId: 88, cargadoPorId: null },
        contextoGlobal,
      ),
    ).toBe(true);
  });

  it("sin cliente permite únicamente alcance global o propietario", () => {
    expect(
      puedeVerBorrador(
        { clienteId: null, cargadoPorId: contextoCartera.usuarioId },
        contextoCartera,
      ),
    ).toBe(true);
    expect(
      puedeVerBorrador(
        { clienteId: null, cargadoPorId: 99 },
        contextoCartera,
      ),
    ).toBe(false);
    expect(
      puedeVerBorrador(
        { clienteId: null, cargadoPorId: null },
        contextoGlobal,
      ),
    ).toBe(true);
  });

  it("genera el mismo alcance para filtrar los lotes desde PostgreSQL", () => {
    expect(filtroLotesVisibles(contextoCartera)).toEqual({
      OR: [
        { clienteId: { in: [7, 9] } },
        { clienteId: null, cargadoPorId: 21 },
      ],
    });
    expect(filtroLotesVisibles(contextoGlobal)).toEqual({});
  });

  it("distingue cliente asignado de una sugerencia por NIT", () => {
    expect(
      resolverVinculoClienteBorrador(
        { clienteId: 7, nitDetectado: "830515061-1" },
        clientes,
      ),
    ).toEqual({
      tipo: "asignado",
      id: 7,
      nombre: "Cliente asignado",
      nit: "900123456-7",
    });
    expect(
      resolverVinculoClienteBorrador(
        { clienteId: null, nitDetectado: "830.515.061-1" },
        clientes,
      ),
    ).toEqual({
      tipo: "sugerido",
      id: 9,
      nombre: "Cliente sugerido",
      nit: "830515061-1",
    });
  });

  it("una sugerencia no concede acceso y una coincidencia ambigua no se muestra", () => {
    const loteAjeno = { clienteId: null, cargadoPorId: 99 };
    expect(
      resolverVinculoClienteBorrador(
        { ...loteAjeno, nitDetectado: "830515061" },
        clientes,
      ).tipo,
    ).toBe("sugerido");
    expect(puedeVerBorrador(loteAjeno, contextoCartera)).toBe(false);

    expect(
      resolverVinculoClienteBorrador(
        { clienteId: null, nitDetectado: "830515061" },
        [
          ...clientes,
          { id: 12, name: "Duplicado", nit: "830515061-9" },
        ],
      ),
    ).toEqual({ tipo: "sin_cliente" });
  });
});
