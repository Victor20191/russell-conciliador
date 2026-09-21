import { describe, expect, it } from "vitest";
import {
  anonimizarModelosIA,
  descripcionAvance,
  resumirCambio,
  tituloAvance,
} from "@/lib/auditoria/reporte-ejecutivo/texto-avances";

describe("anonimizarModelosIA", () => {
  it("quita el paréntesis que solo nombra al modelo", () => {
    expect(anonimizarModelosIA("Carga de balance asistida por Inteligencia Artificial (Claude)")).toBe(
      "Carga de balance asistida por Inteligencia Artificial",
    );
    expect(anonimizarModelosIA("la IA (Claude) lee el archivo")).toBe("la IA lee el archivo");
    // Tras una preposición no se puede borrar sin más: quedaría «con en producción».
    expect(anonimizarModelosIA("extracción con (Claude Opus 4.8) en producción")).toBe(
      "extracción con IA en producción",
    );
  });

  it("conserva los paréntesis que aportan información", () => {
    expect(anonimizarModelosIA("con archivos tabulares (Excel/CSV) la IA trabaja distinto")).toContain(
      "(Excel/CSV)",
    );
  });

  it("reemplaza el nombre suelto por IA, venga como venga", () => {
    expect(anonimizarModelosIA("Se envía a Claude y responde Gemini")).toBe("Se envía a IA y responde IA");
    expect(anonimizarModelosIA("Modelo Kimi K3 vía OpenCode")).toBe("Modelo IA vía IA");
    expect(anonimizarModelosIA("Integración con Anthropic y OpenAI")).toBe("Integración con IA y IA");
  });

  it("también los identificadores técnicos con guiones", () => {
    expect(anonimizarModelosIA("El modelo por defecto pasa a claude-sonnet-4-6")).toBe(
      "El modelo por defecto pasa a IA",
    );
    expect(anonimizarModelosIA("gemini-3.1-flash-lite y kimi-k3 y gpt-4o")).toBe("IA y IA y IA");
    expect(anonimizarModelosIA("Cascada claude-haiku-4-5 → claude-opus-4-8")).toBe("Cascada IA → IA");
  });

  it("tampoco deja variables de entorno del proveedor", () => {
    expect(
      anonimizarModelosIA("el modelo es configurable con la variable de entorno ANTHROPIC_MODEL"),
    ).toBe("el modelo es configurable con la configuración de IA");
    expect(anonimizarModelosIA("Define GEMINI_API_KEY y OPENCODE_MODEL")).toBe(
      "Define la configuración de IA y la configuración de IA",
    );
  });

  it("no toca palabras que solo contienen el nombre", () => {
    expect(anonimizarModelosIA("El claustro y la llamarada")).toBe("El claustro y la llamarada");
    // «opus» sin la marca es una palabra corriente, no un modelo.
    expect(anonimizarModelosIA("magnum opus del equipo")).toBe("magnum opus del equipo");
  });

  it("no deja repeticiones tras la sustitución", () => {
    expect(anonimizarModelosIA("la IA Claude revisa")).toBe("la IA revisa");
    expect(anonimizarModelosIA("Inteligencia Artificial Claude")).toBe("Inteligencia Artificial");
  });
});

describe("resumirCambio", () => {
  const largo =
    "Primera oración corta. Segunda oración que explica el cambio con algo más de detalle para el lector. " +
    "Tercera oración que ya es detalle técnico y no le hace falta a gerencia para entender de qué se trata.";

  it("devuelve el texto entero cuando cabe", () => {
    expect(resumirCambio("Cambio breve.", 420)).toBe("Cambio breve.");
  });

  it("corta en oración completa, nunca a media frase", () => {
    const r = resumirCambio(largo, 120);
    expect(r).toBe("Primera oración corta. Segunda oración que explica el cambio con algo más de detalle para el lector.");
    expect(r.endsWith(".")).toBe(true);
    expect(r).not.toContain("…");
  });

  it("si ni la primera oración cabe, corta en palabra y marca el recorte", () => {
    const r = resumirCambio("Una oración única y muy larga que no termina nunca de explicar el asunto", 30);
    expect(r.endsWith("…")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(31);
    expect(r).not.toContain("qu…");
  });

  it("normaliza espacios y tolera vacíos", () => {
    expect(resumirCambio("  hola   mundo  ")).toBe("hola mundo");
    expect(resumirCambio(null)).toBe("");
  });
});

describe("texto de un avance", () => {
  it("el título va sin modelo y acotado", () => {
    expect(tituloAvance("Carga asistida por IA (Claude)")).toBe("Carga asistida por IA");
    expect(tituloAvance("x".repeat(200))).toHaveLength(180);
  });

  it("la descripción combina las dos reglas", () => {
    const d = descripcionAvance(
      "Es la primera funcionalidad de IA de la plataforma. La IA (Claude) lee el archivo y extrae las cuentas. Por dentro hay una distinción técnica que no viene al caso.",
      110,
    );
    expect(d).toBe("Es la primera funcionalidad de IA de la plataforma. La IA lee el archivo y extrae las cuentas.");
  });
});
