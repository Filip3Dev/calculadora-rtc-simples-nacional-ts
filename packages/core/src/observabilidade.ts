/**
 * Serviço de observabilidade do Simples Nacional — porte fiel de
 * SimplesNacionalObservabilidadeService (NT 2026.005).
 *
 * Responsabilidades: validação global de escopo (HTTP 422), verificação
 * PRIORITÁRIA de cClassTrib não implementado (NAO_IMPLEMENTADO/VSN-027),
 * resolução do tpRBSN e do cAtivSN por item, exigência condicional das
 * alíquotas, entrega de insumos prontos ao cálculo (puro), acúmulo de erros
 * por item e totalização.
 *
 * PARITY: o Java processa itens em paralelo com virtual threads; aqui o
 * processamento é sequencial (itens são independentes — mesma saída).
 * Mensagens de detail são byte-idênticas às do serviço Java.
 */
import { JBD } from "./jbd.js";
import { totalizar } from "./jbd.js";
import { catalogo, ErrosCalculoException, type ErroDetalhe } from "./erros.js";
import { calcularItem, type InsumoCalculoSimples } from "./calculo.js";
import { ParametroCalculoSimplesService } from "./parametrizacao.js";
import type { RepositoriosSimples } from "./db/repositorios.js";
import type {
  AtividadeSimplesNacional,
  EstadoItemSimples,
  ItemSimplesInput,
  ObjetoSimplesDomain,
  ObservabilidadeSimplesDomain,
  OperacaoSimplesInput,
  RegimeApuracaoSimples,
  RegimeCalculoSimples,
  TipoReceitaBrutaSimples,
  TotalSimplesDomain,
  TributosSimplesDomain,
} from "./tipos.js";

// ─── Coletor de erros por item (ItemCollectorSimples) ────────────────────────

class ItemCollectorSimples {
  private readonly erros: ErroDetalhe[] = [];
  private estado: EstadoItemSimples = "CALCULADO";

  constructor(
    private readonly index: number,
    private readonly baseURL: string,
  ) {}

  addErroValidacao(codigo: keyof typeof catalogo | string, campo: string, detail: string): void {
    if (this.estado === "CALCULADO") {
      this.estado = "INCONSISTENCIA_ENTRADA";
    }
    this.erros.push(this.build(codigo, campo, detail));
  }

  /** Estado atribuído INCONDICIONALMENTE (prioridade sobre inconsistências acumuladas). */
  addNaoImplementado(codigo: string, campo: string, detail: string): void {
    this.estado = "NAO_IMPLEMENTADO";
    this.erros.push(this.build(codigo, campo, detail));
  }

  addFalhaTecnica(err: unknown): void {
    this.estado = "FALHA_TECNICA";
    const mensagem = err instanceof Error ? err.message : String(err);
    const c = catalogo("VSN-999");
    this.erros.push({
      type: this.typeURI("VSN-999"),
      title: c.titulo,
      code: "VSN-999",
      pointer: `#/itens/${this.index}`,
      detail: mensagem,
    });
  }

  private build(codigo: string, campo: string, detail: string): ErroDetalhe {
    const c = catalogo(codigo as never);
    return {
      type: this.typeURI(c.code),
      title: c.titulo,
      code: c.code,
      pointer: campo === null ? `#/itens/${this.index}` : `#/itens/${this.index}/${campo}`,
      detail,
    };
  }

  private typeURI(codigo: string): string {
    return `${this.baseURL}/calculadora/observabilidade/simples-nacional/erros?codigo=${codigo}`;
  }

  getEstado(): EstadoItemSimples {
    return this.estado;
  }

  getErros(): ErroDetalhe[] {
    return [...this.erros];
  }

  hasErros(): boolean {
    return this.erros.length > 0;
  }
}

// ─── Contexto e serviço ──────────────────────────────────────────────────────

interface ContextoOperacaoSimples {
  data: string;
  tpDoc: number;
  regime: RegimeApuracaoSimples;
  tpEnteGov: number | null;
  fatorTransicaoCompraGov: JBD | null;
}

export class SimplesNacionalObservabilidadeService {
  private readonly parametros: ParametroCalculoSimplesService;

  constructor(
    private readonly repos: RepositoriosSimples,
    parametros?: ParametroCalculoSimplesService,
  ) {
    this.parametros = parametros ?? new ParametroCalculoSimplesService(repos);
  }

