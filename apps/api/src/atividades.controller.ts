/**
 * Controller do catálogo de Atividades do Simples Nacional.
 *
 * PARITY: os 400 de parâmetro replicam os handlers do Java —
 * ResponseStatusException → ProblemDetail {type:"about:blank", title:"Bad
 * Request"} sem timestamp; parâmetro ausente/mal-formado → ProblemDetail com
 * type do ProblemType + timestamp + errors[].
 */
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  converterAnexos,
  ErroRespostaHttp,
  serializarAtividade,
  type OperacaoSimplesInput,
} from "@sn/core";
import { atividades } from "./calc.provider.js";
import { ParametroInvalidoException, ParametroObrigatorioAusenteException } from "./problem-detail.filter.js";

function validarDataQuery(data: string | undefined): string {
  if (data === undefined) {
    // Spring: MissingServletRequestParameterException — tipo exibido é o do binding (LocalDate).
    throw new ParametroObrigatorioAusenteException("data", "LocalDate");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    // Spring: MethodArgumentTypeMismatchException — @DateTimeFormat(iso = DATE).
    throw new ParametroInvalidoException("data", data);
  }
  return data;
}

@ApiTags("Atividades do Simples Nacional")
@Controller("calculadora/simples-nacional/atividades")
export class AtividadesController {
  @Get()
  @ApiOperation({
    summary: "Atividades do Simples Nacional vigentes na data",
    description:
      "Lista as atividades do catálogo oficial (cAtivSN '01'..'14' e '90') vigentes na data, " +
      "com derivação de anexos (I..V) e estado do Fator R. Filtros opcionais: anexos " +
      "(lista ou CSV), tpDoc (admissibilidade por atividade — whitelist) e cClassTrib " +
      "(compatibilidade com o tpRBSN, regra UB14-90 da NT 2026.005).",
  })
  listar(
    @Query("data") data: string | undefined,
    @Query("anexos") anexos: string[] | string | undefined,
    @Query("tpDoc") tpDoc: string | undefined,
    @Query("cClassTrib") cClassTrib: string | undefined,
    @Req() _req: Request,
  ): Record<string, unknown>[] {
    const dataValida = validarDataQuery(data);
    const anexosLista = anexos === undefined ? null : Array.isArray(anexos) ? anexos : [anexos];
    try {
      return atividades()
        .listar(
          dataValida,
          converterAnexos(anexosLista),
          tpDoc ?? null,
          cClassTrib ?? null,
        )
        .map(serializarAtividade);
    } catch (e) {
      if (e instanceof ErroRespostaHttp) {
        throw e;
      }
      throw e;
    }
  }

  @Get(":codigo")
  @ApiOperation({
    summary: "Consulta uma atividade pelo código, vigente na data",
  })
  async buscar(
    @Param("codigo") codigo: string,
    @Query("data") data: string | undefined,
    @Query("tpDoc") tpDoc: string | undefined,
    @Query("cClassTrib") cClassTrib: string | undefined,
  ): Promise<Record<string, unknown>> {
    const dataValida = validarDataQuery(data);
    const atividade = atividades().buscarPorCodigo(
      codigo,
      dataValida,
      tpDoc ?? null,
      cClassTrib ?? null,
    );
    if (atividade === null) {
      // ResponseEntity.notFound() do Java: 404 sem body.
      throw new NotFoundException();
    }
    return serializarAtividade(atividade);
  }
}

// Reexport para tipagem de entrada no Swagger (OperacaoSimplesInput).
export type { OperacaoSimplesInput };
