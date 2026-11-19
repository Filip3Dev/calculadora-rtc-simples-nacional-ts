/**
 * Porte dos casos de Teste_SimplesNacionalCalculoService (20 @Test Java) —
 * serviço puro, com factories espelhando a carga oficial (V0050).
 */
import { describe, expect, it } from "vitest";
import { calcularItem, type InsumoCalculoSimples } from "../src/calculo.js";
import { JBD } from "../src/jbd.js";
import type {
  RegimeApuracaoSimples,
  TipoReceitaBrutaSimples,
} from "../src/tipos.js";

// ─── Factories (espelham a carga oficial de V0050) ───────────────────────────

function tipoReceita(codigo: number): TipoReceitaBrutaSimples {
  const base = {
    id: codigo,
    inicioVigencia: "2027-01-01",
    fimVigencia: null,
  };
  switch (codigo) {
    case 0:
      return { ...base, codigo: 0, descricao: "Não é receita bruta", compoeReceita: false, impostoSeletivoCompoeReceita: false, fatorReceita: JBD.parse("0.0"), pendenteSuspenso: false, exigeAliquota: false, vedadoNaoTributavel: false };
    case 1:
      return { ...base, codigo: 1, descricao: "Receita bruta - interna", compoeReceita: true, impostoSeletivoCompoeReceita: false, fatorReceita: JBD.parse("1.0"), pendenteSuspenso: false, exigeAliquota: true, vedadoNaoTributavel: true };
    case 2:
      return { ...base, codigo: 2, descricao: "Receita bruta - interna sem cálculo de IBS e CBS", compoeReceita: true, impostoSeletivoCompoeReceita: false, fatorReceita: JBD.parse("0.0"), pendenteSuspenso: false, exigeAliquota: false, vedadoNaoTributavel: true };
    case 3:
      return { ...base, codigo: 3, descricao: "Receita bruta - exportação direta", compoeReceita: true, impostoSeletivoCompoeReceita: false, fatorReceita: JBD.parse("0.0"), pendenteSuspenso: false, exigeAliquota: false, vedadoNaoTributavel: true };
    case 4:
      return { ...base, codigo: 4, descricao: "Receita bruta - exportação indireta", compoeReceita: true, impostoSeletivoCompoeReceita: false, fatorReceita: JBD.parse("1.0"), pendenteSuspenso: true, exigeAliquota: true, vedadoNaoTributavel: true };
    case 5:
      return { ...base, codigo: 5, descricao: "Receita bruta - mercado interno e exportação", compoeReceita: true, impostoSeletivoCompoeReceita: false, fatorReceita: JBD.parse("0.5"), pendenteSuspenso: false, exigeAliquota: true, vedadoNaoTributavel: true };
    default:
      return { ...base, codigo: 9, descricao: "Fornecimento incompatível com SN", compoeReceita: true, impostoSeletivoCompoeReceita: false, fatorReceita: JBD.parse("0.0"), pendenteSuspenso: false, exigeAliquota: false, vedadoNaoTributavel: false };
  }
}

function regimeCrt1(): RegimeApuracaoSimples {
  return { id: 1, crt: 1, tpRegimeIBSCBS: null, descricao: "Simples Nacional", geraIbs: true, destinoDevido: "DEVIDO", destinoPendenteSuspenso: "PENDENTE_SUSPENSO", inicioVigencia: "2027-01-01", fimVigencia: null };
}

function regimeCrt2(): RegimeApuracaoSimples {
  return { id: 2, crt: 2, tpRegimeIBSCBS: null, descricao: "Simples Nacional - excesso de sublimite", geraIbs: false, destinoDevido: "DEVIDO", destinoPendenteSuspenso: "PENDENTE_SUSPENSO", inicioVigencia: "2027-01-01", fimVigencia: null };
}

function regimeCrt3TpRegime2(): RegimeApuracaoSimples {
  return { id: 3, crt: 3, tpRegimeIBSCBS: 2, descricao: "Regime Normal com opção pelo Simples pendente", geraIbs: true, destinoDevido: "PENDENTE_SUSPENSO", destinoPendenteSuspenso: "ZERO", inicioVigencia: "2027-01-01", fimVigencia: null };
}

function insumo(overrides: Partial<InsumoCalculoSimples> = {}): InsumoCalculoSimples {
  return {
    regime: regimeCrt1(),
    tipoReceitaBruta: tipoReceita(1),
    cAtivSNValido: true,
    baseCalculo: JBD.parse("1000.00"),
    valorImpostoSeletivo: JBD.parse("0.00"),
    pIBSSN: JBD.parse("1.25"),
    pCBSSN: JBD.parse("2.75"),
    tpEnteGov: null,
    fatorTransicaoCompraGov: null,
    ...overrides,
  };
}

