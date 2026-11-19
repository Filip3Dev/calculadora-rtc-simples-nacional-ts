/**
 * Interceptor global de cabeçalhos — X-CALC-APP-VERSION/X-CALC-DB-VERSION
 * (VersaoAplicacaoService do Java) + headers de segurança padrão do Spring
 * Security nas respostas (capturados da API oficial).
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { versaoAplicacao, versaoBaseDados } from "./calc.provider.js";

@Injectable()
export class HeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    res.setHeader("X-CALC-APP-VERSION", versaoAplicacao());
    res.setHeader("X-CALC-DB-VERSION", versaoBaseDados().numeroVersao);
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }

    return next.handle();
  }
}
