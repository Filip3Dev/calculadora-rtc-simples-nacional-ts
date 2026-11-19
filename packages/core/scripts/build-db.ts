/**
 * Gera o banco SQLite da calculadora a partir dos scripts SQL oficiais
 * (portados do projeto Java: flyway/sql). Replica a ordem do build Flyway:
 *
 *   beforeMigrate.sql (PRAGMAs)  ->  B0001 (baseline)  ->
 *   V0002..V00xx (manutenção, ordem de versão)  ->  afterMigrate.sql
 *
 * Uso: pnpm db:build [-- --out <caminho.db>]
 */
import Database from "better-sqlite3";
import { readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL_DIR = path.join(ROOT, "db", "sql");
const outArgIdx = process.argv.indexOf("--out");
const OUT_DB =
  outArgIdx !== -1 ? path.resolve(process.argv[outArgIdx + 1]) : path.join(ROOT, "db", "calculadora.db");

function runScript(db: Database.Database, file: string): void {
  const sql = readFileSync(file, "utf8");
  // Scripts com "PRAGMA foreign_keys" não podem rodar em transação (o pragma é
  // no-op dentro dela) — replica o flyway.mixed=true do build original.
  // Os demais rodam transacionados para que "PRAGMA defer_foreign_keys"
  // adie as checagens de FK até o COMMIT, como no Flyway.
  const transactional = !/\bPRAGMA\s+foreign_keys\b/i.test(sql);
  if (transactional) {
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* conexão já rollbackada */
      }
      throw err;
    }
  } else {
    db.exec(sql);
  }
}

function versionOf(file: string): number {
  return parseInt(file.replace(/^V(\d+)__.*$/, "$1"), 10);
}

console.log(`→ Gerando banco: ${OUT_DB}`);
mkdirSync(path.dirname(OUT_DB), { recursive: true });
rmSync(OUT_DB, { force: true });
rmSync(`${OUT_DB}-journal`, { force: true });

const db = new Database(OUT_DB);

try {
  const t0 = Date.now();

  // 1. PRAGMAs de criação (fora de transação — contém PRAGMA foreign_keys)
  runScript(db, path.join(SQL_DIR, "criacao", "beforeMigrate.sql"));
  console.log("✓ beforeMigrate.sql (PRAGMAs)");

  // 2. Baseline B0001 — sistema tributário completo
  const criacao = readdirSync(path.join(SQL_DIR, "criacao"));
  const baseline = criacao.filter((f) => /^B\d+__.*\.sql$/.test(f)).sort()[0];
  if (!baseline) throw new Error("Baseline B0001 não encontrado em criacao/");
  runScript(db, path.join(SQL_DIR, "criacao", baseline));
  console.log(`✓ ${baseline} (baseline)`);

  // 3. Migrações versionadas em ordem
  const migrations = readdirSync(path.join(SQL_DIR, "manutencao"))
    .filter((f) => /^V\d+__.*\.sql$/.test(f))
    .sort((a, b) => versionOf(a) - versionOf(b));
  for (const m of migrations) {
    try {
      runScript(db, path.join(SQL_DIR, "manutencao", m));
    } catch (err) {
      throw new Error(`Falha na migração ${m}: ${(err as Error).message}`);
    }
  }
  console.log(`✓ ${migrations.length} migrações de manutenção (V0002..V${String(versionOf(migrations.at(-1)!)).padStart(4, "0")})`);

  // 4. Pós-migração: recriações, índices, ANALYZE, verificações
  runScript(db, path.join(SQL_DIR, "criacao", "afterMigrate.sql"));
  console.log("✓ afterMigrate.sql (índices, ANALYZE, verificações)");

  // 5. Histórico próprio (o banco é somente-leitura em runtime; só para inspeção)
  db.exec(
    `CREATE TABLE IF NOT EXISTS db_build_history (
       script TEXT PRIMARY KEY,
       executado_em TEXT NOT NULL DEFAULT (datetime('now'))
     );`,
  );
  const insert = db.prepare("INSERT OR REPLACE INTO db_build_history(script) VALUES (?)");
  insert.run(baseline);
  for (const m of migrations) insert.run(m);

  // 6. Verificações finais
  const fkErrors = db.prepare("PRAGMA foreign_key_check").all() as unknown[];
  const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  const tables = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'db_build_history'")
      .all() as { name: string }[]
  ).map((r) => r.name);

  const keyCounts: Record<string, number> = {};
  for (const t of ["CLASSIFICACAO_TRIBUTARIA", "TRATAMENTO_TRIBUTARIO", "ALIQUOTA_PADRAO", "NCM", "NBS", "MUNICIPIO", "UF", "VERSAO_BASE_DADO"]) {
    try {
      keyCounts[t] = (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
    } catch {
      keyCounts[t] = -1;
    }
  }
  const versao = db.prepare("SELECT * FROM VERSAO_BASE_DADO LIMIT 1").all();

  console.log(`\n Banco gerado em ${Date.now() - t0} ms`);
  console.log(`  Integridade: ${integrity.integrity_check} · FK violações: ${fkErrors.length} · Tabelas: ${tables.length}`);
  console.log("  Registros:", JSON.stringify(keyCounts));
  console.log("  VERSAO_BASE_DADO:", JSON.stringify(versao));

  if (integrity.integrity_check !== "ok" || fkErrors.length > 0) {
    throw new Error("Banco gerado com problemas de integridade");
  }
} finally {
  db.close();
}