  processarOperacao(operacao: OperacaoSimplesInput, baseURL: string): ObservabilidadeSimplesDomain {
    // 1. Validar campos globais e escopo — falha lança ErrosCalculoException (HTTP 422).
    const errosGlobais = this.validarCamposGlobais(operacao, baseURL);
    if (errosGlobais.length > 0) {
      throw new ErrosCalculoException(errosGlobais);
    }

    const data = parseLocalDate(operacao.data!.trim())!;

    // 2. Linha vigente da matriz de regime (VSN-026 quando ausente — erro global).
    const regime = this.parametros.buscarRegimeApuracao(resolverRegime(operacao), data);
    if (regime === null) {
      throw new ErrosCalculoException([
        buildErroGlobal("VSN-026", "CRT", baseURL, (code) =>
          `Não há parametrização de regime de apuração do Simples Nacional vigente ` +
          `para CRT=${operacao.CRT} e tpRegimeIBSCBS=${operacao.tpRegimeIBSCBS} na data '${formatarData(data)}'.`,
        ),
      ]);
    }

    // 3. Fator de transição de compra governamental (VSN-025 — nunca fator zero implícito).
    const tpEnteGov = parseInteiro(operacao.tpEnteGov);
    let fatorTransicao: JBD | null = null;
    if (tpEnteGov !== null && tpEnteGov !== 1) {
      fatorTransicao = this.parametros.buscarFatorTransicaoCompraGov(data);
      if (fatorTransicao === null) {
        throw new ErrosCalculoException([
          buildErroGlobal("VSN-025", "tpEnteGov", baseURL, () =>
            `Não há parametrização de transição de compra governamental vigente ` +
            `para a data '${formatarData(data)}'.`,
          ),
        ]);
      }
    }

    const contexto: ContextoOperacaoSimples = {
      data,
      tpDoc: parseInteiro(operacao.tpDoc!.trim())!,
      regime,
      tpEnteGov,
      fatorTransicaoCompraGov: fatorTransicao,
    };
    const itens = operacao.itens ?? [];

    // 4. Processar itens (sequencial — mesma saída do paralelismo Java).
    const resultados = itens
      .map((item, index) => this.processarItem(item, index, contexto, baseURL))
      .sort((a, b) => a.nObj - b.nObj);

    // 5. Totalizar: CALCULADO e NAO_CALCULADO têm tribCalc (o segundo só
    // contribui para vRBSNtot); erro/NAO_IMPLEMENTADO não contribuem.
    const comTribCalc = resultados.filter((r) => r.tribCalc !== undefined);
    const total = comTribCalc.length > 0 ? criarTotal(comTribCalc) : undefined;

    return {
      oper: {
        data: operacao.data ?? undefined,
        tpDoc: operacao.tpDoc ?? undefined,
        CRT: operacao.CRT ?? undefined,
        tpRegimeIBSCBS: operacao.tpRegimeIBSCBS ?? undefined,
        tpEnteGov: operacao.tpEnteGov ?? undefined,
      },
      objetos: resultados,
      total,
    };
  }

  // ─── Processamento por item ────────────────────────────────────────────────

