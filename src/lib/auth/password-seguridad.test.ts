import { describe, expect, it } from "vitest";
import { LoginSchema, PasswordSchema, ChangePasswordSchema } from "../definitions";

describe("contraseñas exactas y acotadas", () => {
  it("no quita espacios de una contraseña al autenticar", () => {
    const password = " MiClave12345 ";
    expect(PasswordSchema.safeParse(password).success).toBe(true);
    expect(LoginSchema.parse({ email: "prueba@example.com", password }).password).toBe(password);
  });
  it("impide crear contraseñas cuya parte final bcrypt descartaría", () => {
    expect(PasswordSchema.safeParse("A1" + "x".repeat(70)).success).toBe(true);
    expect(PasswordSchema.safeParse("A1" + "x".repeat(71)).success).toBe(false);
    expect(PasswordSchema.safeParse("A1" + "ñ".repeat(35)).success).toBe(true);
    expect(PasswordSchema.safeParse("A1" + "ñ".repeat(36)).success).toBe(false);
  });
  it("admite claves históricas largas pero rechaza entradas abusivas antes de bcrypt", () => {
    expect(LoginSchema.safeParse({ email: "prueba@example.com", password: "A1" + "x".repeat(100) }).success).toBe(true);
    expect(LoginSchema.safeParse({ email: "prueba@example.com", password: "x".repeat(1025) }).success).toBe(false);
    expect(ChangePasswordSchema.safeParse({ current: "x".repeat(1025), next: "NuevaClave123" }).success).toBe(false);
  });
});
