import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AvisoAutoCorreccionSoloHojas,
  combinarRevisionesReubicacion,
  etiquetaPerfilSoloHojas,
  filtrarReubicacionesPendientes,
  NombreCuentaArbol,
  ProteccionSubtotalesPanel,
  retirarConfirmacionesLocales,
} from "./borrador-detail-client";
import type { RevisionReubicacionStaging } from "@/lib/balance/staging-borrador";

const revisionGuardada: RevisionReubicacionStaging = {
  filaNum: 737,
  justificacion: "Reubicación revisada por criterio contable.",
  revisadaPor: "Usuario de prueba",
  revisadaPorId: 10,
  revisadaEn: "2026-07-28T15:00:00.000Z",
};

describe("estado visual de las revisiones de reubicación", () => {
  it("mantiene la cuenta revisada con la confirmación de la acción mientras llega el refresh", () => {
    const riesgos = [{ filaNum: 737 }];
    const sinRevision = combinarRevisionesReubicacion([], []);
    expect(filtrarReubicacionesPendientes(riesgos, sinRevision)).toEqual(riesgos);

    const confirmada = combinarRevisionesReubicacion([], [revisionGuardada]);
    expect(filtrarReubicacionesPendientes(riesgos, confirmada)).toEqual([]);
    expect(confirmada.get(737)).toEqual(revisionGuardada);
  });

  it("prioriza la confirmación local más reciente hasta que las props se actualicen", () => {
    const anterior = {
      ...revisionGuardada,
      justificacion: "Justificación anterior conservada en las props.",
      revisadaEn: "2026-07-28T14:00:00.000Z",
    };
    const combinadas = combinarRevisionesReubicacion([anterior], [revisionGuardada]);

    expect(combinadas.get(737)).toEqual(revisionGuardada);
  });

  it("adopta una revisión posterior recibida por el refresh", () => {
    const posterior = {
      ...revisionGuardada,
      justificacion: "Justificación posterior recibida desde el servidor.",
      revisadaEn: "2026-07-28T16:00:00.000Z",
    };
    const combinadas = combinarRevisionesReubicacion([posterior], [revisionGuardada]);

    expect(combinadas.get(737)).toEqual(posterior);
  });

  it("retira solo la alerta cuya aprobación ya fue confirmada por el servidor", () => {
    const riesgos = [{ filaNum: 737 }, { filaNum: 910 }];
    const confirmada = combinarRevisionesReubicacion([], [revisionGuardada]);

    expect(filtrarReubicacionesPendientes(riesgos, confirmada)).toEqual([{ filaNum: 910 }]);
  });

  it("no deja reaparecer el padre ni la revisión aprobados al guardar una reversión posterior", () => {
    const otraRevision = { ...revisionGuardada, filaNum: 910 };
    const resultado = retirarConfirmacionesLocales(
      { 737: 60, 910: 75 },
      [revisionGuardada, otraRevision],
      [737],
    );

    expect(resultado.padresConfirmados).toEqual({ 910: 75 });
    expect(resultado.revisionesConfirmadas).toEqual([otraRevision]);
  });
});

describe("nombre de cuenta con descuadre en el árbol", () => {
  it("conserva la señal visual sin activar ayuda al pasar el cursor", () => {
    const html = renderToStaticMarkup(
      createElement(NombreCuentaArbol, {
        nombre: "GENERALES",
        omitida: false,
        descuadrado: true,
        descuadreAccionable: true,
        umbralDescuadre: 2_000,
      }),
    );

    expect(html).toContain("GENERALES");
    expect(html).toContain("text-err-700");
    expect(html).toContain("underline");
    expect(html).not.toContain("title=");
    expect(html).not.toContain("tabindex=");
    expect(html).not.toContain("cursor-help");
  });

  it("conserva la ayuda distinta del aviso informativo", () => {
    const html = renderToStaticMarkup(
      createElement(NombreCuentaArbol, {
        nombre: "GENERALES",
        omitida: false,
        descuadrado: true,
        descuadreAccionable: false,
        umbralDescuadre: 2_000,
      }),
    );

    expect(html).toContain("text-err-500");
    expect(html).toContain("underline");
    expect(html).toContain("tabindex=\"0\"");
    expect(html).toContain("cursor-help");
  });
});

describe("protección contra doble conteo", () => {
  it("distingue el estado triestado configurado en el perfil", () => {
    expect(etiquetaPerfilSoloHojas(true)).toBe("Perfil: solo hojas activo");
    expect(etiquetaPerfilSoloHojas(false)).toBe("Perfil: forzado desactivado");
    expect(etiquetaPerfilSoloHojas(null)).toBe("Perfil: detección automática");
    expect(etiquetaPerfilSoloHojas(undefined)).toBe("Perfil: cliente pendiente");
  });

  it("presenta la protección estándar como estado y el forzado dentro de ajustes avanzados", () => {
    const html = renderToStaticMarkup(
      createElement(ProteccionSubtotalesPanel, {
        perfilSoloHojas: true,
        soloHojas: false,
        autoCorregido: false,
        analisis: { ayuda: false, n: 3 },
        onForzar: () => undefined,
        onDeshacer: () => undefined,
      }),
    );

    expect(html).toContain("Protección estándar contra subtotales activa");
    expect(html).toContain("Perfil: solo hojas activo");
    expect(html).toContain("Ajustes avanzados de jerarquía");
    expect(html).toContain("Forzar modo solo hojas (3)");
    expect(html).not.toContain('type="checkbox"');
  });

  it("ofrece una acción directa para deshacer la auto-corrección", () => {
    const html = renderToStaticMarkup(
      createElement(AvisoAutoCorreccionSoloHojas, {
        cuentas: 7,
        onDeshacer: () => undefined,
      }),
    );

    expect(html).toContain("Corrección automática de anidado");
    expect(html).toContain("Deshacer auto-corrección");
    expect(html).toContain("7");
  });
});
