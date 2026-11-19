/**
 * Porte combinado de ParametrizacaoSimplesNacionalTest (espelho da carga
 * oficial) + Teste_AtividadeSimplesService — contra o banco real.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  abrirBanco,
  AtividadeSimplesService,
  ErroRespostaHttp,
  converterAnexos,
  ParametroCalculoSimplesService,
  serializarAtividade,
} from "../src/index.js";

const DB = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/calculadora.db",
);

describe.skipIf(!existsSync(DB))("parametrização (espelho da carga oficial)", () => {
  let repos: ReturnType<typeof abrirBanco>;
  let params: ParametroCalculoSimplesService;

  beforeAll(() => {
    repos = abrirBanco(DB);
    params = new ParametroCalculoSimplesService(repos);
  });

  it("matriz de regime: exatamente 3 linhas vigentes, com os destinos da NT", () => {
    expect(repos.buscarVigentesRegime(1, null, "2027-06-01")).toHaveLength(1);
    expect(repos.buscarVigentesRegime(2, null, "2027-06-01")).toHaveLength(1);
    expect(repos.buscarVigentesRegime(3, 2, "2027-06-01")).toHaveLength(1);
    expect(repos.buscarVigentesRegime(3, null, "2027-06-01")).toHaveLength(0);
    expect(repos.buscarVigentesRegime(1, 2, "2027-06-01")).toHaveLength(0);
    expect(params.buscarRegimeApuracao("CRT_1", "2027-06-01")).toMatchObject({
      geraIbs: true,
      destinoDevido: "DEVIDO",
      destinoPendenteSuspenso: "PENDENTE_SUSPENSO",
    });
    expect(params.buscarRegimeApuracao("CRT_2", "2027-06-01")).toMatchObject({ geraIbs: false });
    expect(params.buscarRegimeApuracao("CRT_3_TPREGIME_2", "2027-06-01")).toMatchObject({
      destinoDevido: "PENDENTE_SUSPENSO",
      destinoPendenteSuspenso: "ZERO",
    });
  });

  it("tipos de receita bruta: 7 códigos com fatores da NT", () => {
    const fator = (tp: number) => params.buscarTipoReceitaBruta(tp, "2027-06-01")!;
    expect(fator(0)).toMatchObject({ descricao: "Não é receita bruta", compoeReceita: false, exigeAliquota: false, vedadoNaoTributavel: false });
    expect(fator(1)).toMatchObject({ compoeReceita: true, exigeAliquota: true, pendenteSuspenso: false });
    expect(String(fator(1).fatorReceita.dec)).toBe("1");
    expect(fator(2)).toMatchObject({ compoeReceita: true, exigeAliquota: false });
    expect(fator(3)).toMatchObject({ compoeReceita: true });
    expect(fator(4)).toMatchObject({ pendenteSuspenso: true });
    expect(String(fator(5).fatorReceita.dec)).toBe("0.5");
    expect(fator(9)).toMatchObject({ descricao: "Fornecimento incompatível com SN", vedadoNaoTributavel: false });
    expect(params.buscarTipoReceitaBruta(6, "2027-06-01")).toBeNull();
  });

  it("transição de compra governamental: 6 vigências contíguas 2027→2033", () => {
    const casos: Array<[string, string | null]> = [
      ["2027-01-01", "0"],
      ["2028-12-31", "0"],
      ["2029-06-01", "0.1"],
      ["2030-06-01", "0.2"],
      ["2031-06-01", "0.3"],
      ["2032-06-01", "0.4"],
      ["2033-01-01", "1"],
      ["2099-12-31", "1"],
    ];
    for (const [data, fator] of casos) {
      expect(String(params.buscarFatorTransicaoCompraGov(data)!.dec), data).toBe(fator);
    }
    // pré-vigência: sem fator (VSN-025 — nunca zero implícito)
    expect(params.buscarFatorTransicaoCompraGov("2026-12-31")).toBeNull();
  });

  it("tpDocs do cálculo: 8 habilitados; 77/94 sem tratamento; 97/83 rejeitados", () => {
    for (const tp of [55, 57, 62, 63, 65, 67, 91, 93]) {
      expect(params.tpDocSuportado(tp, "2027-06-01"), String(tp)).toBe(true);
    }
    expect(params.tpDocSuportado(97, "2027-06-01")).toBe(false);
    expect(params.tpDocSuportado(83, "2027-06-01")).toBe(false);
    expect(params.tpDocSemTratamentoCalculadora(77)).toBe(true);
    expect(params.tpDocSemTratamentoCalculadora(94)).toBe(true);
  });

  it("classificações sem implementação (VSN-027): contagem > 0 para 620001 etc.", () => {
    // NOTA: 820001 foi HABILITADO na V0059 — não conta mais (confirmado na API Java real).
    for (const c of ["620001", "620002", "620006", "800001", "830001", "221002"]) {
      expect(repos.contarTratamentosNaoImplementados(c, "2027-06-01"), c).toBeGreaterThan(0);
    }
    expect(repos.contarTratamentosNaoImplementados("000001", "2027-06-01")).toBe(0);
    expect(repos.contarTratamentosNaoImplementados("820001", "2027-06-01")).toBe(0);
    // encerrado em 2026: não conta como não-implementado (segue VSN-021)
    expect(repos.contarTratamentosNaoImplementados("220001", "2027-06-01")).toBe(0);
  });
});

describe.skipIf(!existsSync(DB))("catálogo de atividades (banco real)", () => {
  let svc: AtividadeSimplesService;

  beforeAll(() => {
    svc = new AtividadeSimplesService(abrirBanco(DB));
  });

  it("lista as 15 atividades vigentes em 2027, ordenadas por ordem", () => {
    const lista = svc.listar("2027-01-01", null, null, null);
    expect(lista).toHaveLength(15);
    expect(lista[0]).toMatchObject({ codigo: "01", ordem: 1 });
    expect(lista[14]).toMatchObject({ codigo: "90", ordem: 15 });
  });

  it("código '01' (sem Fator R): anexo I, whitelist 55/65", () => {
    const json = serializarAtividade(svc.listar("2027-01-01", null, null, null)[0]);
    expect(json).toMatchObject({
      codigo: "01",
      anexoSemFatorR: "I",
      anexoComFatorR: null,
      sujeitaFatorR: false,
      modoFatorR: "NAO_APLICAVEL",
      tpDocsAdmissiveis: ["55", "65"],
      disponivel: true,
      anexosFaltantes: [],
    });
    // PARITY: @JsonInclude(ALWAYS) — anexoComFatorR null PRECISA estar presente
    expect("anexoComFatorR" in json).toBe(true);
    expect(json.anexoComFatorR).toBeNull();
  });

  it("código '09' é a única atividade com Fator R (III/V)", () => {
    const lista = svc.listar("2027-01-01", null, null, null);
    const comFatorR = lista.filter((a) => a.sujeitaFatorR);
    expect(comFatorR.map((a) => a.codigo)).toEqual(["09"]);
    expect(comFatorR[0]).toMatchObject({
      anexoSemFatorR: "III",
      anexoComFatorR: "V",
      rotuloAnexo: "III ou V",
      modoFatorR: "OPCIONAL",
    });
  });

  it("código '90' (não tributável): sem anexos, admissível nos 8 tpDocs", () => {
    const a90 = svc.buscarPorCodigo("90", "2027-01-01", null, null)!;
    expect(a90).toMatchObject({
      descricao: "Operações não Tributáveis",
      anexoSemFatorR: null,
      anexoComFatorR: null,
      tpDocsAdmissiveis: ["55", "57", "62", "63", "65", "67", "91", "93"],
    });
  });

  it("filtros: anexos=I,V → '09' fica OBRIGATORIO com faltante III; vazio → INDISPONIVEL", () => {
    const comFiltro = svc.listar("2027-01-01", new Set(["I", "V"]), null, null);
    expect(comFiltro.find((a) => a.codigo === "09")).toMatchObject({
      modoFatorR: "OBRIGATORIO",
      anexosFaltantes: ["III"],
      disponivel: true, // V configurado sustenta a disponibilidade pelo eixo dos anexos
    });
    const vazio = svc.listar("2027-01-01", new Set(), null, null);
    expect(vazio.find((a) => a.codigo === "09")).toMatchObject({
      modoFatorR: "INDISPONIVEL",
      anexosFaltantes: ["III", "V"],
      disponivel: false,
    });
  });

  it("tpDoc informado: admissivelNoDocumento true/false conforme whitelist", () => {
    const lista = svc.listar("2027-01-01", null, "91", null);
    expect(lista.find((a) => a.codigo === "07")).toMatchObject({ admissivelNoDocumento: true });
    expect(lista.find((a) => a.codigo === "01")).toMatchObject({ admissivelNoDocumento: false });
  });

  it("coerência UB14-90: cClassTrib vedado marca '90' incompatível (espelho do VSN-023)", () => {
    const lista = svc.listar("2027-01-01", null, null, "000001");
    expect(lista.find((a) => a.codigo === "90")).toMatchObject({
      compativelComClassTrib: false,
      disponivel: false,
    });
    expect(lista.find((a) => a.codigo === "01")).toMatchObject({
      compativelComClassTrib: true,
      disponivel: true,
    });
  });

  it("tpDoc inválido → 400 com mensagem específica", () => {
    expect(() => svc.listar("2027-01-01", null, "abc", null)).toThrowError(ErroRespostaHttp);
    try {
      svc.listar("2027-01-01", null, "abc", null);
    } catch (e) {
      expect((e as ErroRespostaHttp).status).toBe(400);
      expect((e as ErroRespostaHttp).message).toContain("abc");
    }
    expect(() => svc.listar("2027-01-01", null, "99", null)).toThrow(/desconhecido/);
  });

  it("cClassTrib inexistente/fora de vigência → 400", () => {
    expect(() => svc.listar("2027-01-01", null, null, "999999")).toThrow(/desconhecido ou fora de vigência/);
    expect(() => svc.listar("2025-12-31", null, null, "000001")).toThrow(/fora de vigência/);
  });

  it("converterAnexos: CSV e repetidos; fora do domínio → 400", () => {
    expect(converterAnexos(["I,V"])).toEqual(new Set(["I", "V"]));
    expect(converterAnexos(["I", "V"])).toEqual(new Set(["I", "V"]));
    expect(converterAnexos(null)).toBeNull();
    expect(() => converterAnexos(["I,X"])).toThrow(/Anexo inválido: 'X'/);
  });

  it("data anterior à vigência → lista vazia (não erro)", () => {
    expect(svc.listar("2025-12-31", null, null, null)).toHaveLength(0);
  });

  it("buscarPorCodigo: 404 lógico para código inexistente", () => {
    expect(svc.buscarPorCodigo("99", "2027-01-01", null, null)).toBeNull();
    expect(svc.buscarPorCodigo("05", "2027-01-01", null, null)).toMatchObject({
      codigo: "05",
      tpDocsAdmissiveis: ["57", "63", "67", "93"],
    });
  });
});