  private processarItem(
    item: ItemSimplesInput,
    index: number,
    contexto: ContextoOperacaoSimples,
    baseURL: string,
  ): ObjetoSimplesDomain {
    const collector = new ItemCollectorSimples(index, baseURL);

    const nObj = item.numero ?? null;
    if (nObj === null) {
      collector.addErroValidacao("VSN-010", "numero", "O número do item é obrigatório.");
    }

    // 0. PRIORIDADE MÁXIMA — primeira consulta de banco do item: cClassTrib
    // vinculado a tratamento sem implementação (TRTR_IN_POSSUI_AJUSTE).
    // Encerra o item: NAO_IMPLEMENTADO (VSN-027), sem tribCalc e fora dos totais.
    if (this.cClassTribNaoImplementado(item.cClassTrib, contexto, collector)) {
      return {
        nObj: nObj ?? index + 1,
        estadoItem: collector.getEstado(),
        erros: collector.getErros(),
      };
    }

    // 1. Validar e converter os insumos monetários do item.
    const baseCalculo = this.validarDecimal(
      item.baseCalculo,
      collector,
      "baseCalculo",
      "VSN-001",
      "VSN-002",
    );
    const valorIs = this.validarDecimal(
      item.valorImpostoSeletivo,
      collector,
      "valorImpostoSeletivo",
      "VSN-003",
      "VSN-003",
    );

    // 2. Resolver o tipo de receita bruta (tpRBSN do cClassTrib + efeito da tabela).
    const tipoReceita = this.resolverTipoReceitaBruta(item.cClassTrib, contexto, collector);

    // 3. Validar o cAtivSN — inválido NÃO é erro: leva a NAO_CALCULADO.
    const cAtivSNValido = this.validarCAtivSN(item.cAtivSN, tipoReceita, contexto, collector);

    // 4. Alíquotas obrigatórias condicionais (só quando o cálculo as usa).
    const aliquotasExigidas =
      cAtivSNValido && tipoReceita !== null && tipoReceita.exigeAliquota;
    const pIbsExigida = aliquotasExigidas && contexto.regime.geraIbs;

    const pCbs = this.validarAliquota(item.pCBSSN, aliquotasExigidas, collector, "pCBSSN", "VSN-004", "VSN-005");
    const pIbs = this.validarAliquota(item.pIBSSN, pIbsExigida, collector, "pIBSSN", "VSN-006", "VSN-007");

    // 5. Erros de validação → não calcula.
    if (collector.hasErros()) {
      return {
        nObj: nObj ?? index + 1,
        estadoItem: collector.getEstado(),
        erros: collector.getErros(),
      };
    }

    // 6. Calcular (serviço puro; compra governamental do contexto da operação).
    try {
      const insumo: InsumoCalculoSimples = {
        regime: contexto.regime,
        tipoReceitaBruta: tipoReceita!,
        cAtivSNValido,
        baseCalculo: baseCalculo!,
        valorImpostoSeletivo: valorIs!,
        pIBSSN: pIbs,
        pCBSSN: pCbs,
        tpEnteGov: contexto.tpEnteGov,
        fatorTransicaoCompraGov: contexto.fatorTransicaoCompraGov,
      };
      const resultado = calcularItem(insumo);
      return { nObj: nObj!, estadoItem: resultado.estadoItem, tribCalc: resultado.tribCalc };
    } catch (ex) {
      collector.addFalhaTecnica(ex);
      return {
        nObj: nObj ?? index + 1,
        estadoItem: collector.getEstado(),
        erros: collector.getErros(),
      };
    }
  }

  /** Verificação PRIORITÁRIA de implementação do cClassTrib (VSN-027). */
  private cClassTribNaoImplementado(
    cClassTrib: string | null | undefined,
    contexto: ContextoOperacaoSimples,
    collector: ItemCollectorSimples,
  ): boolean {
    if (cClassTrib === null || cClassTrib === undefined || cClassTrib.trim() === "") {
      return false;
    }
    const codigo = cClassTrib.trim();

    if (this.repos.contarTratamentosNaoImplementados(codigo, contexto.data) === 0) {
      return false;
    }

    collector.addNaoImplementado(
      "VSN-027",
      "cClassTrib",
      `A classificação tributária '${codigo}' ainda não possui tratamento implementado no ` +
        `cálculo do Simples Nacional na data '${formatarData(contexto.data)}'. Essa funcionalidade está prevista no ` +
        `roadmap e será disponibilizada em versão futura.`,
    );
    return true;
  }

