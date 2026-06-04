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
  expiresAt: string; // ISO
};
