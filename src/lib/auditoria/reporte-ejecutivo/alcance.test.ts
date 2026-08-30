import { describe, expect, it } from "vitest";
import {
  filtrarCambiosPublicados,
  filtrarEventosPublicados,
  filtrarNavegacionesPublicadas,
  moduloDeEvento,
  moduloDeNavegacion,
  moduloPlataformaDeClave,
} from "./alcance";
import { clasificarFamilia, type EventoAuditoria } from "./metricas";

const PUBLICADOS = new Set([
  "balance",
  "modulos_datos",
  "conciliaciones",
  "dian",
  "clientes",
  "mapeo",
  "usuarios",
  "auditoria",
  "roles",
]);
const FILTRO = { modulosPublicados: PUBLICADOS };

function evento(action: string, extra: Partial<EventoAuditoria> = {}): EventoAuditoria {
  return {
    user: "Ana",
    action,
    entity: "",
    detail: "",
    clientId: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    ...extra,
  };
}

describe("moduloDeEvento", () => {
  it("saca la acción de su familia cuando pertenece a un módulo admin-only", () => {
    const e = evento("GUARDÓ PERFIL de carga de balance");
    expect(clasificarFamilia(e.action)).toBe("balance");
    expect(moduloDeEvento(e, clasificarFamilia(e.action))).toBe("perfiles_carga");
  });

  it("usa el módulo de la familia cuando no hay regla específica", () => {
    const e = evento("CARGÓ BALANCE");
    expect(moduloDeEvento(e, clasificarFamilia(e.action))).toBe("balance");
  });

  it("deja indeterminadas las acciones sin módulo claro", () => {
    const e = evento("COMENTÓ");
    expect(moduloDeEvento(e, clasificarFamilia(e.action))).toBeNull();
  });

  it("ubica las acciones de Inventarios en modulos_datos", () => {
    const e = evento("ACTUALIZÓ consolidación de módulo", { detail: "INV · 2 clasificadores" });
    const familia = clasificarFamilia(e.action, e.entity, e.detail);
    expect(familia).toBe("inventarios");
    expect(moduloDeEvento(e, familia)).toBe("modulos_datos");
  });
});

describe("navegaciones publicadas", () => {
  it("resuelve las rutas de Inventarios al módulo operativo", () => {
    expect(moduloDeNavegacion("/modulos/inv")).toBe("modulos_datos");
    expect(moduloDeNavegacion("/modulos/inv/borradores/lote-1")).toBe("modulos_datos");
    expect(moduloDeNavegacion("/config/perfiles-carga/inv")).toBe("perfiles_carga");
  });

  it("conserva solo familias operativas publicadas", () => {
    const r = filtrarNavegacionesPublicadas({
      navegaciones: [
        { ruta: "/modulos/inv", total: 89 },
        { ruta: "/balance", total: 149 },
        { ruta: "/config/reportes-ejecutivos", total: 7 },
        { ruta: "/config/prompts", total: 5 },
        { ruta: "/ruta-desconocida", total: 3 },
      ],
      filtro: FILTRO,
    });

    expect(r.navegaciones).toEqual([
      { ruta: "/modulos/inv", total: 89 },
      { ruta: "/balance", total: 149 },
    ]);
    expect(r.descartadas).toBe(15);
    expect(r.modulosExcluidos).toEqual(["prompts"]);
  });

  it("descarta Inventarios cuando modulos_datos no está publicado", () => {
    const r = filtrarNavegacionesPublicadas({
      navegaciones: [{ ruta: "/modulos/inv", total: 12 }],
      filtro: { modulosPublicados: new Set([...PUBLICADOS].filter((k) => k !== "modulos_datos")) },
    });
    expect(r.navegaciones).toEqual([]);
    expect(r.descartadas).toBe(12);
    expect(r.modulosExcluidos).toEqual(["modulos_datos"]);
  });
});

describe("filtrarEventosPublicados", () => {
  it("descarta la actividad de módulos no publicados y conserva el resto", () => {
    const eventos = [
      evento("CARGÓ BALANCE"),
      evento("EDITÓ PROMPT IA"),
      evento("GUARDÓ PERFIL de carga de balance"),
      evento("EJECUTÓ conciliación"),
      evento("COMENTÓ"),
    ];

    const r = filtrarEventosPublicados({
      eventos,
      clasificar: (e) => clasificarFamilia(e.action, e.entity, e.detail),
      filtro: FILTRO,
    });

    expect(r.eventos.map((e) => e.action)).toEqual([
      "CARGÓ BALANCE",
      "EJECUTÓ conciliación",
      "COMENTÓ",
    ]);
    expect(r.descartados).toBe(2);
    expect(r.modulosExcluidos).toEqual(["perfiles_carga", "prompts"]);
  });
});

describe("moduloPlataformaDeClave", () => {
  it("resuelve claves exactas del catálogo", () => {
    expect(moduloPlataformaDeClave("balance", PUBLICADOS)).toBe("balance");
  });

  it("resuelve alias frecuentes", () => {
    expect(moduloPlataformaDeClave("perfiles-carga", PUBLICADOS)).toBe("perfiles_carga");
    expect(moduloPlataformaDeClave("Prompts de IA", PUBLICADOS)).toBe("prompts");
  });

  it("devuelve null cuando no puede afirmar el módulo", () => {
    expect(moduloPlataformaDeClave(null, PUBLICADOS)).toBeNull();
    expect(moduloPlataformaDeClave("   ", PUBLICADOS)).toBeNull();
    expect(moduloPlataformaDeClave("xyz", PUBLICADOS)).toBeNull();
  });
});

describe("filtrarCambiosPublicados", () => {
  const claves = new Set([...PUBLICADOS, "perfiles_carga", "prompts", "novedades"]);

  it("excluye lo que sigue en desarrollo o planeado", () => {
    const r = filtrarCambiosPublicados({
      cambios: [
        { modulo: "balance", estadoFuncionalidad: "disponible" },
        { modulo: "balance", estadoFuncionalidad: "en_desarrollo" },
        { modulo: "dian", estadoFuncionalidad: "planeada" },
      ],
      filtro: FILTRO,
      clavesConocidas: claves,
    });
    expect(r.cambios).toHaveLength(1);
    expect(r.enDesarrollo).toBe(2);
    expect(r.moduloNoPublicado).toBe(0);
  });

  it("excluye funcionalidades disponibles de módulos aún no publicados", () => {
    const r = filtrarCambiosPublicados({
      cambios: [
        { modulo: "perfiles_carga", estadoFuncionalidad: "disponible" },
        { modulo: "conciliaciones", estadoFuncionalidad: "disponible" },
      ],
      filtro: FILTRO,
      clavesConocidas: claves,
    });
    expect(r.cambios.map((c) => c.modulo)).toEqual(["conciliaciones"]);
    expect(r.moduloNoPublicado).toBe(1);
  });

  it("descarta los cambios que no se pueden ubicar en un módulo de la plataforma", () => {
    const r = filtrarCambiosPublicados({
      cambios: [
        { modulo: null, estadoFuncionalidad: "disponible" },
        { modulo: "notificaciones", estadoFuncionalidad: "disponible" },
        { modulo: "balance", estadoFuncionalidad: "disponible" },
      ],
      filtro: FILTRO,
      clavesConocidas: claves,
    });
    expect(r.cambios.map((c) => c.modulo)).toEqual(["balance"]);
    expect(r.sinModulo).toBe(2);
    expect(r.moduloNoPublicado).toBe(0);
  });
});
