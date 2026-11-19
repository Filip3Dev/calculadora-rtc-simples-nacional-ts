/**
 * Upstream tracking — vigia os repositórios oficiais da Receita Federal e
 * abre issue (ou atualiza) quando algo muda; quando há migrações Flyway novas,
 * prepara um PR de sincronização com os SQLs (o CI do PR valida banco+goldens).
 *
 * Uso:
 *   node .github/scripts/upstream-check.mjs --init      # grava o estado atual sem avisar
 *   node .github/scripts/upstream-check.mjs --dry-run   # relatório sem efeitos colaterais
 *   node .github/scripts/upstream-check.mjs             # produção: issue + PR quando mudar
 *
 * Config: .upstream/config.json { watch:[{repo, flyway?}], piloto?, syncSteps?[] }
 * Estado: .upstream/state.json { repos:{ "<repo>": {tag, release, sha, migration} } }
 * Requer (produção): GH_TOKEN, GITHUB_REPOSITORY, git e gh no PATH.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG = path.join(RAIZ, ".upstream", "config.json");
const STATE = path.join(RAIZ, ".upstream", "state.json");
const MODO = process.argv[2] ?? "";
const TOKEN = process.env.GH_TOKEN;
const REPO_TS = process.env.GITHUB_REPOSITORY;

const api = async (rota) => {
  const resp = await fetch(`https://api.github.com/${rota}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "upstream-tracking",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!resp.ok) throw new Error(`API ${rota}: ${resp.status}`);
  return resp.json();
};

const config = JSON.parse(readFileSync(CONFIG, "utf8"));
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { repos: {} };
const mudancas = [];
const relatorio = [];

/** Migração máxima presente no repo TS (db/sql/manutencao). */
function migracaoLocal() {
  const dir = path.join(RAIZ, "db", "sql", "manutencao");
  if (!existsSync(dir)) return null;
  const vers = readdirSync(dir)
    .map((f) => /^V(\d+)__/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  return vers.length ? `V${String(Math.max(...vers)).padStart(4, "0")}` : null;
}

async function vigiar(alvo) {
  const repo = alvo.repo;
  const info = await api(`repos/${repo}`);
  const sha = (await api(`repos/${repo}/commits?per_page=1`))[0].sha;
  const tags = await api(`repos/${repo}/tags?per_page=5`);
  const tag = tags[0]?.name ?? null;
  let release = null;
  try {
    release = (await api(`repos/${repo}/releases/latest`)).tag_name;
  } catch {
    /* sem releases */
  }
  let migration = null;
  if (alvo.flyway) {
    const arquivos = await api(`repos/${repo}/contents/${alvo.flyway}`);
    const vers = arquivos
      .map((a) => /^V(\d+)__/.exec(a.name)?.[1])
      .filter(Boolean)
      .map(Number);
    migration = vers.length ? `V${String(Math.max(...vers)).padStart(4, "0")}` : null;
  }

  const anterior = state.repos[repo] ?? {};
  const item = {
    repo,
    tag,
    release,
    sha: sha.slice(0, 10),
    migration,
    anterior,
    mudouTag: anterior.tag !== undefined && anterior.tag !== tag,
    mudouSha: anterior.sha !== undefined && anterior.sha !== sha.slice(0, 10),
    migracoesNovas:
      anterior.migration && migration && migration !== anterior.migration
        ? { de: anterior.migration, para: migration }
        : null,
    pushed_at: info.pushed_at,
    default_branch: info.default_branch,
  };
  relatorio.push(
    `• ${repo}: tag ${tag ?? "—"} (release ${release ?? "—"}) · HEAD ${item.sha} · flyway ${migration ?? "—"}` +
      `${anterior.tag === undefined ? "  [novo no radar]" : item.mudouSha ? "  ⬆️ MOVIMENTO" : "  ✓ sem mudança"}`,
  );
  if (anterior.tag === undefined || item.mudouSha || item.mudouTag) mudancas.push(item);
  if (MODO === "--init") state.repos[repo] = { tag, release, sha: item.sha, migration };
  return item;
}

/** Probe do piloto oficial (nuvem) — versão do banco que a nuvem usa. */
async function sondarPiloto() {
  if (!config.piloto) return null;
  try {
    const resp = await fetch(config.piloto, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return { erro: `HTTP ${resp.status}` };
    const j = await resp.json();
    return {
      versaoDb: j.versaoDb ?? null,
      dataVersaoDb: j.dataVersaoDb ?? null,
      descricaoVersaoDb: j.descricaoVersaoDb ?? null,
      app: j.descricaoVersaoApp ?? j.versaoApp ?? null,
    };
  } catch (e) {
    return { erro: String(e) };
  }
}

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).toString().trim();

// ─── Execução ────────────────────────────────────────────────────────────────

const alvos = [];
for (const alvo of config.watch) alvos.push(await vigiar(alvo));
const piloto = await sondarPiloto();
const local = migracaoLocal();

if (piloto && !piloto.erro) {
  relatorio.push(
    `• piloto oficial (nuvem): versaoDb ${piloto.versaoDb ?? "?"} (${piloto.dataVersaoDb ?? "?"}) ` +
      `· app ${piloto.app ?? "?"} — "${piloto.descricaoVersaoDb ?? ""}"`,
  );
  if (local && piloto.versaoDb && piloto.versaoDb !== local) {
    relatorio.push(
      `  ⚠️ nuvem ${piloto.versaoDb} ≠ público ${local}: há dados ainda não publicados no GitHub (normal entre publicações; acionável quando o flyway público acompanhar).`,
    );
  }
} else if (piloto) {
  relatorio.push(`• piloto oficial: indisponível (${piloto.erro})`);
}

console.log(relatorio.join("\n"));

if (MODO === "--init") {
  mkdirSync(path.dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
  console.log("\n✓ state gravado (baseline)");
  process.exit(0);
}

if (mudancas.length === 0) {
  console.log("\n✓ Nenhuma mudança upstream — nada a fazer.");
  process.exit(0);
}

if (MODO === "--dry-run") {
  console.log(`\n[DRY-RUN] Abiria/atualizaria issue "⬆️ Upstream atualizado" com ${mudancas.length} alvo(s) movido(s).`);
  process.exit(0);
}

// ─── Produção: issue + PR ─────────────────────────────────────────────────────

const corpo = [];
corpo.push(`Detectado movimento nos repositórios oficiais (**${new Date().toISOString().slice(0, 10)}**).\n`);
for (const m of mudancas) {
  corpo.push(`## ${m.repo}`);
  corpo.push(
    `- Tag: **${m.anterior.tag ?? "—"} → ${m.tag ?? "—"}** · release ${m.release ?? "—"}`,
    `- HEAD: \`${m.anterior.sha ?? "—"}\` → \`${m.sha}\` ([compare](https://github.com/${m.repo}/compare/${m.anterior.sha}...${m.sha}))`,
  );
  if (m.migracoesNovas) {
    corpo.push(`- **Migrações novas: ${m.migracoesNovas.de} → ${m.migracoesNovas.para}**`);
  }
}
if (piloto && !piloto.erro) {
  corpo.push(`\n**Piloto oficial (nuvem)**: versaoDb \`${piloto.versaoDb}\` (${piloto.dataVersaoDb}) — _"${piloto.descricaoVersaoDb}"_`);
}
if (config.syncSteps?.length) {
  corpo.push(`\n### Passos de sincronização deste porte\n`);
  for (const passo of config.syncSteps) corpo.push(`- ${passo}`);
}

// Issue idempotente (uma issue aberta com a label upstream; atualiza se existir).
const LABEL = "upstream";
const titulo = "⬆️ Upstream atualizado — sincronização pendente";
try {
  sh("gh", ["label", "create", LABEL, "-R", REPO_TS, "--color", "D4A72C", "--description", "Movimento no repositório oficial — sincronização pendente"]);
} catch {
  /* label já existe */
}
let numero;
const issues = JSON.parse(
  sh("gh", ["issue", "list", "-R", REPO_TS, "--label", LABEL, "--state", "open", "--json", "number,title"]),
);
if (issues.length > 0) {
  numero = issues[0].number;
  sh("gh", ["issue", "edit", String(numero), "-R", REPO_TS, "--body", corpo.join("\n")]);
  sh("gh", ["issue", "comment", String(numero), "-R", REPO_TS, "--body", `Atualização automática: ${new Date().toISOString()}`]);
  console.log(`✓ issue #${numero} atualizada`);
} else {
  sh("gh", ["issue", "create", "-R", REPO_TS, "--label", LABEL, "--title", titulo, "--body", corpo.join("\n")]);
  console.log("✓ issue criada");
}

// PR de sincronização quando há migrações novas e o repo TS porta o flyway.
const comMigracao = mudancas.find((m) => m.migracoesNovas);
if (comMigracao && existsSync(path.join(RAIZ, "db", "sql", "manutencao"))) {
  const alvo = config.watch.find((w) => w.repo === comMigracao.repo);
  const branch = `sync/upstream-${new Date().toISOString().slice(0, 10)}`;
  const branches = JSON.parse(sh("gh", ["pr", "list", "-R", REPO_TS, "--state", "open", "--json", "headRefName"]));
  if (!branches.some((b) => b.headRefName === branch)) {
    sh("git", ["config", "user.name", "github-actions[bot]"]);
    sh("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    // Sparse-clone do oficial e copia as migrações novas.
    const tmp = path.join(RAIZ, ".upstream", ".oficial");
    rmSync(tmp, { recursive: true, force: true });
    sh("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", `https://github.com/${comMigracao.repo}.git`, tmp]);
    sh("git", ["-C", tmp, "sparse-checkout", "set", alvo.flyway]);
    const destino = path.join(RAIZ, "db", "sql", "manutencao");
    let copiados = [];
    for (const f of readdirSync(path.join(tmp, alvo.flyway))) {
      const vers = /^V(\d+)__/.exec(f)?.[1];
      if (vers && Number(vers) > Number((comMigracao.migracoesNovas.de ?? "V0").replace("V", ""))) {
        cpSync(path.join(tmp, alvo.flyway, f), path.join(destino, f));
        copiados.push(f);
      }
    }
    rmSync(tmp, { recursive: true, force: true });
    // state acompanha o sync no PR (só "consome" o upstream quando mergeado).
    for (const m of mudancas) {
      if (state.repos[m.repo]) state.repos[m.repo] = { tag: m.tag, release: m.release, sha: m.sha, migration: m.migration };
    }
    writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
    sh("git", ["checkout", "-b", branch]);
    sh("git", ["add", "db/sql/manutencao", ".upstream/state.json"]);
    sh("git", ["commit", "-m", `chore(sync): migrações upstream ${comMigracao.migracoesNovas.de}→${comMigracao.migracoesNovas.para}\n\n${copiados.join("\n")}`]);
    sh("git", ["push", "origin", branch]);
    const prBody = [
      "Sincronização automática das migrações Flyway do repositório oficial.",
      "",
      ...copiados.map((f) => `- \`${f}\``),
      "",
      "O CI deste PR gera o banco com os SQLs novos e roda os testes (golden incluídos) —",
      "verde = sincronização pronta para merge; vermelho = ajuste manual necessário (issue vinculada).",
    ].join("\n");
    sh("gh", ["pr", "create", "-R", REPO_TS, "--title", `chore(sync): migrações ${comMigracao.migracoesNovas.de}→${comMigracao.migracoesNovas.para}`, "--body", prBody, "--base", "main", "--head", branch]);
    console.log(`✓ PR de sincronização criado (${copiados.length} migrações)`);
  } else {
    console.log("• PR de sincronização já aberto — nada a fazer");
  }
}