const moeda = (v: JBD | undefined) => (v === undefined ? undefined : v.dec.toFixed(2));
const aliq = (v: JBD | undefined) => (v === undefined ? undefined : String(v.dec.toFixed(2)));

describe("calcularItem — matriz CRT × tpRBSN (carga oficial)", () => {
  it("CRT=1 + tpRBSN=1: cálculo cheio (12.50 + 27.50 = 40.00)", () => {
    const r = calcularItem(insumo());
    expect(r.estadoItem).toBe("CALCULADO");
    expect(moeda(r.tribCalc.vIBSSN)).toBe("12.50");
    expect(moeda(r.tribCalc.vCBSSN)).toBe("27.50");
    expect(moeda(r.tribCalc.totalItem)).toBe("40.00");
    expect(moeda(r.tribCalc.vIBSPendSusp)).toBe("0.00");
    expect(moeda(r.tribCalc.vCBSPendSusp)).toBe("0.00");
    expect(aliq(r.tribCalc.pIBSSN)).toBe("1.25");
    expect(aliq(r.tribCalc.pCBSSN)).toBe("2.75");
  });

  it("vIS não compõe a receita bruta (carga: IS_COMPOE_RECEITA=0) e é repassado", () => {
    const r = calcularItem(insumo({ valorImpostoSeletivo: JBD.parse("50.00") }));
    expect(moeda(r.tribCalc.vRBSNitem)).toBe("1000.00");
    expect(moeda(r.tribCalc.IS!.valor)).toBe("50.00");
    expect(moeda(r.tribCalc.totalItem)).toBe("90.00");
  });

  it("CRT=2 suprime campos de IBS da saída (geraIbs=false)", () => {
    const r = calcularItem(insumo({ regime: regimeCrt2() }));
    expect(r.tribCalc.pIBSSN).toBeUndefined();
    expect(r.tribCalc.vIBSSN).toBeUndefined();
    expect(r.tribCalc.vIBSPendSusp).toBeUndefined();
    expect(moeda(r.tribCalc.vCBSSN)).toBe("27.50");
    expect(moeda(r.tribCalc.totalItem)).toBe("27.50");
  });

  it("CRT=3+tpRegime=2: devido vira pendente/suspenso; pendente vira ZERO (P32/P33)", () => {
    const r = calcularItem(insumo({ regime: regimeCrt3TpRegime2() }));
    expect(moeda(r.tribCalc.vIBSSN)).toBe("0.00");
    expect(moeda(r.tribCalc.vIBSSN)).toBeDefined();
    expect(moeda(r.tribCalc.vIBSPendSusp)).toBe("12.50");
    expect(moeda(r.tribCalc.vCBSSN)).toBe("0.00");
    expect(moeda(r.tribCalc.vCBSPendSusp)).toBe("27.50");
    expect(moeda(r.tribCalc.totalItem)).toBe("0.00");
  });

  it("tpRBSN=4 (exportação indireta): valores pendentes/suspensos no CRT=1", () => {
    const r = calcularItem(insumo({ tipoReceitaBruta: tipoReceita(4) }));
    expect(moeda(r.tribCalc.vIBSSN)).toBe("0.00");
    expect(moeda(r.tribCalc.vIBSPendSusp)).toBe("12.50");
    expect(moeda(r.tribCalc.vCBSPendSusp)).toBe("27.50");
  });

  it("tpRBSN=4 no CRT=3+tpRegime=2: tudo ZERO (destinoPendenteSuspenso=ZERO, literal)", () => {
    const r = calcularItem(
      insumo({ tipoReceitaBruta: tipoReceita(4), regime: regimeCrt3TpRegime2() }),
    );
    expect(moeda(r.tribCalc.vIBSSN)).toBe("0.00");
    expect(moeda(r.tribCalc.vIBSPendSusp)).toBe("0.00");
    expect(moeda(r.tribCalc.vCBSPendSusp)).toBe("0.00");
    expect(moeda(r.tribCalc.totalItem)).toBe("0.00");
  });

  it("tpRBSN=5 (mercado interno e exportação): fator 0.5 halved os valores", () => {
    const r = calcularItem(insumo({ tipoReceitaBruta: tipoReceita(5) }));
    expect(moeda(r.tribCalc.vBC)).toBe("500.00");
    expect(moeda(r.tribCalc.vIBSSN)).toBe("6.25");
    expect(moeda(r.tribCalc.vCBSSN)).toBe("13.75");
  });

  it.each([0, 2, 3, 9])("tpRBSN=%d: fator 0 → bases e tributos zerados", (tp) => {
    const r = calcularItem(insumo({ tipoReceitaBruta: tipoReceita(tp) }));
    if (tp === 0) {
      expect(moeda(r.tribCalc.vRBSNitem)).toBe("0.00"); // não compõe receita
    } else {
      expect(moeda(r.tribCalc.vRBSNitem)).toBe("1000.00"); // compõe
    }
    expect(moeda(r.tribCalc.vBC)).toBe("0.00");
    expect(moeda(r.tribCalc.vIBSSN)).toBe("0.00");
    expect(moeda(r.tribCalc.vCBSSN)).toBe("0.00");
  });

  it("tpRBSN=2 sem alíquotas informadas: calcula zerado sem erro", () => {
    const r = calcularItem(
      insumo({ tipoReceitaBruta: tipoReceita(2), pIBSSN: null, pCBSSN: null }),
    );
    expect(r.estadoItem).toBe("CALCULADO");
    expect(moeda(r.tribCalc.vCBSSN)).toBe("0.00");
  });

  it("cAtivSN inválido: NAO_CALCULADO reporta só vRBSNitem/tpRBSN/tpRBSNDescricao", () => {
    const r = calcularItem(insumo({ cAtivSNValido: false }));
    expect(r.estadoItem).toBe("NAO_CALCULADO");
    expect(moeda(r.tribCalc.vRBSNitem)).toBe("1000.00");
    expect(r.tribCalc.tpRBSN).toBe(1);
    expect(r.tribCalc.vBC).toBeUndefined();
    expect(r.tribCalc.totalItem).toBeUndefined();
    expect(r.tribCalc.IS).toBeUndefined();
  });
});

