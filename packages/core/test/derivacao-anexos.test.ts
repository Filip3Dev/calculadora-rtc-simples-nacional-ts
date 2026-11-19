/**
 * Porte dos 14 casos de Teste_DerivacaoAnexosSimples (regra pura).
 */
import { describe, expect, it } from "vitest";
import { ANEXOS_VALIDOS, derivar } from "../src/derivacao-anexos.js";

const set = (...xs: string[]) => new Set(xs);

describe("derivar (DerivacaoAnexosSimples)", () => {
  it("anexos válidos são I..V, em ordem", () => {
    expect([...ANEXOS_VALIDOS]).toEqual(["I", "II", "III", "IV", "V"]);
  });

  it("sem Fator R (I/null): NAO_APLICAVEL; disponível quando I configurado", () => {
    expect(derivar("I", null, set("I"))).toEqual({
      disponivel: true,
      anexosFaltantes: [],
      modoFatorR: "NAO_APLICAVEL",
    });
    expect(derivar("I", null, set("II"))).toEqual({
      disponivel: false,
      anexosFaltantes: ["I"],
      modoFatorR: "NAO_APLICAVEL",
    });
  });

  it("atividade '09' (III/V): OPCIONAL com ambos configurados", () => {
    expect(derivar("III", "V", set("III", "V"))).toEqual({
      disponivel: true,
      anexosFaltantes: [],
      modoFatorR: "OPCIONAL",
    });
  });

  it("III/V com apenas V configurado: OBRIGATORIO (só resta V)", () => {
    expect(derivar("III", "V", set("V"))).toEqual({
      disponivel: true,
      anexosFaltantes: ["III"],
      modoFatorR: "OBRIGATORIO",
    });
  });

  it("III/V com apenas III configurado: OPCIONAL-disponível… na regra: INDISPONIVEL exige V fora e III dentro", () => {
    // configurados={III}: anexoComFatorR(V) fora → INDISPONIVEL; disponível via III.
    expect(derivar("III", "V", set("III"))).toEqual({
      disponivel: true,
      anexosFaltantes: ["V"],
      modoFatorR: "INDISPONIVEL",
    });
  });

  it("III/V com nada configurado (anexos= vazio): INDISPONIVEL e indisponível", () => {
    expect(derivar("III", "V", set())).toEqual({
      disponivel: false,
      anexosFaltantes: ["III", "V"],
      modoFatorR: "INDISPONIVEL",
    });
  });

  it("configurados null = todos os anexos: nunca falta nada", () => {
    expect(derivar("III", "V", null)).toEqual({
      disponivel: true,
      anexosFaltantes: [],
      modoFatorR: "OPCIONAL",
    });
    expect(derivar("I", null, null)).toEqual({
      disponivel: true,
      anexosFaltantes: [],
      modoFatorR: "NAO_APLICAVEL",
    });
  });

  it("atividade sem anexo (90/null,null): disponível pelo eixo dos anexos", () => {
    expect(derivar(null, null, set("I"))).toEqual({
      disponivel: true,
      anexosFaltantes: [],
      modoFatorR: "NAO_APLICAVEL",
    });
  });

  it("invariante 'só com Fator R' lança erro de banco corrompido", () => {
    expect(() => derivar(null, "V", null)).toThrow(/anexoComFatorR \(V\) preenchido sem anexoSemFatorR/);
  });

  it("anexosFaltantes preservam a ordem romana I..V", () => {
    expect(derivar("II", "IV", set()).anexosFaltantes).toEqual(["II", "IV"]);
  });
});
