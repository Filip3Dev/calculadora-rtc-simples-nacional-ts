/**
 * Serviço de cálculo do Simples Nacional — porte fiel de
 * SimplesNacionalCalculoService (NT 2026.005 v1.00, seções 5.3.2 a 5.3.4).
 *
 * Serviço PURO: recebe no insumo todos os parâmetros já resolvidos e
 * validados pelo serviço de observabilidade; não acessa banco. Três eixos:
 *   1. transformação de alíquotas por compra governamental (pipeline);
 *   2. matriz de regime (quais campos geram e destino dos valores);
 *   3. efeito do tipo de receita bruta (fração tributada × devido/pendente).
 *
 * PARITY: cada arredondamento/totalização usa jbd.ts (8 casas HALF_EVEN,
 * arredondamento único ao final); totalizar NÃO arredonda intermediário.
 */
import { JBD, multiplicar, subtrair, totalizar, dividirPorCem } from "./jbd.js";
import type {
  DestinoValorSimples,
  EstadoItemSimples,
  RegimeApuracaoSimples,
  TipoReceitaBrutaSimples,
  TributosSimplesDomain,
} from "./tipos.js";

/** Insumos já resolvidos, validados e convertidos de um item. */
export interface InsumoCalculoSimples {
  regime: RegimeApuracaoSimples;
  tipoReceitaBruta: TipoReceitaBrutaSimples;
  /** true quando cAtivSN informado, vigente e admissível para o tpDoc. */
  cAtivSNValido: boolean;
  /** Base de cálculo do item (sem o vIS somado). */
  baseCalculo: JBD;
  /** vIS já calculado (repasse). */
  valorImpostoSeletivo: JBD;
  /** Alíquota efetiva do Simples para o IBS, em pontos percentuais (null = dispensada). */
  pIBSSN: JBD | null;
  /** Alíquota efetiva do Simples para a CBS, em pontos percentuais (null = dispensada). */
  pCBSSN: JBD | null;
  /** Tipo de ente governamental adquirente (dado da OPERAÇÃO; null = não informado). */
  tpEnteGov: number | null;
  /** Fator de transição CBS→IBS já resolvido pela vigência da data. */
  fatorTransicaoCompraGov: JBD | null;
}

export interface ResultadoCalculoSimples {
  estadoItem: EstadoItemSimples;
  tribCalc: TributosSimplesDomain;
}

/** Par de alíquotas (pontos percentuais) que atravessa o pipeline. */
interface ParAliquotas {
  pIBSSN: JBD | null;
  pCBSSN: JBD | null;
}

/** Valor de um tributo repartido entre devido e pendente/suspenso. */
interface ValorTributo {
  devido: JBD;
  pendenteSuspenso: JBD;
}

/**
 * PONTO ÚNICO DE DECISÃO DE FLUXO DE CÁLCULO (portar novas regras aqui).
 * Executa: receita bruta do item → curto-circuito NAO_CALCULADO →
 * transformação de alíquotas por compra governamental → matriz de regime
 * × efeito do tipo de receita bruta.
 */
export function calcularItem(insumo: InsumoCalculoSimples): ResultadoCalculoSimples {
  const tipoReceita = insumo.tipoReceitaBruta;

  // Receita bruta do item (NT 2026.005, campo P26). PARITY: a carga oficial
  // traz TRBS_IN_IS_COMPOE_RECEITA=0 em TODAS as vigências (o vIS fica fora
  // da receita bruta — divergência deliberada com o texto da NT).
  const vRBSNitem = tipoReceita.compoeReceita
    ? totalizar(
        tipoReceita.impostoSeletivoCompoeReceita
          ? [insumo.baseCalculo, insumo.valorImpostoSeletivo]
          : [insumo.baseCalculo],
      )
    : JBD.zero(0);

  // cAtivSN ausente/inválido: cálculo não realizado (NÃO é erro) — o item
  // reporta apenas receita bruta e tipo de receita.
  if (!insumo.cAtivSNValido) {
    return {
      estadoItem: "NAO_CALCULADO",
      tribCalc: {
        vRBSNitem,
        tpRBSN: tipoReceita.codigo,
        tpRBSNDescricao: tipoReceita.descricao,
      },
    };
  }

  // Pipeline de transformação de alíquotas por compra governamental.
  const aliquotas = aplicarDeslocamentoCbsIbs(
    aplicarRedutorCompraGovernamental({
      pIBSSN: insumo.pIBSSN,
      pCBSSN: insumo.pCBSSN,
    }),
    insumo.tpEnteGov,
    insumo.fatorTransicaoCompraGov,
  );

  // Matriz de regime × efeito do tipo de receita bruta.
  const fatorReceita = tipoReceita.fatorReceita;
  const pendenteSuspenso = tipoReceita.pendenteSuspenso;

  // Base de cálculo IBS/CBS: fração da receita bruta tributada.
  const vBC = multiplicar(vRBSNitem, fatorReceita)!;

  const valorIbs = valorTributo(vRBSNitem, fatorReceita, aliquotas.pIBSSN);
  const valorCbs = valorTributo(vRBSNitem, fatorReceita, aliquotas.pCBSSN);

  // CRT=2 não gera IBS: campos de IBS não saem na resposta (declarado pelo
  // emitente no gIBSCBS da nota, fora deste endpoint).
  const geraIbs = insumo.regime.geraIbs;
  const ibs = geraIbs ? repartirPorRegime(insumo.regime, valorIbs, pendenteSuspenso) : null;
  const cbs = repartirPorRegime(insumo.regime, valorCbs, pendenteSuspenso);

  // Imposto Seletivo: repasse do valor recebido (sem recalcular).
  const valorIs = insumo.valorImpostoSeletivo;

  // Total do item: somente valores DEVIDOS (pendente/suspenso fora) + IS.
  const totalItem = totalizar(
    [ibs ? ibs.devido : null, cbs.devido, valorIs].filter((v): v is JBD => v !== null),
  );

  const tribCalc: TributosSimplesDomain = {
    vRBSNitem,
    tpRBSN: tipoReceita.codigo,
    tpRBSNDescricao: tipoReceita.descricao,
    vBC,
    pCBSSN: aliquotas.pCBSSN ?? undefined,
    vCBSSN: cbs.devido,
    vCBSPendSusp: cbs.pendenteSuspenso,
    IS: { valor: valorIs },
    totalItem,
  };
  if (geraIbs) {
    tribCalc.pIBSSN = aliquotas.pIBSSN ?? undefined;
    tribCalc.vIBSSN = ibs!.devido;
    tribCalc.vIBSPendSusp = ibs!.pendenteSuspenso;
  }

  return { estadoItem: "CALCULADO", tribCalc };
}

