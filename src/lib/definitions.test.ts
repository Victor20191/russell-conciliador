import { test, expect } from "vitest";
import {
  ActualizarUmbralSchema,
  ClientSchema,
  CuentaClientePrevalidadorSchema,
  ModuleFieldSchema,
  PasswordSchema,
  PrefijoCuentaPrevalidadorSchema,
  RevisionPrevalidadorSchema,
  SupportTicketCreateSchema,
  SupportTicketInternalCreateSchema,
  SupportTicketSolutionSchema,
  SupportTicketStatusSchema,
  UserUpdateSchema,
} from "./definitions";

test("ModuleFieldSchema acepta un campo válido", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: 1,
    key: "codigo_item",
    label: "Código del ítem",
    type: "string",
    required: true,
    hint: "",
  });
  expect(r.success).toBe(true);
});

test("ModuleFieldSchema rechaza clave con mayúsculas o espacios", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: 1,
    key: "Codigo Item",
    label: "X",
    type: "string",
    required: false,
  });
  expect(r.success).toBe(false);
});

test("ModuleFieldSchema rechaza un tipo no permitido", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: 1,
    key: "x",
    label: "X",
    type: "boolean",
    required: false,
  });
  expect(r.success).toBe(false);
});

test("ClientSchema exige código, nombre, nit, tipo y socio (erpId y sectorId opcionales)", () => {
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "A",
      erpId: 1,
      sectorId: 2,
      socioId: 3,
    }).success,
  ).toBe(true);
  // El sector es opcional: sin sectorId sigue siendo válido.
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "A",
      erpId: 1,
      socioId: 3,
    }).success,
  ).toBe(true);
  // Tipo fuera de A/B/C es inválido.
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "D",
      erpId: 1,
      sectorId: 2,
      socioId: 3,
    }).success,
  ).toBe(false);
  // El ERP es OPCIONAL (se exige al iniciar una operación, no al validar el
  // formulario): sin erpId sigue siendo válido.
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "A",
      socioId: 3,
    }).success,
  ).toBe(true);
  // Sin socio (informativo pero obligatorio) es inválido.
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "A",
      erpId: 1,
      sectorId: 2,
    }).success,
  ).toBe(false);
  expect(
    ClientSchema.safeParse({ code: "", name: "", nit: "" }).success,
  ).toBe(false);
});

test("PasswordSchema acepta una contraseña fuerte", () => {
  expect(PasswordSchema.safeParse("Russell2026").success).toBe(true);
});

test("PasswordSchema rechaza contraseñas cortas o sin letra/dígito", () => {
  expect(PasswordSchema.safeParse("corta1").success).toBe(false);       // < 10 chars
  expect(PasswordSchema.safeParse("sololetrasaqui").success).toBe(false); // sin dígito
  expect(PasswordSchema.safeParse("1234567890").success).toBe(false);     // sin letra
});

test("UserUpdateSchema exige un correo válido al editar usuarios", () => {
  const base = {
    id: 1,
    email: "usuario@russellbedford.co",
    name: "Usuario Demo",
    role: "Senior",
    active: true,
  };

  expect(UserUpdateSchema.safeParse(base).success).toBe(true);
  expect(UserUpdateSchema.safeParse({ ...base, email: "correo-invalido" }).success).toBe(false);
});

test("ActualizarUmbralSchema normaliza el monto escrito con separadores", () => {
  // El usuario escribe «50.000» (o lo pega con espacios/símbolo): al servidor debe
  // llegar el número limpio, porque el umbral se compara contra montos en pesos.
  for (const escrito of ["50000", "50.000", "50 000", "$50.000"]) {
    const r = ActualizarUmbralSchema.safeParse({ clave: "naturaleza", valor: escrito });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.valor).toBe(50_000);
  }
});

