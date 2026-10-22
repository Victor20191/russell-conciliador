import { describe, expect, it } from "vitest";
import { motivoClienteFueraDeCartera } from "./cliente-cartera-creacion";

const r = { gerenteId: 10, seniorId: 20, staffIds: [30, 31] };
const ninguno = new Set<number>();

describe("motivoClienteFueraDeCartera", () => {
  it("los administradores crean con cualquier equipo", () => {
    expect(motivoClienteFueraDeCartera({ id: 1, rol: "Administrador" }, r, ninguno)).toBeNull();
    expect(motivoClienteFueraDeCartera({ id: 1, rol: "Superadministrador" }, r, ninguno)).toBeNull();
  });

  it("el gerente tiene que quedar como gerente del cliente", () => {
    expect(motivoClienteFueraDeCartera({ id: 10, rol: "Gerente" }, r, ninguno)).toBeNull();
    expect(motivoClienteFueraDeCartera({ id: 11, rol: "Gerente" }, r, ninguno)).toContain("elígete en «Gerente»");
  });

  it("el socio tiene que elegir a uno de sus gerentes", () => {
    expect(motivoClienteFueraDeCartera({ id: 5, rol: "Socio" }, r, new Set([10]))).toBeNull();
    expect(motivoClienteFueraDeCartera({ id: 5, rol: "Socio" }, r, new Set([12]))).toContain("gerentes que te reportan");
  });

  it("si la matriz se lo diera a un senior o un staff, también tendrían que quedar en el equipo", () => {
    expect(motivoClienteFueraDeCartera({ id: 20, rol: "Senior" }, r, ninguno)).toBeNull();
    expect(motivoClienteFueraDeCartera({ id: 31, rol: "Staff" }, r, ninguno)).toBeNull();
    expect(motivoClienteFueraDeCartera({ id: 32, rol: "Staff" }, r, ninguno)).not.toBeNull();
    expect(motivoClienteFueraDeCartera({ id: 40, rol: "Consulta" }, r, ninguno)).not.toBeNull();
  });
});