// ─── Pipeline de transformação de alíquotas (compra governamental) ───────────

/**
 * Passo 1 — Redutor de compra governamental (arts. 370/472 da LC 214/2025):
 * DELIBERADAMENTE NÃO APLICADO (a NT 2026.005 usa apenas tpEnteGov; o
 * pRedutor NÃO participa do evento tpEvento 412140). Identidade.
 */
function aplicarRedutorCompraGovernamental(aliquotas: ParAliquotas): ParAliquotas {
  return aliquotas;
}

/**
 * Passo 2 — Deslocamento CBS↔IBS em compras governamentais (arts. 372/473):
 *   tpEnteGov=1 (União): pCBS' = pCBS + pIBS; pIBS' = 0 (estrutural);
 *   tpEnteGov∈{2,3,4}: pIBS' = pIBS + f×pCBS; pCBS' = (1−f)×pCBS.
 * As alíquotas transformadas são as usadas no cálculo E as reportadas.
 * PARITY: para CRT=2 o pIBSSN recebido é APENAS insumo da transformação
 * (tratado como zero quando não informado); os campos de IBS seguem
 * suprimidos (decisão da matriz de regime).
 */
function aplicarDeslocamentoCbsIbs(
  aliquotas: ParAliquotas,
  tpEnteGov: number | null,
  fator: JBD | null,
): ParAliquotas {
  if (tpEnteGov === null || (aliquotas.pIBSSN === null && aliquotas.pCBSSN === null)) {
    return aliquotas;
  }

  const pIbs = aliquotas.pIBSSN ?? JBD.ZERO;
  const pCbs = aliquotas.pCBSSN ?? JBD.ZERO;

  if (tpEnteGov === 1) {
    // União: pCBS' = pCBS + pIBS; pIBS' = 0.
    return { pIBSSN: JBD.zero(0), pCBSSN: totalizar([pCbs, pIbs]) };
  }

  if (fator === null) {
    throw new Error(
      `Fator de transição de compra governamental não resolvido para tpEnteGov ${tpEnteGov}`,
    );
  }

  // pIBS' = pIBS + f × pCBS; pCBS' = (1 − f) × pCBS.
  const pIbsTransformada = totalizar([pIbs, multiplicar(fator, pCbs)!]);
  const pCbsTransformada = multiplicar(subtrair(JBD.ONE, fator)!, pCbs)!;

  return { pIBSSN: pIbsTransformada, pCBSSN: pCbsTransformada };
}

// ─── Matriz de regime × efeito do tipo de receita bruta ──────────────────────

/**
 * Valor bruto: vRBSNitem × fatorReceita × (alíquota/100). Zero quando o
 * fator anula a receita ou a alíquota é dispensada (nula).
 */
function valorTributo(
  vRBSNitem: JBD,
  fatorReceita: JBD,
  aliquota: JBD | null,
): JBD {
  if (aliquota === null || fatorReceita.signum() === 0) {
    return JBD.zero(0);
  }
  return multiplicar(multiplicar(vRBSNitem, fatorReceita)!, dividirPorCem(aliquota)!)!;
}

/**
 * Reparte o valor entre devido e pendente/suspenso pelos destinos da matriz
 * de regime. PARITY: CRT=3 + tpRegimeIBSCBS=2 tem destinoPendenteSuspenso=ZERO
 * (literal nas fórmulas P32/P33 da NT; intencional, NÃO "corrigir").
 */
function repartirPorRegime(
  regime: RegimeApuracaoSimples,
  valor: JBD,
  pendenteSuspenso: boolean,
): ValorTributo {
  const destino: DestinoValorSimples = pendenteSuspenso
    ? regime.destinoPendenteSuspenso
    : regime.destinoDevido;
  switch (destino) {
    case "DEVIDO":
      return { devido: valor, pendenteSuspenso: JBD.zero(0) };
    case "PENDENTE_SUSPENSO":
      return { devido: JBD.zero(0), pendenteSuspenso: valor };
    case "ZERO":
      return { devido: JBD.zero(0), pendenteSuspenso: JBD.zero(0) };
  }
}
