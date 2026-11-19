/**
 * Porte dos casos de Teste_SimplesNacionalObservabilidadeService — aqui contra
 * o BANCO REAL gerado por db:build (mais forte que os mocks do Java: cobre
 * também as queries e a carga oficial V0047/49/50/51).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  abrirBanco,
  ErrosCalculoException,
  serializarObservabilidade,
  SimplesNacionalObservabilidadeService,
  type OperacaoSimplesInput,
} from "../src/index.js";

const DB = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/calculadora.db",
);
const BASE = "http://localhost:8082";

describe.skipIf(!existsSync(DB))("observabilidade (banco real)", () => {
  let svc: SimplesNacionalObservabilidadeService;

  beforeAll(() => {
    svc = new SimplesNacionalObservabilidadeService(abrirBanco(DB));
  });

  const operacao = (over: Partial<OperacaoSimplesInput> = {}): OperacaoSimplesInput => ({
    id: "abc",
    versao: "2.0.0",
    data: "2027-03-15",
    tpDoc: "55",
    CRT: "1",
    itens: [
      {
        numero: 1,
        cAtivSN: "01",
        cClassTrib: "000001",
        baseCalculo: "1000.00",
        valorImpostoSeletivo: "0.00",
        pIBSSN: "1.25",
        pCBSSN: "2.75",
      },
    ],
    ...over,
  });

  const json = (op: OperacaoSimplesInput) => serializarObservabilidade(svc.processarOperacao(op, BASE));

  it("CALCULADO pleno (CRT=1, tpRBSN=1): 12.50/27.50/40.00", () => {
    const r = json(operacao());
    expect(r.objetos![0]).toMatchObject({
      estadoItem: "CALCULADO",
      tribCalc: { vIBSSN: "12.50", vCBSSN: "27.50", totalItem: "40.00", vBC: "1000.00" },
    });
  });

  it("compra gov tpEnteGov=2 em 2029 (fator 0.10): 1.525/2.475 → 15.25/24.75", () => {
    const r = json(operacao({ data: "2029-06-01", tpEnteGov: "2" }));
    expect(r.objetos![0].tribCalc).toMatchObject({
      pIBSSN: "1.525",
      pCBSSN: "2.475",
      vIBSSN: "15.25",
      vCBSSN: "24.75",
    });
  });

  it("compra gov União (tpEnteGov=1): pCBS'=4.00, pIBS'=0.00", () => {
    const r = json(operacao({ tpEnteGov: "1" }));
    expect(r.objetos![0].tribCalc).toMatchObject({ pIBSSN: "0.00", pCBSSN: "4.00", vCBSSN: "40.00" });
  });

  it("CRT=2: campos de IBS suprimidos", () => {
    const r = json(operacao({ CRT: "2" }));
    const t = r.objetos![0].tribCalc as Record<string, unknown>;
    expect(t.pIBSSN).toBeUndefined();
    expect(t.vIBSSN).toBeUndefined();
    expect(t.vIBSPendSusp).toBeUndefined();
    expect(t.vCBSSN).toBe("27.50");
  });

  it("CRT=3+tpRegimeIBSCBS=2: devido→pendente, pendente→zero (P32/P33)", () => {
    const r = json(operacao({ CRT: "3", tpRegimeIBSCBS: "2" }));
    expect(r.objetos![0].tribCalc).toMatchObject({
      vIBSSN: "0.00",
      vIBSPendSusp: "12.50",
      vCBSSN: "0.00",
      vCBSPendSusp: "27.50",
      totalItem: "0.00",
    });
  });

  it("NAO_CALCULADO (cAtivSN fora do catálogo): só vRBSNitem/tpRBSN/tpRBSNDescricao; total só vRBSNtot", () => {
    const r = json(operacao({ itens: [{ ...operacao().itens![0], cAtivSN: "99" }] }));
    expect(r.objetos![0]).toMatchObject({
      estadoItem: "NAO_CALCULADO",
      tribCalc: { vRBSNitem: "1000.00", tpRBSN: 1, tpRBSNDescricao: "Receita bruta - interna" },
    });
    expect((r.objetos![0].tribCalc as Record<string, unknown>).vBC).toBeUndefined();
    expect(r.total).toEqual({ vRBSNtot: "1000.00" });
  });

  it("NAO_CALCULADO (cAtivSN '07' admissível só em 91, operação em 55)", () => {
    const r = json(operacao({ itens: [{ ...operacao().itens![0], cAtivSN: "07" }] }));
    expect(r.objetos![0].estadoItem).toBe("NAO_CALCULADO");
  });

  it("NAO_IMPLEMENTADO (VSN-027) tem prioridade sobre VSN-002 e sobre NAO_CALCULADO", () => {
    const r = json(
      operacao({
        itens: [
          {
            numero: 1,
            cAtivSN: "99", // levaria a NAO_CALCULADO…
            cClassTrib: "620001", // …mas a classificação não está implementada
            baseCalculo: "-10.00", // …e a base é negativa (VSN-002)
            valorImpostoSeletivo: "0.00",
          },
        ],
      }),
    );
    expect(r.objetos![0].estadoItem).toBe("NAO_IMPLEMENTADO");
    expect((r.objetos![0] as { erros: Array<{ code: string }> }).erros).toHaveLength(1);
    expect((r.objetos![0] as { erros: Array<{ code: string; pointer: string }> }).erros[0]).toMatchObject({
      code: "VSN-027",
      pointer: "#/itens/0/cClassTrib",
    });
    expect(r.total).toBeUndefined();
  });

  it("tpRBSN=0 com cAtivSN='90' (não tributável): CALCULADO zerado", () => {
    const r = json(
      operacao({
        itens: [
          {
            numero: 1,
            cAtivSN: "90",
            cClassTrib: "410001",
            baseCalculo: "1000.00",
            valorImpostoSeletivo: "0.00",
          },
        ],
      }),
    );
    expect(r.objetos![0].tribCalc).toMatchObject({
      vRBSNitem: "0.00",
      tpRBSN: 0,
      tpRBSNDescricao: "Não é receita bruta",
      vBC: "0.00",
      vIBSSN: "0.00",
      vCBSSN: "0.00",
    });
  });

  it("VSN-023: cAtivSN '90' (não tributável) × cClassTrib tpRBSN=1 (vedado)", () => {
    const r = json(operacao({ itens: [{ ...operacao().itens![0], cAtivSN: "90" }] }));
    const item = r.objetos![0] as { estadoItem: string; erros: Array<{ code: string }> };
    expect(item.estadoItem).toBe("INCONSISTENCIA_ENTRADA");
    expect(item.erros[0].code).toBe("VSN-023");
  });

  it("mistura de estados: INCONSISTENCIA não entra em nenhum total; NAO_CALCULADO só em vRBSNtot", () => {
    const base = operacao().itens![0];
    const r = json(
      operacao({
        itens: [
          { ...base, baseCalculo: "-10.00" },
          { ...base, numero: 2 },
          { ...base, numero: 3, cAtivSN: "99", baseCalculo: "500.00" },
        ],
      }),
    );
    expect(r.total).toEqual({
      vRBSNtot: "1500.00",
      vBC: "1000.00",
      vIBSSNtot: "12.50",
      vIBSSNtotPendSusp: "0.00",
      vCBSSNtot: "27.50",
      vCBSSNtotPendSusp: "0.00",
      totalIs: "0.00",
      totalTributos: "40.00",
    });
  });

  it("nObj ausente usa index+1 e acumula VSN-010", () => {
    const r = json(operacao({ itens: [{ ...operacao().itens![0], numero: null }] }));
    const item = r.objetos![0] as { nObj: number; estadoItem: string; erros: Array<{ code: string }> };
    expect(item.nObj).toBe(1);
    expect(item.estadoItem).toBe("INCONSISTENCIA_ENTRADA");
    expect(item.erros[0].code).toBe("VSN-010");
  });

  it.each([
    ["VSN-024", { tpEnteGov: "7" }],
    ["VSN-019", { CRT: "4" }],
    ["VSN-019", { CRT: "3" }],
    ["VSN-015", { tpDoc: "97" }],
    ["VSN-015", { tpDoc: "77" }],
    ["VSN-012", { data: "2027-13-99" }],
    ["VSN-015", { data: "2026-06-01" }], // pre-vigência: tpDoc 55 não suportado na data
    ["VSN-016", { CRT: "9" }],
    ["VSN-017", { tpRegimeIBSCBS: "9" }],
    ["VSN-018", { tpRegimeIBSCBS: "2" }],
    ["VSN-013", { id: null }],
  ])("422 global %s (%o)", (code, over) => {
    try {
      json(operacao(over as Partial<OperacaoSimplesInput>));
      expect.unreachable("deveria lançar ErrosCalculoException");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrosCalculoException);
      const erros = (e as ErrosCalculoException).erros;
      expect(erros.some((x) => x.code === code)).toBe(true);
    }
  });

  it("itens vazios → VSN-011", () => {
    expect(() => json(operacao({ itens: [] }))).toThrowError(/Erros/);
    try {
      json(operacao({ itens: [] }));
    } catch (e) {
      expect((e as ErrosCalculoException).erros.map((x) => x.code)).toContain("VSN-011");
    }
  });

  it("cClassTrib fora de vigência (220001 encerrado em 2026) → VSN-021 no item", () => {
    const r = json(operacao({ itens: [{ ...operacao().itens![0], cClassTrib: "220001" }] }));
    const item = r.objetos![0] as { estadoItem: string; erros: Array<{ code: string }> };
    expect(item.estadoItem).toBe("INCONSISTENCIA_ENTRADA");
    expect(item.erros[0].code).toBe("VSN-021");
  });

  it("alíquota exigida ausente → VSN-004", () => {
    const r = json(operacao({ itens: [{ ...operacao().itens![0], pCBSSN: null }] }));
    const item = r.objetos![0] as { estadoItem: string; erros: Array<{ code: string }> };
    expect(item.erros.map((x) => x.code)).toContain("VSN-004");
  });
});
