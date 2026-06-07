import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decrypt } from "@/lib/jwt";
import prisma from "@/lib/prisma";

export const verifySession = cache(async () => {
  const cookie = (await cookies()).get("session")?.value;
  const session = await decrypt(cookie);

  if (!session?.userId || !Number.isSafeInteger(session.userId)) {
    redirect("/sesion-expirada");
  }

  // Una sola query trae todos los campos necesarios para verifySession y getCurrentUser.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      active: true,
      role: true,
      sessionVersion: true,
      mustChangePassword: true,
      name: true,
      email: true,
      initials: true,
    },
  });

  // Revocación: el usuario debe existir, estar activo y la versión de sesión coincidir.
  if (!user || !user.active || user.sessionVersion !== session.sessionVersion) {
    redirect("/sesion-expirada");
  }

  return {
    isAuth: true as const,
    userId: user.id,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    name: user.name,
    email: user.email,
    initials: user.initials,
  };
});

export const getCurrentUser = cache(async () => {
  try {
    const session = await verifySession();
    return {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      initials: session.initials,
    };
  } catch {
    return null;
  }
});
