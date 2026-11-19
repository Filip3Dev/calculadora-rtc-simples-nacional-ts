/**
 * E2E GOLDEN — replay das fixtures capturadas da API Java oficial
 * (test/golden/*.json, geradas por captura-golden.mjs contra o JAR oficial
 * executando com o mesmo banco). Compara status + body completos, com
 * normalização apenas de host e timestamp (dinâmicos).
 *
 * O servidor sobe AQUI, num processo filho (tsx src/main.ts) — o vitest não
 * emite decorator metadata (esbuild), então o app precisa rodar fora dele.
 * Porta dedicada 8190 evita conflito com dev (8082) e com o Java de referência.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "golden");
const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8190;
/** Fixtures gravam path relativo ao context-path (/api) da API oficial. */
const BASE = `http://127.0.0.1:${PORT}/api`;

interface Fixture {
  request: { method: string; path: string; body: unknown };
  status: number;
  contentType: string | null;
  headers: { appVersion: string | null; dbVersion: string | null };
  body: unknown;
}

/** Normaliza partes dinâmicas: host de URI e timestamp. */
function normalizar(valor: unknown): unknown {
  if (typeof valor === "string") {
    return valor
      .replace(/^https?:\/\/[^/]+\//, "<HOST>/")
      .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/, "<TS>");
  }
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor !== null && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      saida[k] = k === "timestamp" && typeof v === "string" ? "<TS>" : normalizar(v);
    }
    return saida;
  }
  return valor;
}

describe("e2e golden — paridade com a API Java oficial", () => {
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawn("pnpm", ["exec", "tsx", "src/main.ts"], {
      cwd: API_DIR,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // grupo próprio: o teardown mata pnpm E tsx (órfão deixaria a porta ocupada)
    });
    // Aguardar a API responder (boot Nest + abertura do banco).
    const t0 = Date.now();
    for (;;) {
      try {
        const resp = await fetch(`${BASE}/versao`, { signal: AbortSignal.timeout(1000) });
        if (resp.ok) break;
      } catch {
        /* ainda subindo */
      }
      if (Date.now() - t0 > 25_000) throw new Error("API não subiu em 25s");
      await new Promise((r) => setTimeout(r, 300));
    }
  }, 40_000);

  afterAll(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM"); // grupo inteiro (pnpm + tsx)
      } catch {
        server.kill("SIGTERM");
      }
    }
  });

  const fixtures = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".json"));

  it("fixtures presentes", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
  });

  for (const arquivo of fixtures) {
    const nome = arquivo.replace(/\.json$/, "");
    const fixture: Fixture = JSON.parse(readFileSync(path.join(GOLDEN_DIR, arquivo), "utf8"));

    it(`${nome} → ${fixture.status}`, { timeout: 20000 }, async () => {
      const resp = await fetch(BASE + fixture.request.path, {
        method: fixture.request.method,
        headers: fixture.request.body !== null ? { "content-type": "application/json" } : {},
        body: fixture.request.body !== null ? JSON.stringify(fixture.request.body) : undefined,
      });

      // ── Status ──
      expect(resp.status, `${nome}: status`).toBe(fixture.status);

      // ── Headers de versão ──
      if (fixture.headers.appVersion !== null) {
        expect(resp.headers.get("x-calc-app-version"), `${nome}: X-CALC-APP-VERSION presente`).toBeTruthy();
      }
      if (fixture.headers.dbVersion !== null) {
        expect(resp.headers.get("x-calc-db-version"), `${nome}: X-CALC-DB-VERSION`).toBe(fixture.headers.dbVersion);
      }

      // ── Body ──
      const texto = await resp.text();
      if (texto === "") {
        expect(fixture.body, `${nome}: body vazio`).toBeNull();
        return;
      }
      const body = normalizar(JSON.parse(texto));

      if (nome === "versao") {
        // versaoApp é da aplicação (0.0.6 Java × nossa) — comparar o resto.
        const esperado = normalizar(fixture.body) as Record<string, unknown>;
        expect(body).toMatchObject({
          versaoDb: esperado.versaoDb,
          descricaoVersaoDb: esperado.descricaoVersaoDb,
          dataVersaoDb: esperado.dataVersaoDb,
          ambiente: esperado.ambiente,
        });
        return;
      }

      expect(body, `${nome}: body`).toEqual(normalizar(fixture.body));
    });
  }
});
