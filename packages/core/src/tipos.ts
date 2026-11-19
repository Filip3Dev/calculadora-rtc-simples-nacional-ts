/**
 * Tipos de entrada e saída do cálculo do Simples Nacional — porte dos
 * records Java (OperacaoSimplesInput, ItemSimplesInput, *SimplesDomain).
 *
 * PARITY: a entrada recebe valores como STRING (validação tolerante com
 * códigos VSN-, como o contrato oficial). Os tipos de saída usam JBD no
 * domínio e são serializados por serialize.ts (ordem NON_NULL fixa,
 * decimais como strings formatadas).
 */
import type { JBD } from "./jbd.js";
import type { ErroDetalhe } from "./erros.js";

// ─── Entrada (contrato HTTP — tudo string, como o Java) ──────────────────────

export interface OperacaoSimplesInput {
  id?: string | null;
  versao?: string | null;
  data?: string | null;
  tpDoc?: string | null;
  /** @JsonProperty("CRT") — maiúsculo no JSON. */
  CRT?: string | null;
  tpRegimeIBSCBS?: string | null;
  tpEnteGov?: string | null;
  itens?: Array<ItemSimplesInput> | null;
}

export interface ItemSimplesInput {
  numero?: number | null;
  cAtivSN?: string | null;
  cClassTrib?: string | null;
  baseCalculo?: string | null;
  valorImpostoSeletivo?: string | null;
  pIBSSN?: string | null;
  pCBSSN?: string | null;
}

// ─── Domínio (linhas de banco, equivalentes das entidades JPA) ───────────────

export interface RegimeApuracaoSimples {
  id: number;
  crt: number;
  tpRegimeIBSCBS: number | null;
  descricao: string;
  geraIbs: boolean;
  destinoDevido: DestinoValorSimples;
  destinoPendenteSuspenso: DestinoValorSimples;
  inicioVigencia: string;
  fimVigencia: string | null;
}

export type DestinoValorSimples = "DEVIDO" | "PENDENTE_SUSPENSO" | "ZERO";

export interface TipoReceitaBrutaSimples {
  id: number;
  codigo: number;
  descricao: string;
  compoeReceita: boolean;
  impostoSeletivoCompoeReceita: boolean;
  fatorReceita: JBD;
  pendenteSuspenso: boolean;
  exigeAliquota: boolean;
  vedadoNaoTributavel: boolean;
  inicioVigencia: string;
  fimVigencia: string | null;
}

export interface TransicaoAliquotaCompraGovSimples {
  id: number;
  fator: JBD;
  inicioVigencia: string;
  fimVigencia: string | null;
}

export interface ClassificacaoTributariaSimples {
  id: number;
  codigo: string;
  tpRBSN: number;
  inicioVigencia: string;
  fimVigencia: string | null;
}

export interface AtividadeSimplesNacional {
  id: number;
  ordem: number;
  descricao: string;
  anexoSemFatorR: string | null;
  anexoComFatorR: string | null;
  rotulo: string;
  rotuloCurto: string;
  inicioVigencia: string;
  fimVigencia: string | null;
  cAtivSN: string | null;
  naoTributavel: boolean;
}

export interface VersaoBaseDados {
  id: number;
  data: string;
  descricao: string;
  numeroVersao: string;
}

// ─── Estado / regime de cálculo ──────────────────────────────────────────────

export type EstadoItemSimples =
  | "CALCULADO"
  | "NAO_CALCULADO"
  | "NAO_IMPLEMENTADO"
  | "INCONSISTENCIA_ENTRADA"
  | "FALHA_TECNICA";

/** RegimeCalculoSimplesEnum — combinações aprovadas pela validação de escopo. */
export type RegimeCalculoSimples = "CRT_1" | "CRT_2" | "CRT_3_TPREGIME_2";

export type ModoFatorR = "NAO_APLICAVEL" | "OPCIONAL" | "INDISPONIVEL" | "OBRIGATORIO";

// ─── Saída (domínio interno; serialização em serialize.ts) ───────────────────

export interface TributosSimplesDomain {
  vRBSNitem: JBD;
  tpRBSN: number;
  tpRBSNDescricao: string;
  vBC?: JBD;
  pIBSSN?: JBD;
  vIBSSN?: JBD;
  vIBSPendSusp?: JBD;
  pCBSSN?: JBD;
  vCBSSN?: JBD;
  vCBSPendSusp?: JBD;
  IS?: { valor: JBD };
  totalItem?: JBD;
}

export interface ObjetoSimplesDomain {
  nObj: number;
  estadoItem: EstadoItemSimples;
  tribCalc?: TributosSimplesDomain;
  erros?: ErroDetalhe[];
}

export interface TotalSimplesDomain {
  vRBSNtot: JBD;
  vBC?: JBD;
  vIBSSNtot?: JBD;
  vIBSSNtotPendSusp?: JBD;
  vCBSSNtot?: JBD;
  vCBSSNtotPendSusp?: JBD;
  totalIs?: JBD;
  totalTributos?: JBD;
}

export interface OperacaoSimplesDomain {
  data?: string | null;
  tpDoc?: string | null;
  CRT?: string | null;
  tpRegimeIBSCBS?: string | null;
  tpEnteGov?: string | null;
}

export interface ObservabilidadeSimplesDomain {
  oper: OperacaoSimplesDomain;
  objetos: ObjetoSimplesDomain[];
  total?: TotalSimplesDomain;
}
