/**
 * Controller do cálculo do Simples Nacional (NT 2026.005).
 *
 * PARITY: a URI de catálogo nos ErroDetalhe usa scheme://host SEM porta e
 * SEM o context-path /api (comportamento de HttpUtils.getBaseURL() do Java).
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

const EXEMPLO_ENTRADA = {
  id: "507f1f77bcf86cd799439011",
  versao: "2.0.0",
  data: "2027-03-15",
  tpDoc: "55",
  CRT: "1",
  itens: [
    {
      numero: 1,
      cAtivSN: "01",
      cClassTrib: "000001",
      baseCalculo: "950.00",
      valorImpostoSeletivo: "50.00",
      pIBSSN: "1.25",
      pCBSSN: "2.75",
    },
  ],
};

const EXEMPLO_SAIDA_200 = {
  oper: { data: "2027-03-15", tpDoc: "55", CRT: "1" },
  objetos: [
    {
      nObj: 1,
      estadoItem: "CALCULADO",
      tribCalc: {
        vRBSNitem: "950.00",
        tpRBSN: 1,
        tpRBSNDescricao: "Receita bruta - interna",
        vBC: "950.00",
        pIBSSN: "1.25",
        vIBSSN: "11.88",
        vIBSPendSusp: "0.00",
        pCBSSN: "2.75",
        vCBSSN: "26.12",
        vCBSPendSusp: "0.00",
        IS: { valor: "50.00" },
        totalItem: "88.00",
      },
    },
  ],
  total: {
    vRBSNtot: "950.00",
    vBC: "950.00",
    vIBSSNtot: "11.88",
    vIBSSNtotPendSusp: "0.00",
    vCBSSNtot: "26.12",
    vCBSSNtotPendSusp: "0.00",
    totalIs: "50.00",
    totalTributos: "88.00",
  },
};

const EXEMPLO_SAIDA_422 = {
  type: "about:blank",
  title: "Erros no processamento do cálculo do Simples Nacional",
  status: 422,
  detail: "O cálculo contém 1 erro(s).",
  instance: "/api/calculadora/observabilidade/simples-nacional",
  timestamp: "2027-01-01T00:00:00.000000000Z",
  errors: [
    {
      type: "http://localhost/calculadora/observabilidade/simples-nacional/erros?codigo=VSN-024",
      title: "Tipo de ente governamental (tpEnteGov) inválido",
      code: "VSN-024",
      pointer: "#/tpEnteGov",
      detail: "Tipo de ente governamental inválido, recebido: '7' (esperado 1, 2, 3 ou 4).",
    },
  ],
};
import {
  buscarErroPorCodigo,
  serializarObservabilidade,
  type ErroDescricaoSimples,
  type OperacaoSimplesInput,
} from "calculadora-simples-nacional-core";
import { observabilidade } from "./calc.provider.js";

/** scheme://host sem porta e sem path — como UriComponents.getHost() do Java. */
export function baseURL(req: Request): string {
  const host = (req.headers.host ?? "localhost").replace(/:\d+$/, "");
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "http";
  return `${proto}://${host}`;
}

@ApiTags("Observabilidade - Calculadora do Simples Nacional")
@Controller("calculadora/observabilidade/simples-nacional")
export class SimplesNacionalController {
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "Cálculo do Simples Nacional com observabilidade (NT 2026.005)",
    description:
      "Implementa a NT 2026.005 v1.00 (LC 123/2006, LC 214/2025, LC 227/2026). " +
      "Resolve internamente o tpRBSN do cClassTrib (restrito ao grupo da CBS da tabela de " +
      "classificação), valida o cAtivSN contra o catálogo de atividades (restrição de documento " +
      "POR ATIVIDADE) e espelha, por item, o leiaute do Evento de Tributação do Simples Nacional " +
      "(tpEvento 412140) — acumulando erros individuais por item. Compras governamentais " +
      "(tpEnteGov informado na operação) aplicam a todos os itens o deslocamento de alíquotas " +
      "CBS-IBS dos arts. 372 e 473 da LC 214/2025.",
  })
  @ApiBody({ description: "Dados de uma operação do Simples Nacional", examples: { padrao: { value: EXEMPLO_ENTRADA } } })
  @ApiOkResponse({ description: "Processamento realizado (itens podem ter erros individuais)", examples: { padrao: { summary: "Item calculado com IS", value: EXEMPLO_SAIDA_200 } } })
  @ApiResponse({ status: 422, description: "Erro de validação global ou operação fora do escopo (ProblemDetail RFC 9457)", examples: { tpEnteGov: { summary: "tpEnteGov inválido (VSN-024)", value: EXEMPLO_SAIDA_422 } } })
  calcular(@Body() operacao: OperacaoSimplesInput, @Req() req: Request): Record<string, unknown> {
    const resultado = observabilidade().processarOperacao(operacao, baseURL(req));
    return serializarObservabilidade(resultado) as Record<string, unknown>;
  }

  @Get("erros")
  @ApiOperation({
    summary: "Consultar descrição de erro do Simples Nacional",
    description: "Retorna título e descrição em PT-BR para o código de erro VSN- informado.",
  })
  buscarErro(@Query("codigo") codigo: string): ErroDescricaoSimples {
    const descricao = buscarErroPorCodigo(codigo ?? null);
    if (descricao === null) {
      // ResponseEntity.notFound() do Java: 404 sem body.
      throw new NotFoundException();
    }
    return descricao;
  }
}
