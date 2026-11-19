import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { ProblemDetailFilter } from "./problem-detail.filter.js";
import { HeadersInterceptor } from "./headers.interceptor.js";
import { versaoBaseDados } from "./calc.provider.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["log", "warn", "error"],
  });

  app.useBodyParser("json", { limit: "500kb" });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ProblemDetailFilter());
  app.useGlobalInterceptors(new HeadersInterceptor());
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle("Calculadora de Tributos — Simples Nacional (LC 123/2006, LC 214/2025)")
    .setDescription(
      "API REST que realiza o cálculo da CBS e do IBS (Reforma Tributária do Consumo) nas " +
        "operaações do regime do Simples Nacional, conforme a NT 2026.005. Porte TypeScript com " +
        "paridade estrita de saída com a API oficial (Receita Federal/SERPRO).",
    )
    .setVersion(process.env.npm_package_version ?? "0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/swagger", app, document);

  // Headers de segurança padrão do Spring Security da API oficial.
  app.use((req: { headers: Record<string, string | undefined> }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });

  const port = Number(process.env.PORT ?? 8082);
  await app.listen(port, "0.0.0.0");

  const versao = versaoBaseDados();
  console.log(`⚡ Calculadora Simples Nacional (TS) em http://localhost:${port}/api`);
  console.log(`📚 Swagger: http://localhost:${port}/api/swagger`);
  console.log(`🗄️  Base de dados: versão ${versao.numeroVersao} (${versao.data})`);
}

void bootstrap();
