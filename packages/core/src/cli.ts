#!/usr/bin/env node
/**
 * CLI calculadora-sn — cálculo do Simples Nacional (NT 2026.005) no terminal,
 * sobre o mesmo motor/banco da API (paridade estrita com a oficial).
 *
 * Uso:
 *   calculadora-sn <operacao.json> [opções]
 * Opções: --db <caminho.db> · --base-url <url> (URIs de erro; default localhost:8082)
 * Saída: JSON da observabilidade (200) ou do ProblemDetail 422 (exit 1).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ErrosCalculoException,
  abrirBanco,
  serializarObservabilidade,
  SimplesNacionalObservabilidadeService,
  type OperacaoSimplesInput,
} from "./index.js";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function dbPadrao(): string {
  const candidatos = [
    process.env.SN_DB_PATH,
    path.join(PKG_ROOT, "db", "calculadora.db"), // embutido no pacote npm
    path.join(PKG_ROOT, "..", "..", "db", "calculadora.db"), // monorepo
    path.join(process.cwd(), "db", "calculadora.db"),
  ];
  return candidatos.find((c) => c !== undefined && existsSync(c)) ?? candidatos[1]!;
}

const args = process.argv.slice(2);
const posicionais: string[] = [];
const opts = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--db" || args[i] === "--base-url") opts.set(args[i], args[++i]);
  else posicionais.push(args[i]);
}

if (posicionais.length === 0 || opts.has("-h")) {
  console.log(`calculadora-sn — porte TS da Calculadora do Simples Nacional (NT 2026.005)

  calculadora-sn <operacao.json> [--db caminho.db] [--base-url https://meu.host]`);
  process.exit(posicionais.length === 0 ? 2 : 0);
}

try {
  const operacao = JSON.parse(readFileSync(posicionais[0], "utf8")) as OperacaoSimplesInput;
  const svc = new SimplesNacionalObservabilidadeService(abrirBanco(dbPadrao()));
  const baseURL = opts.get("--base-url") ?? "http://localhost:8082";
  try {
    const resultado = svc.processarOperacao(operacao, baseURL);
    console.log(JSON.stringify(serializarObservabilidade(resultado), null, 2));
  } catch (e) {
    if (e instanceof ErrosCalculoException) {
      // Espelha o ProblemDetail 422 da API (timestamp local).
      console.log(
        JSON.stringify(
          {
            type: "about:blank",
            title: "Erros no processamento do cálculo do Simples Nacional",
            status: 422,
            detail: `O cálculo contém ${e.erros.length} erro(s).`,
            timestamp: new Date().toISOString(),
            errors: e.erros,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
    throw e;
  }
} catch (e) {
  console.error(`Erro: ${(e as Error).message}`);
  process.exit(1);
}