  /** Resolve o tipo de receita bruta em dois passos (VSN-020/021/022/026). */
  private resolverTipoReceitaBruta(
    cClassTrib: string | null | undefined,
    contexto: ContextoOperacaoSimples,
    collector: ItemCollectorSimples,
  ): TipoReceitaBrutaSimples | null {
    if (cClassTrib === null || cClassTrib === undefined || cClassTrib.trim() === "") {
      collector.addErroValidacao(
        "VSN-020",
        "cClassTrib",
        "O código de classificação tributária (cClassTrib) é obrigatório e não foi informado.",
      );
      return null;
    }
    const codigo = cClassTrib.trim();

    const vigentes = this.repos.buscarVigentesClassificacao(codigo, contexto.data);
    if (vigentes.length === 0) {
      collector.addErroValidacao(
        "VSN-021",
        "cClassTrib",
        `O cClassTrib '${codigo}' não existe ou não está vigente na data '${formatarData(contexto.data)}': ` +
          `o tpRBSN não pôde ser determinado.`,
      );
      return null;
    }

    if (this.repos.contarVinculosClassificacaoComTpDoc(codigo, contexto.tpDoc, contexto.data) === 0) {
      collector.addErroValidacao(
        "VSN-022",
        "cClassTrib",
        `O cClassTrib '${codigo}' não é admissível para o tipo de documento fiscal ${contexto.tpDoc}.`,
      );
      return null;
    }

    const tpRBSN = vigentes[0].tpRBSN;
    const tipoReceita = this.parametros.buscarTipoReceitaBruta(tpRBSN, contexto.data);
    if (tipoReceita === null) {
      collector.addErroValidacao(
        "VSN-026",
        "cClassTrib",
        `Não há parametrização de efeito vigente para o tipo de receita bruta ` +
          `tpRBSN=${tpRBSN} na data '${formatarData(contexto.data)}'.`,
      );
    }
    return tipoReceita;
  }

  /**
   * Valida o cAtivSN. Ausente/desconhecido/fora de vigência/inadmissível no
   * tpDoc NÃO é erro (NAO_CALCULADO). Única exceção com erro: VSN-023
   * (atividade não tributável × tpRBSN vedado — regra UB14-90 da NT).
   */
  private validarCAtivSN(
    cAtivSN: string | null | undefined,
    tipoReceita: TipoReceitaBrutaSimples | null,
    contexto: ContextoOperacaoSimples,
    collector: ItemCollectorSimples,
  ): boolean {
    if (cAtivSN === null || cAtivSN === undefined || cAtivSN.trim() === "") {
      return false;
    }
    const codigo = cAtivSN.trim();

    const atividades: AtividadeSimplesNacional[] =
      this.repos.buscarVigentesPorCAtivSN(codigo, contexto.data);
    if (atividades.length === 0) {
      return false;
    }
    const atividade = atividades[0];

    if (this.repos.contarVinculosComTpDoc(atividade.id, contexto.tpDoc, contexto.data) === 0) {
      return false;
    }

    if (atividade.naoTributavel && tipoReceita !== null && tipoReceita.vedadoNaoTributavel) {
      collector.addErroValidacao(
        "VSN-023",
        "cAtivSN",
        `O código de atividade '${codigo}' (Operações não Tributáveis) é incompatível com ` +
          `cClassTrib de tpRBSN=${tipoReceita.codigo}.`,
      );
    }
    return true;
  }

  /** Valida e converte uma alíquota em texto (ausência só é erro quando exigida). */
  private validarAliquota(
    valor: string | null | undefined,
    exigida: boolean,
    collector: ItemCollectorSimples,
    campo: string,
    codigoAusente: string,
    codigoInvalido: string,
  ): JBD | null {
    if (valor === null || valor === undefined || valor.trim() === "") {
      if (exigida) {
        collector.addErroValidacao(
          codigoAusente,
          campo,
          "A alíquota é exigida para o cálculo do item e não foi informada.",
        );
      }
      return null;
    }
    return converterDecimal(valor, collector, campo, codigoInvalido);
  }

  /** Valida e converte um decimal obrigatório e não negativo em texto. */
  private validarDecimal(
    valor: string | null | undefined,
    collector: ItemCollectorSimples,
    campo: string,
    codigoAusente: string,
    codigoInvalido: string,
  ): JBD | null {
    if (valor === null || valor === undefined || valor.trim() === "") {
      collector.addErroValidacao(codigoAusente, campo, "O campo é obrigatório e não foi informado.");
      return null;
    }
    return converterDecimal(valor, collector, campo, codigoInvalido);
  }

  // ─── Validação global da operação ──────────────────────────────────────────