test("ActualizarUmbralSchema acepta cero y rechaza vacíos, texto y montos absurdos", () => {
  // Cero es válido: apaga el filtro y toda diferencia real pasa a ser alerta.
  expect(ActualizarUmbralSchema.safeParse({ clave: "descuadre", valor: "0" }).success).toBe(true);
  expect(ActualizarUmbralSchema.safeParse({ clave: "descuadre", valor: "" }).success).toBe(false);
  expect(ActualizarUmbralSchema.safeParse({ clave: "descuadre", valor: "abc" }).success).toBe(false);
  expect(ActualizarUmbralSchema.safeParse({ clave: "descuadre", valor: "-500" }).success).toBe(true); // el signo se descarta → 500
  expect(ActualizarUmbralSchema.safeParse({ clave: "descuadre", valor: "9999999999" }).success).toBe(false);
  expect(ActualizarUmbralSchema.safeParse({ clave: "", valor: "2000" }).success).toBe(false);
});

test("el ticket publico exige nombre, apellido y detalle suficiente", () => {
  const valido = {
    firstName: "  Ana  ",
    lastName: "  Pérez ",
    subject: "No puedo ingresar al balance",
    description: "La pantalla queda cargando después de seleccionar el archivo.",
    website: "",
  };
  const parsed = SupportTicketCreateSchema.safeParse(valido);
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.firstName).toBe("Ana");
    expect(parsed.data.lastName).toBe("Pérez");
  }
  expect(SupportTicketCreateSchema.safeParse({ ...valido, lastName: "" }).success).toBe(false);
  expect(SupportTicketCreateSchema.safeParse({ ...valido, website: "bot.example" }).success).toBe(false);
});

test("la solución valida ticket, versión y explicación", () => {
  const base = {
    ticketId: "12",
    updatedAt: "2026-08-07T15:00:00.000Z",
    solution: "Se restableció el acceso y se verificó el ingreso con el usuario.",
  };
  expect(SupportTicketSolutionSchema.safeParse(base).success).toBe(true);
  expect(SupportTicketSolutionSchema.safeParse({ ...base, solution: "Listo" }).success).toBe(false);
});

test("la novedad interna solo pide asunto y descripción", () => {
  const valido = {
    subject: "El balance no carga",
    description: "Al elegir el archivo la pantalla se queda en blanco.",
  };
  expect(SupportTicketInternalCreateSchema.safeParse(valido).success).toBe(true);
  expect(SupportTicketInternalCreateSchema.safeParse({ ...valido, subject: "abc" }).success).toBe(false);
});

test("cambiar estado exige solución solo al marcar resuelto", () => {
  const base = {
    ticketId: "12",
    updatedAt: "2026-08-07T15:00:00.000Z",
    status: "en_proceso",
  };
  expect(SupportTicketStatusSchema.safeParse(base).success).toBe(true);
  expect(SupportTicketStatusSchema.safeParse({ ...base, status: "resuelto" }).success).toBe(false);
  expect(SupportTicketStatusSchema.safeParse({
    ...base,
    status: "resuelto",
    solution: "Se corrigió la carga y el usuario pudo continuar.",
  }).success).toBe(true);
  expect(SupportTicketStatusSchema.safeParse({ ...base, status: "pausado" }).success).toBe(false);
});

test("el prevalidador normaliza y admite únicamente prefijos de nivel 2 o 4", () => {
  expect(PrefijoCuentaPrevalidadorSchema.parse(" 41 ")).toBe("41");
  expect(PrefijoCuentaPrevalidadorSchema.parse("13.30")).toBe("1330");
  expect(PrefijoCuentaPrevalidadorSchema.parse(" 51 05 ")).toBe("5105");

  for (const invalida of ["1", "133", "13301", "13-30", "abcd", ""]) {
    expect(PrefijoCuentaPrevalidadorSchema.safeParse(invalida).success).toBe(false);
  }
});

test("el override y la revisión validan balance, fila y justificación del servidor", () => {
  const override = CuentaClientePrevalidadorSchema.parse({
    balanceId: "7",
    catalogoId: "3",
    cuentaCliente: "28.05",
  });
  expect(override).toEqual({ balanceId: 7, catalogoId: 3, cuentaCliente: "2805" });

  const revision = RevisionPrevalidadorSchema.parse({ balanceId: "7", justificacion: "  Revisado con soporte  " });
  expect(revision).toEqual({ balanceId: 7, justificacion: "Revisado con soporte" });
  expect(RevisionPrevalidadorSchema.safeParse({ balanceId: 7, justificacion: "no" }).success).toBe(false);
});
