import { describe, expect, it } from "vitest";
import {
  filtrarCambiosPublicados,
  filtrarEventosPublicados,
  moduloDeEvento,
  moduloPlataformaDeClave,
} from "./alcance";
import { clasificarFamilia, type EventoAuditoria } from "./metricas";

const PUBLICADOS = new Set([
  "balance",
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

  it("conserva los cambios sin módulo identificable", () => {
    const r = filtrarCambiosPublicados({
      cambios: [{ modulo: null, estadoFuncionalidad: "disponible" }],
      filtro: FILTRO,
      clavesConocidas: claves,
    });
    expect(r.cambios).toHaveLength(1);
  });
});
