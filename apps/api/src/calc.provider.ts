/**
 * Singletons de acesso ao banco e aos serviços do core (equivalente aos
 * beans Spring do Java — SQLite somente leitura, aberto uma única vez).
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  abrirBanco,
  AtividadeSimplesService,
  SimplesNacionalObservabilidadeService,
  type RepositoriosSimples,
} from "calculadora-simples-nacional-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DB_PATH = process.env.SN_DB_PATH ?? path.join(ROOT, "db", "calculadora.db");

let reposCache: RepositoriosSimples | null = null;

export function repositorios(): RepositoriosSimples {
  reposCache ??= abrirBanco(DB_PATH);
  return reposCache;
}

let observabilidadeCache: SimplesNacionalObservabilidadeService | null = null;

export function observabilidade(): SimplesNacionalObservabilidadeService {
  observabilidadeCache ??= new SimplesNacionalObservabilidadeService(repositorios());
  return observabilidadeCache;
}

let atividadesCache: AtividadeSimplesService | null = null;

export function atividades(): AtividadeSimplesService {
  atividadesCache ??= new AtividadeSimplesService(repositorios());
  return atividadesCache;
}

/** Versão do banco para os headers X-CALC-DB-VERSION / endpoint /versao. */
export function versaoBaseDados(): { numeroVersao: string; data: string; descricao: string } {
  const versao = repositorios().buscarUltimaVersaoBase();
  if (!versao) {
    throw new Error("Nenhuma versão de base de dados encontrada");
  }
  return {
    numeroVersao: versao.numeroVersao,
    // PARITY: VRBD_DATA vem "2026-09-30 00:00:00"; o JPA/LocalDate serializa só a data.
    data: versao.data.split(" ")[0],
    descricao: versao.descricao,
  };
}

/** Versão da aplicação para X-CALC-APP-VERSION / /versao.
 * Lida do package.json em RUNTIME — no container roda `node dist/main.js`
 * (sem pnpm), então npm_package_version não existe e um fallback fixo faria
 * o /versao mentir em produção (dist/main.js → ../package.json = apps/api). */
const APP_VERSION: string = (() => {
  try {
    return JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ).version as string;
  } catch {
    return process.env.npm_package_version ?? "0.0.0";
  }
})();

export function versaoAplicacao(): string {
  return APP_VERSION;
}
