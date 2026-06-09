import * as z from "zod";

export const LoginSchema = z.object({
  email: z.email({ error: "Ingresa un correo válido." }).trim().toLowerCase(),
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
  userId: number;
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
  moduleId: z.coerce.number().int().positive(),
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
  code: z.string().min(1, { error: "El código es obligatorio." }).trim(),
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

// El rol se valida como texto y se contrasta contra el catálogo `roles` de la
// BD en la propia Server Action (acepta los 5 roles del PDF y los legado, y
// cualquier rol nuevo que cree el Administrador).
const RoleField = z.string().trim().min(1, { error: "El rol es obligatorio." });

export const UserCreateSchema = z.object({
  email: z.email({ error: "Correo inválido." }).trim().toLowerCase(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  role: RoleField,
  initials: z.string().min(1).max(3, { error: "Máximo 3 caracteres." }).trim(),
  password: PasswordSchema,
});

export const UserUpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  email: z.email({ error: "Correo inválido." }).trim().toLowerCase(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  role: RoleField,
  active: z.boolean(),
});

export const UserResetSchema = z.object({
  id: z.coerce.number().int().positive(),
  password: PasswordSchema,
});

export const UserUnlockSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const UserDeleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});