describe("calcularItem — compra governamental (arts. 372/473)", () => {
  it("tpEnteGov=1 (União): pCBS'=pCBS+pIBS=4.00; pIBS'=0", () => {
    const r = calcularItem(insumo({ tpEnteGov: 1 }));
    expect(aliq(r.tribCalc.pIBSSN)).toBe("0.00");
    expect(aliq(r.tribCalc.pCBSSN)).toBe("4.00");
    expect(moeda(r.tribCalc.vIBSSN)).toBe("0.00");
    expect(moeda(r.tribCalc.vCBSSN)).toBe("40.00");
  });

  it("tpEnteGov=2 com fator 0.10: pIBS'=1.525; pCBS'=2.475 → 15.25/24.75", () => {
    const r = calcularItem(insumo({ tpEnteGov: 2, fatorTransicaoCompraGov: JBD.parse("0.10") }));
    expect(String(r.tribCalc.pIBSSN!.dec)).toBe("1.525");
    expect(String(r.tribCalc.pCBSSN!.dec)).toBe("2.475");
    expect(moeda(r.tribCalc.vIBSSN)).toBe("15.25");
    expect(moeda(r.tribCalc.vCBSSN)).toBe("24.75");
    expect(moeda(r.tribCalc.totalItem)).toBe("40.00"); // invariante
  });

  it("tpEnteGov=2 com fator 1.00 (2033+): tudo vira IBS (4.00/0.00)", () => {
    const r = calcularItem(insumo({ tpEnteGov: 2, fatorTransicaoCompraGov: JBD.parse("1.00") }));
    expect(aliq(r.tribCalc.pIBSSN)).toBe("4.00");
    expect(aliq(r.tribCalc.pCBSSN)).toBe("0.00");
    expect(moeda(r.tribCalc.totalItem)).toBe("40.00");
  });

  it("tpEnteGov=2 sem fator resolvido: falha técnica (exigência do pipeline)", () => {
    expect(() => calcularItem(insumo({ tpEnteGov: 2, fatorTransicaoCompraGov: null }))).toThrow(
      /Fator de transição de compra governamental não resolvido/,
    );
  });

  it("CRT=2 com tpEnteGov=1: pIBSSN é insumo da transformação; IBS segue suprimido", () => {
    const r = calcularItem(insumo({ regime: regimeCrt2(), tpEnteGov: 1 }));
    expect(r.tribCalc.pIBSSN).toBeUndefined();
    expect(aliq(r.tribCalc.pCBSSN)).toBe("4.00");
    expect(moeda(r.tribCalc.vCBSSN)).toBe("40.00");
  });

  it("tpEnteGov informado sem alíquotas: par inalterado (sem transformação)", () => {
    const r = calcularItem(
      insumo({ tipoReceitaBruta: tipoReceita(2), pIBSSN: null, pCBSSN: null, tpEnteGov: 2, fatorTransicaoCompraGov: JBD.parse("0.1") }),
    );
    expect(r.estadoItem).toBe("CALCULADO");
  });

  it("tpEnteGov ausente: alíquotas inalteradas", () => {
    const r = calcularItem(insumo({ tpEnteGov: null, fatorTransicaoCompraGov: null }));
    expect(aliq(r.tribCalc.pIBSSN)).toBe("1.25");
    expect(aliq(r.tribCalc.pCBSSN)).toBe("2.75");
  });
});
