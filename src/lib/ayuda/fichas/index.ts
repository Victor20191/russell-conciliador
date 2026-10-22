// Ayuda en pantalla — catálogo de fichas y los permisos que citan (puro).

import { descriptorModulo, MODULOS_IMPORT, type DescriptorModulo } from "@/lib/modulos/descriptores";
import type { AyudaResuelta, FichaId } from "../resolver";
import type { EtapaAyuda, FichaAyuda } from "../tipos";
import {
  FICHA_BALANCE_DETALLE,
  FICHA_BALANCE_DIFF,
  FICHA_BALANCE_LISTADO,
  FICHA_BALANCE_TERCEROS,
} from "./balance";
import { FICHA_BORRADOR_BALANCE, FICHA_BORRADORES_BALANCE } from "./borradores-balance";
import {
  fichaModuloBorrador,
  fichaModuloBorradores,
  fichaModuloCargados,
  fichaModuloCargue,
  fichaModuloPatrones,
  fichaModuloPatronesManuales,
} from "./modulos";
import { FICHA_CONCEPTOS_NOMINA, FICHA_MAPEO_CLIENTE, FICHA_PLAN_RUSSELL } from "./catalogos";
import { FICHA_CLIENTES, FICHA_ESTRUCTURA, FICHA_PERFIL, FICHA_USUARIOS } from "./clientes-equipo";
import { FICHA_PARAMETROS_ALERTAS, fichaFiltrosCuentas } from "./parametrizacion";
import { FICHA_MESA_AYUDA } from "./mesa-ayuda";

/** Permiso del enlace «Reportar a Mesa de ayuda» del pie del panel. */
export const PERMISO_MESA_AYUDA = "soporte:ver";

/** Fichas de una sola pantalla. */
const FICHAS_FIJAS: Partial<Record<FichaId, FichaAyuda>> = {
  "balance.listado": FICHA_BALANCE_LISTADO,
  "balance.detalle": FICHA_BALANCE_DETALLE,
  "balance.diff": FICHA_BALANCE_DIFF,
  "balance.terceros": FICHA_BALANCE_TERCEROS,
  "balance.borradores": FICHA_BORRADORES_BALANCE,
  "balance.borrador": FICHA_BORRADOR_BALANCE,
  "catalogo.plan_russell": FICHA_PLAN_RUSSELL,
  "catalogo.mapeo_cliente": FICHA_MAPEO_CLIENTE,
  "catalogo.conceptos_nomina": FICHA_CONCEPTOS_NOMINA,
  "equipo.clientes": FICHA_CLIENTES,
  "equipo.usuarios": FICHA_USUARIOS,
  "equipo.estructura": FICHA_ESTRUCTURA,
  "equipo.perfil": FICHA_PERFIL,
  "parametros.alertas": FICHA_PARAMETROS_ALERTAS,
  "soporte.mesa_ayuda": FICHA_MESA_AYUDA,
};

/** Fichas que se arman con el descriptor de un módulo (una por módulo). */
const FICHAS_MODULO: Partial<Record<FichaId, (d: DescriptorModulo) => FichaAyuda>> = {
  "modulo.cargados": fichaModuloCargados,
  "modulo.borradores": fichaModuloBorradores,
  "modulo.borrador": fichaModuloBorrador,
  "modulo.patrones": fichaModuloPatrones,
  "modulo.patrones_manuales": fichaModuloPatronesManuales,
  "modulo.cargue": fichaModuloCargue,
  "parametros.filtros_cuentas": fichaFiltrosCuentas,
};

/** La ficha sin lo que no aplica al módulo (acciones, etapas, pestañas, estados, preguntas, enlaces). */
export function fichaParaModulo(ficha: FichaAyuda, d: DescriptorModulo): FichaAyuda {
  const aplica = (x: { aplica?: (d: DescriptorModulo) => boolean }) => !x.aplica || x.aplica(d);
  const etapas = (lista: readonly EtapaAyuda[]) =>
    lista.filter(aplica).flatMap((e) => {
      const acciones = e.acciones.filter(aplica);
      return acciones.length > 0 ? [{ ...e, acciones }] : [];
    });
  return {
    ...ficha,
    etapas: etapas(ficha.etapas),
    pestanas: ficha.pestanas?.filter(aplica).map((p) => ({ ...p, etapas: etapas(p.etapas) })),
    estados: ficha.estados?.filter(aplica),
    preguntas: ficha.preguntas?.filter(aplica),
    relacionadas: ficha.relacionadas?.filter(aplica),
  };
}

/** La ficha de la pantalla resuelta, o null si no tiene. */
export function fichaAyuda(resuelta: AyudaResuelta): FichaAyuda | null {
  const fija = FICHAS_FIJAS[resuelta.fichaId];
  if (fija) return fija;
  const deModulo = FICHAS_MODULO[resuelta.fichaId];
  const descriptor = resuelta.modulo ? descriptorModulo(resuelta.modulo) : null;
  return deModulo && descriptor ? fichaParaModulo(deModulo(descriptor), descriptor) : null;
}

/** Todas las fichas (las de módulos, una por módulo). */
export function todasLasFichas(): FichaAyuda[] {
  return [
    ...Object.values(FICHAS_FIJAS).filter((f): f is FichaAyuda => !!f),
    ...Object.values(MODULOS_IMPORT).flatMap((d) =>
      Object.values(FICHAS_MODULO).map((armar) => fichaParaModulo(armar!(d), d)),
    ),
  ];
}

/** Los permisos que cita una ficha: los de sus reglas y los de sus enlaces. */
export function permisosDeFicha(ficha: FichaAyuda): string[] {
  const etapas = [...ficha.etapas, ...(ficha.pestanas ?? []).flatMap((p) => p.etapas)];
  return [
    ...etapas.flatMap((e) => e.acciones.flatMap((a) => a.regla.flatMap((v) => v.permisos))),
    ...(ficha.relacionadas ?? []).flatMap((r) => (r.permiso ? [r.permiso] : [])),
  ];
}

let permisosCalculados: string[] | null = null;

/** Los permisos que necesita la ayuda: lo único de la matriz que viaja al navegador. */
export function permisosAyuda(): string[] {
  permisosCalculados ??= [...new Set([...todasLasFichas().flatMap(permisosDeFicha), PERMISO_MESA_AYUDA])].sort();
  return permisosCalculados;
}
