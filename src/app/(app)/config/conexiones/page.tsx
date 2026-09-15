import { Metadata } from "next";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { clavesCredencialesDefinidas } from "@/lib/conexiones/credenciales";
import ConexionesClient from "./conexiones-client";
import type { ConexionVista } from "./conexion-modal";

export const metadata: Metadata = {
  title: "Conexiones e integraciones",
};

export default async function ConexionesPage() {
  const authz = await authorizePermiso("conexiones:ver");
  if (!authz.ok) redirect("/(app)/dashboard");

  const conexiones = await prisma.conexionIntegracion.findMany({
    orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
  });

  const vista: ConexionVista[] = conexiones.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    descripcion: c.descripcion,
    categoria: c.categoria,
    proveedor: c.proveedor,
    entorno: c.entorno,
    activa: c.activa,
    configuracion: (c.configuracion ?? {}) as Record<string, unknown>,
    // Solo las CLAVES definidas: los valores descifrados nunca salen del servidor.
    credencialesDefinidas: clavesCredencialesDefinidas(c.credenciales),
    ultimaPruebaEn: c.ultimaPruebaEn,
    ultimaPruebaOk: c.ultimaPruebaOk,
    ultimaPruebaMensaje: c.ultimaPruebaMensaje,
    ultimaPruebaMs: c.ultimaPruebaMs,
    ultimoUsoEn: c.ultimoUsoEn,
    ultimaEjecucionEstado: c.ultimaEjecucionEstado,
    ultimaEjecucionMensaje: c.ultimaEjecucionMensaje,
    updatedAt: c.updatedAt,
  }));

  return <ConexionesClient conexiones={vista} />;
}
