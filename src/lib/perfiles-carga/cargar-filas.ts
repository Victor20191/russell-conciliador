// Cargador SERVER-ONLY de las filas del tablero Configuración › Perfiles de carga
// para UNA fuente: «balance» o un módulo del motor genérico (INV, CAR, CXP, ING,
// AFI, NOM). Cada pantalla del submenú (Balance / Inventarios / …) llama esta
// función con su fuente y recibe solo los clientes con memoria en ella; la lógica
// de acumular/ordenar es pura y vive en `filas-memoria.ts`.
import "server-only";
import prisma from "@/lib/prisma";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import {
  FUENTE_BALANCE,
  construirFilasMemoria,
  crearAcumuladorMemoria,
  registrarCorrecciones,
  registrarPerfiles,
  registrarPreferencias,
  type FilaMemoriaCarga,
} from "./filas-memoria";

export type FilasMemoriaFuente = {
  rows: FilaMemoriaCarga[];
  totalClientes: number;
};

/**
 * Filas de memoria de carga de la fuente indicada (solo clientes con algo guardado,
 * más recientes primero). Los administradores tienen alcance global, así que se
 * consideran todos los clientes.
 */
export async function cargarFilasMemoria(fuente: string): Promise<FilasMemoriaFuente> {
  const clientes = await prisma.client.findMany({
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, nit: true, erp: { select: { name: true } } },
  });
  const acc = crearAcumuladorMemoria();

  if (fuente === FUENTE_BALANCE) {
    const [perfiles, correcciones, ajustes] = await Promise.all([
      prisma.perfilCargaBalance.groupBy({
        by: ["clienteId"],
        _count: { _all: true },
        _max: { ultimoUsoEn: true, actualizadoEn: true },
      }),
      prisma.correccionCargaBalance.groupBy({
        by: ["clienteId"],
        _count: { _all: true },
        _max: { actualizadoEn: true },
      }),
      // OJO: la sola existencia de la fila NO significa «preferencias
      // configuradas»: `asegurarPerfilBaseCliente` (balance.ts) crea un perfil
      // base con todo en null en la PRIMERA carga de cada cliente. Solo cuenta si
      // hay algún valor real; `estandar` se ignora porque es fijo (NIF).
      prisma.ajustesCargaBalance.findMany({
        select: {
          clienteId: true,
          hojaPreferida: true,
          convencionCredito: true,
          agregarPorTercero: true,
          imputarSoloHojas: true,
          observaciones: true,
          actualizadoEn: true,
        },
      }),
    ]);
    for (const p of perfiles) {
      registrarPerfiles(acc, p.clienteId, FUENTE_BALANCE, p._count._all, p._max.ultimoUsoEn, p._max.actualizadoEn);
    }
    for (const c of correcciones) {
      registrarCorrecciones(acc, c.clienteId, FUENTE_BALANCE, c._count._all, c._max.actualizadoEn);
    }
    for (const a of ajustes) {
      const configuradas =
        a.hojaPreferida != null
        || a.convencionCredito != null
        || a.agregarPorTercero != null
        || a.imputarSoloHojas != null
        || (a.observaciones != null && a.observaciones.trim() !== "");
      if (configuradas) registrarPreferencias(acc, a.clienteId, FUENTE_BALANCE, a.actualizadoEn);
    }
  } else if (descriptorModulo(fuente)) {
    // Los módulos NO memorizan correcciones por fila (la tabla
    // `correcciones_carga_modulo` existe sin escritor: el borrador de módulo no la
    // alimenta), así que solo se cuentan formatos y preferencias.
    const [perfiles, ajustes] = await Promise.all([
      prisma.perfilCargaModulo.groupBy({
        by: ["clienteId"],
        where: { moduloCodigo: fuente },
        _count: { _all: true },
        _max: { ultimoUsoEn: true, actualizadoEn: true },
      }),
      prisma.ajustesCargaModulo.findMany({
        where: { moduloCodigo: fuente },
        select: { clienteId: true, hojaPreferida: true, observaciones: true, actualizadoEn: true },
      }),
    ]);
    for (const p of perfiles) {
      registrarPerfiles(acc, p.clienteId, fuente, p._count._all, p._max.ultimoUsoEn, p._max.actualizadoEn);
    }
    for (const a of ajustes) {
      const configuradas = a.hojaPreferida != null || (a.observaciones != null && a.observaciones.trim() !== "");
      if (configuradas) registrarPreferencias(acc, a.clienteId, fuente, a.actualizadoEn);
    }
  }

  const rows = construirFilasMemoria(
    clientes.map((c) => ({ id: c.id, code: c.code, name: c.name, nit: c.nit, erpName: c.erp?.name ?? null })),
    acc,
  );
  return { rows, totalClientes: clientes.length };
}
