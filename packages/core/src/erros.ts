/**
 * Catálogo de códigos de validação do Simples Nacional (VSN-) e tipos de
 * erro compartilhados — porte fiel de CodigoValidacaoSimples/ErroDetalhe/
 * ErrosCalculoException (NT 2026.005).
 *
 * PARITY: títulos e descrições são byte-idênticos ao enum Java. VSN-008/009
 * estão APOSENTADOS (números não reutilizados); novos erros a partir de
 * VSN-014.
 */

export interface ErroDetalhe {
  /** URI do catálogo ({baseURL}/calculadora/observabilidade/simples-nacional/erros?codigo=VSN-x); null em erros sem catálogo. */
  type: string | null;
  title: string | null;
  code: string | null;
  /** JSON Pointer do campo (ex.: "#/itens/0/cClassTrib", "#/tpDoc"). */
  pointer: string | null;
  detail: string | null;
}

/** Exceção de validação global → HTTP 422 ProblemDetail (ApiExceptionHandler). */
export class ErrosCalculoException extends Error {
  readonly erros: ReadonlyArray<ErroDetalhe>;

  constructor(erros: ErroDetalhe[]) {
    super("Erros de cálculo encontrados");
    this.erros = Object.freeze([...erros]);
  }
}

export type CodigoValidacaoSimples =
  | "VSN-000"
  | "VSN-001"
  | "VSN-002"
  | "VSN-003"
  | "VSN-004"
  | "VSN-005"
  | "VSN-006"
  | "VSN-007"
  // VSN-008 e VSN-009 (origem de alíquota): APOSENTADOS — números não reutilizados.
  | "VSN-010"
  | "VSN-011"
  | "VSN-012"
  | "VSN-013"
  | "VSN-014"
  | "VSN-015"
  | "VSN-016"
  | "VSN-017"
  | "VSN-018"
  | "VSN-019"
  | "VSN-020"
  | "VSN-021"
  | "VSN-022"
  | "VSN-023"
  | "VSN-024"
  | "VSN-025"
  | "VSN-026"
  | "VSN-027"
  | "VSN-999";

interface EntradaCatalogo {
  code: CodigoValidacaoSimples;
  titulo: string;
  descricao: string;
}

