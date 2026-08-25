import { describe, expect, it } from "vitest";
import {
  construirConfigMapeoCliente,
  esMapeoManual,
  esPendiente,
  esPendienteCodigo,
  esProtegidoDeAutomatico,
  ORIGEN_PENDIENTE,
  resolverMapeoCliente,
  type FilaMapeoCliente,
} from "./mapeo-cliente-config";

describe("construirConfigMapeoCliente", () => {
  it("elige el manual sin depender del orden de entrada", () => {
    const filas: FilaMapeoCliente[] = [
      { id: 1, code: "110505", cuenta6Russell: "110501", coincidencia: 100, origenMapeo: "automatico" },
      { id: 2, code: "11050501", cuenta6Russell: "110599", coincidencia: 100, origenMapeo: "manual" },
    ];

    expect(construirConfigMapeoCliente(filas).get("110505")?.std).toBe("110599");
    expect(construirConfigMapeoCliente([...filas].reverse()).get("110505")?.std).toBe("110599");
  });

  it("entre manuales conflictivos prioriza la regla exacta del grupo", () => {
    const config = construirConfigMapeoCliente([
      { id: 5, code: "13050501", cuenta6Russell: "130599", coincidencia: 100, origenMapeo: "manual", actualizadoEn: "2026-07-24T12:00:00Z" },
      { id: 4, code: "130505", cuenta6Russell: "130501", coincidencia: 100, origenMapeo: "manual", actualizadoEn: "2026-07-20T12:00:00Z" },
    ]);

    expect(config.get("130505")?.std).toBe("130501");
  });

  it("entre automáticos equivalentes usa la edición más reciente", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "22050501", cuenta6Russell: "220501", coincidencia: 90, origenMapeo: "automatico", actualizadoEn: "2026-07-20T12:00:00Z" },
      { id: 2, code: "22050502", cuenta6Russell: "220599", coincidencia: 80, origenMapeo: "automatico", actualizadoEn: "2026-07-24T12:00:00Z" },
    ]);

    expect(config.get("220505")?.std).toBe("220599");
  });

  // Caso reportado por operación: la IA clasificaba `21052001 FIDUCIA` (pasivo) en
  // `124505` (activo). La corrección de UNA cuenta debe sobrevivir a la siguiente
  // carga SIN arrastrar al resto del grupo. El fixture usa un grupo homologado
  // DENTRO de su clase porque una regla automática que cruza de clase ya no
  // gobierna a las hermanas (ver el describe de más abajo): lo que aquí se prueba
  // es la granularidad de la excepción, no la clase.
  it("memoriza la excepción por cuenta sin cambiar la regla del grupo", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "210520", cuenta6Russell: "210599", coincidencia: 90, origenMapeo: "automatico" },
      { id: 2, code: "21052001", cuenta6Russell: "210505", coincidencia: 100, origenMapeo: "manual_cuenta" },
      { id: 3, code: "21052002", cuenta6Russell: "210599", coincidencia: 90, origenMapeo: "automatico" },
    ]);

    expect(config.get("210520")?.std).toBe("210599");
    expect(resolverMapeoCliente(config, "21052001")?.std).toBe("210505");
    expect(resolverMapeoCliente(config, "21052002")?.std).toBe("210599");
    // Una cuenta nueva del grupo hereda la regla del grupo, no la excepción.
    expect(resolverMapeoCliente(config, "21052099")?.std).toBe("210599");
  });

  it("la excepción por cuenta no gana la elección del grupo aunque sea manual", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "51051801", cuenta6Russell: "510595", coincidencia: 100, origenMapeo: "manual_cuenta", actualizadoEn: "2026-08-05T12:00:00Z" },
      { id: 2, code: "510518", cuenta6Russell: "510505", coincidencia: 85, origenMapeo: "automatico", actualizadoEn: "2026-07-01T12:00:00Z" },
    ]);

    expect(config.get("510518")?.std).toBe("510505");
    expect(resolverMapeoCliente(config, "51051801")?.std).toBe("510595");
  });

  it("una regla de grupo posterior manda sobre la cuenta sin excepción propia", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "510518", cuenta6Russell: "510595", coincidencia: 100, origenMapeo: "manual" },
      { id: 2, code: "51051801", cuenta6Russell: "510595", coincidencia: 100, origenMapeo: "manual" },
    ]);

    expect(resolverMapeoCliente(config, "51051801")?.std).toBe("510595");
    expect(resolverMapeoCliente(config, "51051802")?.std).toBe("510595");
  });

  it("resolverMapeoCliente tolera memoria vacía", () => {
    expect(resolverMapeoCliente(undefined, "11050501")).toBeUndefined();
    expect(resolverMapeoCliente(new Map(), "11050501")).toBeUndefined();
  });
});

