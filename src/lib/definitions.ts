import * as z from "zod";

export const LoginSchema = z.object({
  email: z.email({ error: "Ingresa un correo válido." }).trim(),
  password: z
    .string()
    .min(1, { error: "La contraseña es obligatoria." })
    .trim(),
});

export type LoginState =
  | {
      errors?: {
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;

export type SessionPayload = {
  userId: string;
  role: string;
  sessionVersion: number;
  expiresAt: string; // ISO
};

// Estado genérico de las Server Actions usadas con useActionState.
export type ActionState = {
  ok?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
};

export const ModuleFieldSchema = z.object({
  moduleId: z.string().min(1),
  key: z
    .string()
    .min(1, { error: "La clave es obligatoria." })
    .regex(/^[a-z0-9_]+$/, { error: "Solo minúsculas, números y guion bajo." }),
  label: z.string().min(1, { error: "La etiqueta es obligatoria." }),
  type: z.enum(["string", "number", "date"]),
  required: z.boolean(),
  hint: z.string().optional(),
});

export const ClientSchema = z.object({
  id: z.string().min(1, { error: "El código es obligatorio." }).trim(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  nit: z.string().min(1, { error: "El NIT es obligatorio." }).trim(),
  erp: z.string().min(1, { error: "El ERP es obligatorio." }).trim(),
  sector: z.string().min(1, { error: "El sector es obligatorio." }).trim(),
});

export const PasswordSchema = z
  .string()
  .min(10, { error: "La contraseña debe tener al menos 10 caracteres." })
  .regex(/[A-Za-z]/, { error: "Debe incluir al menos una letra." })
  .regex(/[0-9]/, { error: "Debe incluir al menos un número." });

export const ChangePasswordSchema = z.object({
  current: z.string().min(1, { error: "Ingresa tu contraseña actual." }),
  next: PasswordSchema,
});