const CATALOGO: ReadonlyArray<EntradaCatalogo> = [
  {
    code: "VSN-001",
    titulo: "Base de cálculo do Simples ausente",
    descricao:
      "A base de cálculo do Simples Nacional é obrigatória e não foi informada.",
  },
  {
    code: "VSN-002",
    titulo: "Base de cálculo do Simples inválida (negativa/não numérica)",
    descricao:
      "A base de cálculo informada não é um número decimal válido ou é negativa.",
  },
  {
    code: "VSN-003",
    titulo: "Valor do Imposto Seletivo inválido (negativo/não numérico)",
    descricao:
      "O valor do Imposto Seletivo (vIS) informado não é um número decimal válido ou é negativo.",
  },
  {
    code: "VSN-004",
    titulo: "Alíquota pCBSSN ausente",
    descricao:
      "A alíquota efetiva de CBS do Simples Nacional (pCBSSN) é exigida para o cálculo do item e não foi informada.",
  },
  {
    code: "VSN-005",
    titulo: "Alíquota pCBSSN inválida (negativa/não numérica)",
    descricao:
      "A alíquota efetiva de CBS do Simples Nacional (pCBSSN) informada não é um número decimal válido ou é negativa.",
  },
  {
    code: "VSN-006",
    titulo: "Alíquota pIBSSN ausente",
    descricao:
      "A alíquota efetiva de IBS do Simples Nacional (pIBSSN) é exigida para o cálculo do item e não foi informada.",
  },
  {
    code: "VSN-007",
    titulo: "Alíquota pIBSSN inválida (negativa/não numérica)",
    descricao:
      "A alíquota efetiva de IBS do Simples Nacional (pIBSSN) informada não é um número decimal válido ou é negativa.",
  },
  {
    code: "VSN-010",
    titulo: "Número do item ausente",
    descricao: "O número (identificador) do item é obrigatório e não foi informado.",
  },
  {
    code: "VSN-011",
    titulo: "Lista de itens vazia",
    descricao: "A lista de itens da operação é obrigatória e não pode estar vazia.",
  },
  {
    code: "VSN-012",
    titulo: "Data do fato gerador ausente/inválida",
    descricao:
      "A data do fato gerador é obrigatória e deve estar no formato de data (YYYY-MM-DD).",
  },
  {
    code: "VSN-013",
    titulo: "Dado global obrigatório ausente",
    descricao:
      "Um campo global obrigatório da operação (id ou versao) não foi informado.",
  },
  {
    code: "VSN-014",
    titulo: "Tipo de documento fiscal (tpDoc) ausente",
    descricao: "O tipo de documento fiscal (tpDoc) é obrigatório e não foi informado.",
  },
  {
    code: "VSN-015",
    titulo: "Tipo de documento fiscal (tpDoc) não suportado",
    descricao:
      "O tipo de documento fiscal (tpDoc) informado não está habilitado para o cálculo do Simples " +
      "Nacional na data do fato gerador. A habilitação de documentos é parametrizada em banco " +
      "de dados (tabela de tipos de DFe do cálculo do Simples), conforme as NTs publicadas.",
  },
  {
    code: "VSN-016",
    titulo: "Código de Regime Tributário (CRT) ausente/inválido",
    descricao: "O Código de Regime Tributário (CRT) é obrigatório e deve ser 1, 2, 3 ou 4.",
  },
  {
    code: "VSN-017",
    titulo: "Tipo de regime do IBS/CBS (tpRegimeIBSCBS) inválido",
    descricao:
      "O tipo de regime de apuração do IBS/CBS (tpRegimeIBSCBS), quando informado, deve ser 1 ou 2.",
  },
  {
    code: "VSN-018",
    titulo: "tpRegimeIBSCBS incompatível com o CRT",
    descricao:
      "A combinação de CRT e tpRegimeIBSCBS informada é incoerente (regras C21a-10/20/30 da NT 2026.005): " +
      "CRT 1, 2 ou 4 não admite tpRegimeIBSCBS=2; CRT 3 não admite tpRegimeIBSCBS=1; " +
      "CRT 4 não admite tpRegimeIBSCBS algum.",
  },
  {
    code: "VSN-019",
    titulo: "Operação fora do escopo do cálculo assistido do Simples Nacional",
    descricao:
      "A operação não é calculada por este endpoint: optante pelo regime regular do IBS/CBS " +
      "(tpRegimeIBSCBS=1), MEI (CRT=4) ou regime normal puro (CRT=3 sem tpRegimeIBSCBS=2).",
  },
  {
    code: "VSN-020",
    titulo: "Código de Classificação Tributária (cClassTrib) ausente",
    descricao:
      "O código de classificação tributária do IBS/CBS (cClassTrib) é obrigatório e não foi informado.",
  },
  {
    code: "VSN-021",
    titulo: "cClassTrib desconhecido ou fora de vigência",
    descricao:
      "O cClassTrib informado não existe ou não está vigente na data do fato gerador: " +
      "o Tipo de Receita Bruta do Simples Nacional (tpRBSN) não pôde ser determinado.",
  },
  {
    code: "VSN-022",
    titulo: "cClassTrib incompatível com o tpDoc",
    descricao:
      "O cClassTrib informado não é admissível para o tipo de documento fiscal (tpDoc) da operação.",
  },
  {
    code: "VSN-023",
    titulo: "Código de Atividade do Simples Nacional incompatível com cClassTrib",
    descricao:
      "O código de atividade cAtivSN='90' (Operações não Tributáveis) é incompatível com cClassTrib " +
      "cujo tpRBSN esteja entre 1 e 5 (regra UB14-90 da NT 2026.005).",
  },
  {
    code: "VSN-024",
    titulo: "Tipo de ente governamental (tpEnteGov) inválido",
    descricao:
      "O tipo de ente governamental (tpEnteGov), quando informado, deve ser 1 (União), 2 (Estado), " +
      "3 (Distrito Federal) ou 4 (Município). O campo é da operação — espelha a tag " +
      "gCompraGov/tpEnteGov da identificação da nota (grupo B/ide do leiaute do DF-e) — e " +
      "sua invalidade rejeita a operação inteira.",
  },
  {
    code: "VSN-025",
    titulo: "Parametrização de compra governamental indisponível para a data",
    descricao:
      "A data do fato gerador está fora de todas as vigências do parâmetro de transição de alíquotas " +
      "de compra governamental do Simples Nacional (NT 2026.005, seção 5.3.3; arts. 372 e 473 " +
      "da LC 214/2025). Como o tpEnteGov é dado da operação, a falha rejeita a operação " +
      "inteira.",
  },
  {
    code: "VSN-026",
    titulo: "Parametrização do cálculo do Simples Nacional indisponível para a data",
    descricao:
      "Não há linha vigente, na data do fato gerador, em uma tabela de parametrização do cálculo do " +
      "Simples Nacional (efeito do tipo de receita bruta ou matriz de regime de apuração). " +
      "O cálculo nunca assume comportamento implícito: a parametrização deve ser corrigida " +
      "por script de migração.",
  },
  {
    code: "VSN-027",
    titulo: "cClassTrib sem tratamento implementado no cálculo do Simples Nacional",
    descricao:
      "A classificação tributária (cClassTrib) informada está vinculada, na data do fato gerador, a " +
      "tratamento tributário marcado como ainda não implementado na Calculadora (indicador de " +
      "ajuste do tratamento tributário). O item é reportado com o estado NAO_IMPLEMENTADO, " +
      "sem cálculo e fora dos totais; a funcionalidade está prevista no roadmap e será " +
      "disponibilizada em versão futura.",
  },
  {
    code: "VSN-000",
    titulo: "Erro de validação não categorizado",
    descricao: "O tipo de validação aplicado não possui uma categoria específica.",
  },
  {
    code: "VSN-999",
    titulo: "Falha técnica no cálculo do item",
    descricao: "Ocorreu uma falha técnica inesperada durante o cálculo do item.",
  },
];

const CODE_INDEX = new Map<string, EntradaCatalogo>(
  CATALOGO.map((e) => [e.code, e]),
);

export interface ErroDescricaoSimples {
  codigo: string;
  titulo: string;
  descricao: string;
}

/** Equivalente a CodigoValidacaoSimples.fromCodigo().buscarPorCodigo(). */
export function buscarErroPorCodigo(codigo: string | null): ErroDescricaoSimples | null {
  if (codigo === null) return null;
  const entrada = CODE_INDEX.get(codigo);
  return entrada
    ? { codigo: entrada.code, titulo: entrada.titulo, descricao: entrada.descricao }
    : null;
}

/** Lookup interno (título/descrição do código) para compor ErroDetalhe. */
export function catalogo(codigo: CodigoValidacaoSimples): EntradaCatalogo {
  const entrada = CODE_INDEX.get(codigo);
  if (!entrada) throw new Error(`Código não catalogado: ${codigo}`);
  return entrada;
}
