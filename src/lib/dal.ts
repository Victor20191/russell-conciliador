import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decrypt } from "@/lib/jwt";
import prisma from "@/lib/prisma";

export const verifySession = cache(async () => {
  const cookie = (await cookies()).get("session")?.value;
  const session = await decrypt(cookie);

  if (!session?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      active: true,
      role: true,
      sessionVersion: true,
      mustChangePassword: true,
    },
  });

  // Revocación: el usuario debe existir, estar activo y la versión de sesión coincidir.
  if (!user || !user.active || user.sessionVersion !== session.sessionVersion) {
    redirect("/login");
  }

  return {
    isAuth: true as const,
    userId: user.id,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, role: true, initials: true },
    });
    return user;
  } catch {
    return null;
  }
});
