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

// Responsables del cliente (asignación directa al crear/editar): uno o varios
// Staff ejecutan, el Senior revisa y el Gerente valida. La consistencia (roles
// exactos, usuarios activos y jerarquía gerente→senior→staff) se contrasta
// contra la BD en la propia Server Action.
export const ClientResponsablesSchema = z.object({
  gerenteId: z.coerce.number({ error: "Selecciona el gerente." }).int().positive({ error: "Selecciona el gerente." }),
  seniorId: z.coerce.number({ error: "Selecciona el senior." }).int().positive({ error: "Selecciona el senior." }),
  // Uno o varios staff por cliente; todos ejecutan (alcance de escritura).
  staffIds: z
    .array(z.coerce.number().int().positive())
    .min(1, { error: "Selecciona al menos un staff." }),
});

// Superiores directos de un usuario en la jerarquía organizacional
// (jerarquia_usuarios). La adyacencia de roles se valida en la action.
export const SuperioresSchema = z.array(z.coerce.number().int().positive()).max(50);

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
  // Ausente o vacía → la contraseña no se toca; con valor → política completa.
  password: z.preprocess((v) => (v ? v : undefined), PasswordSchema.optional()),
});

export const UserUnlockSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const UserDeleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Matriz de permisos (/config/permisos): cada cambio fija el NIVEL de una celda
// (rol × módulo). El `nivel` se valida contra el dominio cerrado de
// src/lib/rbac/niveles.ts; el `roleId`/`module` se contrastan además contra el
// catálogo (ROLES_MATRIZ y permisos sembrados) en la propia Server Action.
export const CambioNivelSchema = z.object({
  roleId: z.number().int().positive(),
  module: z.string().trim().min(1),
  nivel: z.enum(["ninguno", "ver", "comentar", "operar", "administrar"]),
});

export const GuardarNivelesSchema = z
  .array(CambioNivelSchema)
  .min(1, { error: "No hay cambios para guardar." })
  .max(2000, { error: "Demasiados cambios en una sola operación." });
