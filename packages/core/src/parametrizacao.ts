/**
 * Fachada de resolução dos parâmetros do cálculo do Simples Nacional —
 * porte fiel de ParametroCalculoSimplesService. Todos os lookups usam a
 * DATA DO FATO GERADOR, nunca a data corrente. Retorno vazio = falha de
 * parametrização (VSN-015/VSN-025/VSN-026 no chamador — nunca implícito).
 */
import type { RepositoriosSimples } from "./db/repositorios.js";
import type {
  RegimeApuracaoSimples,
  RegimeCalculoSimples,
  TipoReceitaBrutaSimples,
} from "./tipos.js";
import { JBD } from "./jbd.js";

/** tpDocs com parametrização conhecida mas SEM tratamento nos endpoints (hardcoded no Java). */
const TPDOCS_SEM_TRATAMENTO_CALCULADORA: ReadonlySet<number> = new Set([77, 94]);

export class ParametroCalculoSimplesService {
  constructor(private readonly repos: RepositoriosSimples) {}

  /** tpDoc suportado pelo cálculo na data (TIPO_DFE_CALCULO_SIMPLES_NACIONAL). */
  tpDocSuportado(tpDoc: number, data: string): boolean {
    return this.repos.contarVinculosVigentesTipoDfe(tpDoc, data) > 0;
  }

  /** Documento com parametrização conhecida, mas sem tratamento implementado. */
  tpDocSemTratamentoCalculadora(tpDoc: number): boolean {
    return TPDOCS_SEM_TRATAMENTO_CALCULADORA.has(tpDoc);
  }

  /** Efeito do tpRBSN vigente na data. null = falha de parametrização (VSN-026). */
  buscarTipoReceitaBruta(tpRBSN: number, data: string): TipoReceitaBrutaSimples | null {
    const vigentes = this.repos.buscarVigentesPorCodigoTipoReceita(tpRBSN, data);
    return vigentes.length > 0 ? vigentes[0] : null;
  }

  /** Linha vigente da matriz de regime para o regime informado. null = VSN-026. */
  buscarRegimeApuracao(regime: RegimeCalculoSimples, data: string): RegimeApuracaoSimples | null {
    const vigentes =
      regime === "CRT_1"
        ? this.repos.buscarVigentesRegime(1, null, data)
        : regime === "CRT_2"
          ? this.repos.buscarVigentesRegime(2, null, data)
          : this.repos.buscarVigentesRegime(3, 2, data);
    return vigentes.length > 0 ? vigentes[0] : null;
  }

  /** Fator de transição de compra governamental vigente (tpEnteGov 2-4). null = VSN-025. */
  buscarFatorTransicaoCompraGov(data: string): JBD | null {
    const vigentes = this.repos.buscarVigentesTransicao(data);
    return vigentes.length > 0 ? vigentes[0].fator : null;
  }
}
