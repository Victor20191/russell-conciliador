import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Opciones del pool `pg` pensadas para una BD remota: keepAlive detecta
// sockets muertos (p. ej. tras un cambio de red/VPN) en vez de entregarlos
// colgados; los timeouts hacen que falle rápido y recicle conexiones
// inactivas en lugar de esperar indefinidamente.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  keepAlive: true,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 10,
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