  private validarCamposGlobais(operacao: OperacaoSimplesInput, baseURL: string): ErroDetalhe[] {
    const erros: ErroDetalhe[] = [];

    if (operacao.id === null || operacao.id === undefined || operacao.id.trim() === "") {
      erros.push(
        buildErroGlobal("VSN-013", "id", baseURL, () =>
          "O identificador da operação (id) é obrigatório.",
        ),
      );
    }
    if (operacao.versao === null || operacao.versao === undefined || operacao.versao.trim() === "") {
      erros.push(
        buildErroGlobal("VSN-013", "versao", baseURL, () =>
          "A versão do payload (versao) é obrigatória.",
        ),
      );
    }

    // A data é validada antes do escopo (o suporte do tpDoc depende dela).
    const data = this.validarData(operacao.data, erros, baseURL);
    this.validarEscopo(operacao, data, erros, baseURL);
    this.validarTpEnteGov(operacao.tpEnteGov, erros, baseURL);

    if (operacao.itens === null || operacao.itens === undefined || operacao.itens.length === 0) {
      erros.push(
        buildErroGlobal("VSN-011", "itens", baseURL, () =>
          "A lista de itens é obrigatória e não pode estar vazia.",
        ),
      );
    }
    return erros;
  }

  /** Validação global de escopo (regras C21a-10/20/30 da NT, msg 1275). */
  private validarEscopo(
    operacao: OperacaoSimplesInput,
    data: string | null,
    erros: ErroDetalhe[],
    baseURL: string,
  ): void {
    // tpDoc: obrigatório e suportado pelo cálculo na data do fato gerador.
    if (operacao.tpDoc === null || operacao.tpDoc === undefined || operacao.tpDoc.trim() === "") {
      erros.push(
        buildErroGlobal("VSN-014", "tpDoc", baseURL, () =>
          "O tipo de documento fiscal (tpDoc) é obrigatório e não foi informado.",
        ),
      );
    } else {
      const tpDoc = parseInteiro(operacao.tpDoc);
      if (tpDoc === null) {
        erros.push(
          buildErroGlobal("VSN-015", "tpDoc", baseURL, () =>
            `Tipo de documento não suportado pelo cálculo do Simples Nacional, recebido: '${operacao.tpDoc}'.`,
          ),
        );
      } else if (this.parametros.tpDocSemTratamentoCalculadora(tpDoc)) {
        erros.push(
          buildErroGlobal("VSN-015", "tpDoc", baseURL, () =>
            `Tipo de documento fiscal (tpDoc) de código ${tpDoc} ainda não possui ` +
            `tratamento implementado no cálculo do Simples Nacional.`,
          ),
        );
      } else if (data !== null && !this.parametros.tpDocSuportado(tpDoc, data)) {
        erros.push(
          buildErroGlobal("VSN-015", "tpDoc", baseURL, () =>
            `Tipo de documento não suportado pelo cálculo do Simples Nacional, recebido: '${operacao.tpDoc}'.`,
          ),
        );
      }
    }

    // CRT: obrigatório, em {1, 2, 3, 4}.
    const crt = parseInteiro(operacao.CRT);
    if (crt === null || crt < 1 || crt > 4) {
      erros.push(
        buildErroGlobal("VSN-016", "CRT", baseURL, () =>
          `O Código de Regime Tributário (CRT) é obrigatório e deve ser 1, 2, 3 ou 4, ` +
          `recebido: '${operacao.CRT}'.`,
        ),
      );
      return;
    }

    // tpRegimeIBSCBS: opcional; quando informado, em {1, 2}.
    const tpRegimeInformado =
      operacao.tpRegimeIBSCBS !== null &&
      operacao.tpRegimeIBSCBS !== undefined &&
      operacao.tpRegimeIBSCBS.trim() !== "";
    let tpRegime: number | null = null;
    if (tpRegimeInformado) {
      tpRegime = parseInteiro(operacao.tpRegimeIBSCBS);
      if (tpRegime === null || (tpRegime !== 1 && tpRegime !== 2)) {
        erros.push(
          buildErroGlobal("VSN-017", "tpRegimeIBSCBS", baseURL, () =>
            `Tipo de regime de apuração do IBS/CBS inválido, recebido: '${operacao.tpRegimeIBSCBS}' ` +
            `(esperado 1 ou 2).`,
          ),
        );
        return;
      }
    }

    // Incoerências CRT × tpRegimeIBSCBS (C21a-10/20/30, msg 1275).
    if (crt === 4 && tpRegimeInformado) {
      erros.push(
        buildErroGlobal("VSN-018", "tpRegimeIBSCBS", baseURL, () =>
          "CRT=4 (MEI) não admite tpRegimeIBSCBS algum (regra C21a-30 da NT 2026.005).",
        ),
      );
    } else if ((crt === 1 || crt === 2) && tpRegime === 2) {
      erros.push(
        buildErroGlobal("VSN-018", "tpRegimeIBSCBS", baseURL, () =>
          `CRT=${crt} não admite tpRegimeIBSCBS=2 (regra C21a-10 da NT 2026.005).`,
        ),
      );
    } else if (crt === 3 && tpRegime === 1) {
      erros.push(
        buildErroGlobal("VSN-018", "tpRegimeIBSCBS", baseURL, () =>
          "CRT=3 não admite tpRegimeIBSCBS=1 (regra C21a-20 da NT 2026.005).",
        ),
      );
    }

    // Fora do escopo do cálculo assistido do Simples Nacional.
    if (crt === 4) {
      erros.push(
        buildErroGlobal("VSN-019", "CRT", baseURL, () =>
          "Operação fora do escopo do cálculo assistido do Simples Nacional: MEI (CRT=4) " +
          "está fora do Evento de Tributação do Simples Nacional.",
        ),
      );
    }
    if (tpRegime === 1) {
      erros.push(
        buildErroGlobal("VSN-019", "tpRegimeIBSCBS", baseURL, () =>
          "Operação fora do escopo do cálculo assistido do Simples Nacional: optante pelo regime " +
          "regular do IBS/CBS (tpRegimeIBSCBS=1) tem a tributação calculada pelo regime " +
          "regular, não por este endpoint.",
        ),
      );
    }
    if (crt === 3 && !tpRegimeInformado) {
      erros.push(
        buildErroGlobal("VSN-019", "CRT", baseURL, () =>
          "Operação fora do escopo do cálculo assistido do Simples Nacional: CRT=3 sem " +
          "tpRegimeIBSCBS=2 (regime normal puro) não é Simples Nacional.",
        ),
      );
    }
  }

