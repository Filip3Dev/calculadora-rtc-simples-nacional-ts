/**
 * Filtro de exceções — ProblemDetail (RFC 9457) com os shapes capturados da
 * API Java oficial (ver test/golden/*.json):
 *
 *  - ErrosCalculoException → 422 {type:"about:blank", title fixo, detail
 *    "O cálculo contém N erro(s).", instance, timestamp, errors[]}
 *  - ErroRespostaHttp (ResponseStatusException) → status com
 *    {type:"about:blank", title:"Bad Request", detail:motivo, instance} SEM
 *    timestamp/errors
 *  - ParametroObrigatorioAusenteException → 400 type ".../errors/parametro-obrigatorio-ausente"
 *    + timestamp + errors[{pointer "#/data"}]
 *  - ParametroInvalidoException → 400 type ".../errors/tipo-argumento-invalido"
 *    + timestamp + errors[]
 *  - JSON mal-formado → 400 type ".../errors/mensagem-incompreensivel" + timestamp
 *  - Erro inesperado → 500 type ".../errors/erro-de-sistema-nao-previsto" + timestamp
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ErrosCalculoException, ErroRespostaHttp } from "calculadora-simples-nacional-core";

/** Exceções de parâmetro de query (equivalem aos handlers do Spring). */
export class ParametroObrigatorioAusenteException extends Error {
  constructor(
    readonly parametro: string,
    readonly tipo: string,
  ) {
    super(`O parâmetro obrigatório '${parametro}' (${tipo}) não foi informado.`);
  }
}

export class ParametroInvalidoException extends Error {
  constructor(
    readonly parametro: string,
    readonly valor: string,
  ) {
    super(`Parâmetro inválido [${parametro}: ${valor}] `);
  }
}

/** PARITY: Instant.now() serializado — fração com 9 dígitos (nanossegundos). */
function timestamp(): string {
  const ms = new Date().toISOString().slice(0, 23); // …T15:00:13.369
  const nanos = String(process.hrtime.bigint() % 1_000_000n).padStart(6, "0");
  return `${ms}${nanos}Z`;
}

@Catch()
export class ProblemDetailFilter implements ExceptionFilter {
  catch(excecao: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // PARITY: instance do Java é o path COM o context-path, SEM query string.
    const instance = req.path ?? req.originalUrl ?? req.url ?? "";
    // PARITY: UriComponents.getHost() — sem porta; ProblemType usa baseURL /errors/<path>.
    const hostHeader = (req.headers.host ?? "localhost").replace(/:\d+$/, "");
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "http";
    const baseURL = `${proto}://${hostHeader}`;

    if (excecao instanceof ErrosCalculoException) {
      res.status(422).contentType("application/problem+json").json({
        type: "about:blank",
        title: "Erros no processamento do cálculo do Simples Nacional",
        status: 422,
        detail: `O cálculo contém ${excecao.erros.length} erro(s).`,
        instance,
        timestamp: timestamp(),
        errors: excecao.erros.map((e) => ({
          ...(e.type !== null && e.type !== undefined ? { type: e.type } : {}),
          ...(e.title !== null && e.title !== undefined ? { title: e.title } : {}),
          ...(e.code !== null && e.code !== undefined ? { code: e.code } : {}),
          ...(e.pointer !== null && e.pointer !== undefined ? { pointer: e.pointer } : {}),
          ...(e.detail !== null && e.detail !== undefined ? { detail: e.detail } : {}),
        })),
      });
      return;
    }

    if (excecao instanceof ErroRespostaHttp) {
      // ResponseStatusException com reason — ProblemDetail mínimo do Spring.
      res.status(excecao.status).contentType("application/problem+json").json({
        type: "about:blank",
        title: tituloHttp(excecao.status),
        status: excecao.status,
        detail: excecao.motivo,
        instance,
      });
      return;
    }

    if (excecao instanceof ParametroObrigatorioAusenteException) {
      const detail = excecao.message;
      res.status(400).contentType("application/problem+json").json({
        type: `${baseURL}/errors/parametro-obrigatorio-ausente`,
        title: "Parâmetro obrigatório ausente",
        status: 400,
        detail,
        instance,
        timestamp: timestamp(),
        errors: [
          { title: "Parâmetro obrigatório ausente", pointer: `#/${excecao.parametro}`, detail },
        ],
      });
      return;
    }

    if (excecao instanceof ParametroInvalidoException) {
      const detail = excecao.message;
      res.status(400).contentType("application/problem+json").json({
        type: `${baseURL}/errors/tipo-argumento-invalido`,
        title: "Tipo de argumento inválido",
        status: 400,
        detail,
        instance,
        timestamp: timestamp(),
        errors: [
          { title: "Tipo de argumento inválido", pointer: `#/${excecao.parametro}`, detail: detail.trim() },
        ],
      });
      return;
    }

    // 404 do NestJS (NotFoundException sem body — ResponseEntity.notFound() do Java)
    if (excecao instanceof HttpException && excecao.getStatus() === 404) {
      const resposta = excecao.getResponse();
      if (typeof resposta === "object" && resposta !== null) {
        const corpo = resposta as { message?: unknown; statusCode?: unknown; error?: unknown };
        // NotFoundException() sem mensagem → body vazio, como o Java.
        if (corpo.message === "Not Found" || corpo.message === undefined) {
          res.status(404).send();
          return;
        }
        // Rota inexistente também fica sem body (no Java é BasicErrorController; aqui
        // mantemos 404 seco para rotas do domínio).
        res.status(404).send();
        return;
      }
    }

    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      // Body de JSON mal-formado: HttpMessageNotReadableException do Jackson.
      const resposta = excecao.getResponse() as { message?: unknown };
      if (status === 400 && Array.isArray(resposta?.message)) {
        // BadRequest do parser de body (Nest embute a causa do JSON.parse).
        const causa = (resposta.message as string[]).join(", ");
        res.status(400).contentType("application/problem+json").json({
          type: `${baseURL}/errors/mensagem-incompreensivel`,
          title: "Mensagem incompreensível",
          status: 400,
          detail: causa.includes("JSON") ? causa : `JSON parse error: ${causa}`,
          instance,
          timestamp: timestamp(),
        });
        return;
      }
    }

    // Erro de sistema não previsto (handleGenericException do Java).
    const mensagem =
      excecao instanceof Error ? excecao.message : String(excecao ?? "Erro interno");
    res.status(500).contentType("application/problem+json").json({
      type: `${baseURL}/errors/erro-de-sistema-nao-previsto`,
      title: "Erro de sistema não previsto",
      status: 500,
      detail: mensagem,
      instance,
      timestamp: timestamp(),
    });
  }
}

function tituloHttp(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 404:
      return "Not Found";
    case 422:
      return "Unprocessable Entity";
    default:
      return "Error";
  }
}
