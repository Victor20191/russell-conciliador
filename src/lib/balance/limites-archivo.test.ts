import { describe, expect, it } from "vitest";
import {
  MAX_BALANCE_PDF_BYTES,
  MAX_BALANCE_TABULAR_BYTES,
  mensajeTamanoBalanceNoPermitido,
} from "./limites-archivo";

describe("límite de archivos de balance", () => {
  it("acepta el balance grande que antes era rechazado por superar 20 MB", () => {
    expect(mensajeTamanoBalanceNoPermitido("BALANCE IGB MAYO (1).xlsx", 23_335_347)).toBeNull();
  });

  it("acepta exactamente 60 MiB y rechaza un byte adicional", () => {
    expect(mensajeTamanoBalanceNoPermitido("balance.xlsx", MAX_BALANCE_TABULAR_BYTES)).toBeNull();
    expect(mensajeTamanoBalanceNoPermitido("balance.xlsx", MAX_BALANCE_TABULAR_BYTES + 1)).toContain(
      "supera 60 MB",
    );
  });

  it("mantiene el PDF dentro del payload seguro de la API de IA", () => {
    expect(mensajeTamanoBalanceNoPermitido("balance.pdf", MAX_BALANCE_PDF_BYTES)).toBeNull();
    expect(mensajeTamanoBalanceNoPermitido("balance.PDF", MAX_BALANCE_PDF_BYTES + 1)).toContain(
      "PDF supera 20 MB",
    );
  });
});