  /** Validação GLOBAL do tpEnteGov quando informado (VSN-024). */
  private validarTpEnteGov(
    tpEnteGov: string | null | undefined,
    erros: ErroDetalhe[],
    baseURL: string,
  ): void {
    if (tpEnteGov === null || tpEnteGov === undefined || tpEnteGov.trim() === "") {
      return;
    }
    const valor = parseInteiro(tpEnteGov);
    if (valor === null || valor < 1 || valor > 4) {
      erros.push(
        buildErroGlobal("VSN-024", "tpEnteGov", baseURL, () =>
          `Tipo de ente governamental inválido, recebido: '${tpEnteGov}' (esperado 1, 2, 3 ou 4).`,
        ),
      );
    }
  }

  /** Valida a data do fato gerador (VSN-012). Retorna ISO yyyy-MM-dd ou null. */
  private validarData(data: string | null | undefined, erros: ErroDetalhe[], baseURL: string): string | null {
    if (data === null || data === undefined || data.trim() === "") {
      erros.push(
        buildErroGlobal("VSN-012", "data", baseURL, () => "A data do fato gerador é obrigatória."),
      );
      return null;
    }
    const parseada = parseLocalDate(data.trim());
    if (parseada === null) {
      erros.push(
        buildErroGlobal("VSN-012", "data", baseURL, () =>
          `Data inválida, recebido: '${data}' (esperado YYYY-MM-DD).`,
        ),
      );
      return null;
    }
    return parseada;
  }
}

// ─── Totalização (TotalSimplesDomain.create) ─────────────────────────────────

