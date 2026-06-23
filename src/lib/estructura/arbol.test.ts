import { describe, it, expect } from "vitest";
import {
  construirArbol,
  type UsuarioInput,
  type AristaInput,
  type AsignacionInput,
  type ClienteInput,
} from "./arbol";

// Firma demo:
//   Ana (Socio) → Luis (Gerente) → Marta (Senior) → Juan (Staff)
//   Carlos (Socio) sin gerentes        · Rosa (Gerente) sin socio (huérfana)
//   Pablo (Staff) inactivo             · Eva (Administrador) fuera del árbol
const usuarios: UsuarioInput[] = [
  { id: 1, name: "Ana Gómez", role: "Socio", initials: "AG", cargo: "Socia", active: true },
  { id: 8, name: "Carlos Mesa", role: "Socio", initials: "CM", cargo: null, active: true },
  { id: 2, name: "Luis Pérez", role: "Gerente", initials: "LP", cargo: null, active: true },
  { id: 3, name: "Rosa Vela", role: "Gerente", initials: "RV", cargo: null, active: true },
  { id: 4, name: "Marta Ruiz", role: "Senior", initials: "MR", cargo: null, active: true },
  { id: 5, name: "Juan Díaz", role: "Staff", initials: "JD", cargo: null, active: true },
  { id: 6, name: "Pablo Inactivo", role: "Staff", initials: "PI", cargo: null, active: false },
  { id: 7, name: "Eva Admin", role: "Administrador", initials: "EA", cargo: null, active: true },
];

const aristas: AristaInput[] = [
  { superiorId: 1, subordinateId: 2 }, // Ana → Luis
  { superiorId: 2, subordinateId: 4 }, // Luis → Marta
  { superiorId: 4, subordinateId: 5 }, // Marta → Juan
];

const clientes: ClienteInput[] = [
  { id: 10, code: "C-1", name: "Cliente Uno" },
  { id: 11, code: "C-2", name: "Cliente Dos" },
];

const asignaciones: AsignacionInput[] = [
  { clientId: 10, userId: 5, role: "staff" }, // Juan ejecuta C-1
  { clientId: 10, userId: 4, role: "senior" }, // Marta revisa C-1
  { clientId: 10, userId: 2, role: "gerente" }, // Luis valida C-1
  { clientId: 11, userId: 2, role: "gerente" }, // Luis valida C-2
];

describe("construirArbol", () => {
  const arbol = construirArbol(usuarios, aristas, asignaciones, clientes);

  it("usa los Socios activos como raíces, ordenados por nombre", () => {
    expect(arbol.raices).toEqual([1, 8]); // Ana antes que Carlos
  });

  it("enlaza cada nivel con sus subordinados directos", () => {
    expect(arbol.nodos[1].subordinadoIds).toEqual([2]); // Ana → Luis
    expect(arbol.nodos[2].subordinadoIds).toEqual([4]); // Luis → Marta
    expect(arbol.nodos[4].subordinadoIds).toEqual([5]); // Marta → Juan
    expect(arbol.nodos[5].subordinadoIds).toEqual([]); // Juan (Staff) es hoja
  });

  it("asigna a cada persona sus clientes directos", () => {
    expect(arbol.nodos[5].clientes.map((c) => c.code)).toEqual(["C-1"]); // Juan
    expect(arbol.nodos[4].clientes.map((c) => c.code)).toEqual(["C-1"]); // Marta
    expect(arbol.nodos[2].clientes.map((c) => c.code)).toEqual(["C-1", "C-2"]); // Luis
  });

  it("deriva los clientes del Socio desde sus gerentes (función gerente)", () => {
    expect(arbol.nodos[1].clientes.map((c) => c.code)).toEqual(["C-1", "C-2"]); // Ana ← Luis
    expect(arbol.nodos[8].clientes).toEqual([]); // Carlos no tiene gerentes
  });

  it("marca como huérfanas a las personas sin superior, por rol", () => {
    expect(arbol.huerfanos.gerentes).toEqual([3]); // Rosa, sin socio
    expect(arbol.huerfanos.seniors).toEqual([]);
    expect(arbol.huerfanos.staff).toEqual([]); // el staff inactivo no cuenta
  });

  it("excluye del árbol a usuarios inactivos y a roles fuera de la jerarquía", () => {
    expect(arbol.nodos[6]).toBeUndefined(); // Pablo (inactivo)
    expect(arbol.nodos[7]).toBeUndefined(); // Eva (Administrador)
    expect(arbol.huerfanos.staff).not.toContain(6);
  });

  it("resume los conteos por rol y el total de clientes", () => {
    expect(arbol.resumen).toEqual({ socios: 2, gerentes: 2, seniors: 1, staff: 1, clientes: 2 });
  });
});

describe("construirArbol · casos límite", () => {
  it("ignora aristas hacia usuarios inactivos (el subordinado queda sin superior)", () => {
    const us: UsuarioInput[] = [
      { id: 1, name: "Jefe Inactivo", role: "Gerente", initials: "JI", cargo: null, active: false },
      { id: 2, name: "Sub Activo", role: "Senior", initials: "SA", cargo: null, active: true },
    ];
    const arbol = construirArbol(us, [{ superiorId: 1, subordinateId: 2 }], [], []);
    expect(arbol.nodos[1]).toBeUndefined();
    expect(arbol.huerfanos.seniors).toEqual([2]); // su superior ya no está activo
  });

  it("devuelve un árbol vacío coherente sin datos", () => {
    const arbol = construirArbol([], [], [], []);
    expect(arbol.raices).toEqual([]);
    expect(arbol.nodos).toEqual({});
    expect(arbol.resumen).toEqual({ socios: 0, gerentes: 0, seniors: 0, staff: 0, clientes: 0 });
  });
});