// La memoria manda sobre TODA la cascada, así que un error de la IA guardado
// como `automatico` se volvía permanente: nunca se revisaba de nuevo y se
// reaplicaba período tras período. Caso reportado por operación (QUIFARMA):
// `140598 TRASLADOS`, inventarios, memorizada contra `799505` (cierre de costos).
describe("reglas automáticas que cruzan de clase contable", () => {
  it("no gobiernan el grupo: la cuenta vuelve a la cascada", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "140598", cuenta6Russell: "799505", coincidencia: 70, origenMapeo: "automatico" },
      { id: 2, code: "14059805", cuenta6Russell: "799505", coincidencia: 70, origenMapeo: "automatico" },
    ]);

    expect(config.size).toBe(0);
    expect(resolverMapeoCliente(config, "14059805")).toBeUndefined();
  });

  it("no desplazan a la regla válida del mismo grupo", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "14059805", cuenta6Russell: "799505", coincidencia: 95, origenMapeo: "automatico", actualizadoEn: "2026-08-18T12:00:00Z" },
      { id: 2, code: "14059810", cuenta6Russell: "140505", coincidencia: 80, origenMapeo: "automatico", actualizadoEn: "2026-07-01T12:00:00Z" },
    ]);

    expect(resolverMapeoCliente(config, "14059805")?.std).toBe("140505");
  });

  it("respeta el cruce de clase decidido a mano, en el grupo y en la excepción", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "140598", cuenta6Russell: "799505", coincidencia: 100, origenMapeo: "manual" },
      { id: 2, code: "21052001", cuenta6Russell: "124505", coincidencia: 100, origenMapeo: "manual_cuenta" },
    ]);

    expect(resolverMapeoCliente(config, "14059805")?.std).toBe("799505");
    expect(resolverMapeoCliente(config, "21052001")?.std).toBe("124505");
  });
});

describe("marcador «Pendiente por Asignar»", () => {
  it("esPendiente solo reconoce el origen exacto", () => {
    expect(esPendiente(ORIGEN_PENDIENTE)).toBe(true);
    expect(esPendiente("pendiente")).toBe(true);
    expect(esPendiente("automatico")).toBe(false);
    expect(esPendiente("manual")).toBe(false);
    expect(esPendiente(null)).toBe(false);
    expect(esPendiente(undefined)).toBe(false);
  });

  it("esMapeoManual NO cuenta el pendiente como manual (son cosas distintas)", () => {
    expect(esMapeoManual(ORIGEN_PENDIENTE)).toBe(false);
  });

  it("esProtegidoDeAutomatico cubre manual, manual_cuenta y pendiente", () => {
    expect(esProtegidoDeAutomatico("manual")).toBe(true);
    expect(esProtegidoDeAutomatico("manual_cuenta")).toBe(true);
    expect(esProtegidoDeAutomatico(ORIGEN_PENDIENTE)).toBe(true);
    expect(esProtegidoDeAutomatico("automatico")).toBe(false);
    expect(esProtegidoDeAutomatico(null)).toBe(false);
  });

  it("una fila pendiente (std=null) NO entra al mapa de config: la cascada no la ve como mapeada", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "510506", cuenta6Russell: null, coincidencia: null, origenMapeo: ORIGEN_PENDIENTE },
      { id: 2, code: "51050601", cuenta6Russell: null, coincidencia: null, origenMapeo: ORIGEN_PENDIENTE },
    ]);

    expect(config.size).toBe(0);
    expect(resolverMapeoCliente(config, "51050601")).toBeUndefined();
  });

  it("esPendienteCodigo resuelve por código exacto o por su grupo de 6 dígitos", () => {
    const pendientes = new Set(["510506", "22050599"]);

    // Grupo marcado pendiente: cualquier imputable del grupo, incluida una
    // cuenta NUEVA que no tenía fila propia todavía, hereda el marcador.
    expect(esPendienteCodigo(pendientes, "510506")).toBe(true);
    expect(esPendienteCodigo(pendientes, "51050601")).toBe(true);
    expect(esPendienteCodigo(pendientes, "51050699")).toBe(true);

    // Excepción de una sola cuenta: no afecta a sus hermanas del grupo.
    expect(esPendienteCodigo(pendientes, "22050599")).toBe(true);
    expect(esPendienteCodigo(pendientes, "22050501")).toBe(false);

    expect(esPendienteCodigo(pendientes, "999999")).toBe(false);
    expect(esPendienteCodigo(undefined, "510506")).toBe(false);
    expect(esPendienteCodigo(new Set(), "510506")).toBe(false);
  });
});