/** Consolida os totais dos itens com tribCalc (CALCULADO e NAO_CALCULADO). */
export function criarTotal(objetos: ObjetoSimplesDomain[]): TotalSimplesDomain {
  const vIBSSNtot = somarPresentes(objetos, (t) => t.vIBSSN ?? null);
  const vCBSSNtot = somarPresentes(objetos, (t) => t.vCBSSN ?? null);
  const totalIs = somarPresentes(objetos, (t) => (t.IS ? t.IS.valor : null));

  let totalTributos: JBD | null = null;
  if (vIBSSNtot !== null || vCBSSNtot !== null || totalIs !== null) {
    totalTributos = totalizar(
      [vIBSSNtot, vCBSSNtot, totalIs].filter((v): v is JBD => v !== null),
    );
  }

  const total: TotalSimplesDomain = {
    vRBSNtot: somarPresentes(objetos, (t) => t.vRBSNitem)!,
  };
  const vBC = somarPresentes(objetos, (t) => t.vBC ?? null);
  const vIBSSNtotPendSusp = somarPresentes(objetos, (t) => t.vIBSPendSusp ?? null);
  const vCBSSNtotPendSusp = somarPresentes(objetos, (t) => t.vCBSPendSusp ?? null);
  if (vBC !== null) total.vBC = vBC;
  if (vIBSSNtot !== null) total.vIBSSNtot = vIBSSNtot;
  if (vIBSSNtotPendSusp !== null) total.vIBSSNtotPendSusp = vIBSSNtotPendSusp;
  if (vCBSSNtot !== null) total.vCBSSNtot = vCBSSNtot;
  if (vCBSSNtotPendSusp !== null) total.vCBSSNtotPendSusp = vCBSSNtotPendSusp;
  if (totalIs !== null) total.totalIs = totalIs;
  if (totalTributos !== null) total.totalTributos = totalTributos;
  return total;
}

/** Soma os valores não nulos do campo; null quando nenhum item o apresenta. */
function somarPresentes(
  objetos: ObjetoSimplesDomain[],
  campo: (t: TributosSimplesDomain) => JBD | null,
): JBD | null {
  const valores = objetos
    .map((o) => (o.tribCalc ? campo(o.tribCalc) : null))
    .filter((v): v is JBD => v !== null && v !== undefined);
  return valores.length === 0 ? null : totalizar(valores);
}

// ─── Helpers de validação/conversão ──────────────────────────────────────────

/** Erro global com type do catálogo e pointer "#/campo". */
function buildErroGlobal(
  codigo: string,
  campo: string,
  baseURL: string,
  detail: (code: string) => string,
): ErroDetalhe {
  const c = catalogo(codigo as never);
  return {
    type: `${baseURL}/calculadora/observabilidade/simples-nacional/erros?codigo=${c.code}`,
    title: c.titulo,
    code: c.code,
    pointer: `#/${campo}`,
    detail: detail(c.code),
  };
}

/** Regime de cálculo de uma operação JÁ APROVADA pela validação de escopo. */
function resolverRegime(operacao: OperacaoSimplesInput): RegimeCalculoSimples {
  const crt = parseInteiro(operacao.CRT!.trim())!;
  switch (crt) {
    case 1:
      return "CRT_1";
    case 2:
      return "CRT_2";
    default:
      return "CRT_3_TPREGIME_2";
  }
}

/** Converte texto em inteiro de forma tolerante (null quando inválido). PARITY: Integer.valueOf — só dígitos com sinal. */
export function parseInteiro(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor.trim() === "") {
    return null;
  }
  const s = valor.trim();
  if (!/^[+-]?\d+$/.test(s)) {
    return null;
  }
  const n = parseInt(s, 10);
  // PARITY: Integer.valueOf lança NumberFormatException fora do range de 32 bits.
  if (n < -2147483648 || n > 2147483647) {
    return null;
  }
  return n;
}

/**
 * PARITY: LocalDate.parse — ISO yyyy-MM-dd estrito (2 dígitos de mês/dia) com
 * validação de calendário real (2027-02-30 é inválido no Java).
 */
export function parseLocalDate(texto: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const ano = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  const dia = parseInt(m[3], 10);
  if (mes < 1 || mes > 12) return null;
  const diasNoMes = [31, anoBissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dia < 1 || dia > diasNoMes[mes - 1]) return null;
  return texto;
}

function anoBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/** Exibe a data como o toString() do LocalDate Java (yyyy-MM-dd). */
function formatarData(iso: string): string {
  return iso;
}

/** Converte um decimal em texto (BigDecimal); acumula erro negativo/inválido. */
function converterDecimal(
  valor: string,
  collector: ItemCollectorSimples,
  campo: string,
  codigoInvalido: string,
): JBD | null {
  try {
    const convertido = JBD.parse(valor.trim());
    if (convertido.signum() < 0) {
      collector.addErroValidacao(
        codigoInvalido,
        campo,
        `O valor não pode ser negativo, recebido: '${valor}'.`,
      );
      return null;
    }
    return convertido;
  } catch {
    collector.addErroValidacao(
      codigoInvalido,
      campo,
      `O valor não é um número decimal válido, recebido: '${valor}'.`,
    );
    return null;
  }
}
