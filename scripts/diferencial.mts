/**
 * TESTE DIFERENCIAL — Simples Nacional: dispara os mesmos requests na API
 * Java oficial (:8081) e na TS (:8082) e compara campo a campo (200s completos,
 * 422s com status+erros). Fecha a prova de paridade com inputs reais, além dos
 * goldens (equivalente ao diferencial 83/83 do regime-regular).
 *
 * Uso: pnpm --filter calculadora-simples-nacional-core exec tsx ../../scripts/diferencial.mts
 * Requer: Java oficial na :8081 (ver README) e a API TS na :8082 (pnpm dev:api).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JAVA = process.env.JAVA_URL ?? "http://localhost:8081/api";
const TS = process.env.TS_URL ?? "http://localhost:8082/api";
const GOLDEN_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../apps/api/test/golden",
);

const PATHS_GET = [
  "/calculadora/simples-nacional/atividades?data=2027-01-01",
  "/calculadora/simples-nacional/atividades?data=2027-01-01&anexos=I,V",
  "/calculadora/simples-nacional/atividades?data=2027-01-01&tpDoc=91",
  "/calculadora/simples-nacional/atividades?data=2027-01-01&cClassTrib=000001",
  "/calculadora/simples-nacional/atividades/09?data=2027-01-01",
  "/calculadora/simples-nacional/atividades/90?data=2027-01-01&cClassTrib=000001",
  "/calculadora/simples-nacional/atividades/99?data=2027-01-01",
  "/calculadora/observabilidade/simples-nacional/erros?codigo=VSN-027",
  "/versao",
];

/** POSTs: todos os corpos das fixtures golden + extras diferenciados. */
function posts(): Array<{ nome: string; body: unknown }> {
  const saida: Array<{ nome: string; body: unknown }> = readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const fixture = JSON.parse(readFileSync(path.join(GOLDEN_DIR, f), "utf8"));
      return {
        nome: f.replace(/\.json$/, ""),
        body: fixture.request.body,
        metodo: fixture.request.method,
        path: fixture.request.path,
      };
    })
    .filter((f) => f.metodo === "POST")
    .map(({ nome, body }) => ({ nome, body }));

  // Extras: variações não cobertas pelas fixtures.
  const op = (over: Record<string, unknown>, item: Record<string, unknown> = {}) => ({
    id: "dif",
    versao: "2.0.0",
    data: "2029-06-01",
    tpDoc: "55",
    CRT: "1",
    tpEnteGov: "4",
    itens: [
      {
        numero: 1,
        cAtivSN: "04",
        cClassTrib: "000001",
        baseCalculo: "12345.67",
        valorImpostoSeletivo: "0",
        pIBSSN: "3.5",
        pCBSSN: "7.25",
        ...item,
      },
    ],
    ...over,
  });
  const extras: Array<{ nome: string; body: unknown }> = [
    { nome: "extra-municipio-2029", body: op({}) },
    { nome: "extra-base-negativa", body: op({}, { baseCalculo: "-1.50" }) },
    { nome: "extra-decimais-exoticos", body: op({}, { baseCalculo: "1000000.999", pIBSSN: "10.555", pCBSSN: "9.999" }) },
    { nome: "extra-vsn003-vis", body: op({}, { valorImpostoSeletivo: "abc" }) },
    {
      nome: "extra-2itens-mistos",
      body: op({
        itens: [
          { numero: 1, cAtivSN: "01", cClassTrib: "000001", baseCalculo: "1000", valorImpostoSeletivo: "0", pIBSSN: "1", pCBSSN: "2" },
          { numero: 2, cAtivSN: "07", cClassTrib: "010001", baseCalculo: "250.5", valorImpostoSeletivo: "10.5", pIBSSN: "0.5", pCBSSN: "1.5" },
        ],
      }),
    },
    { nome: "extra-tpdoc-93", body: op({ tpDoc: "93" }) },
    { nome: "extra-tpdoc-65", body: op({ tpDoc: "65", CRT: "2" }) },
    { nome: "extra-data-2033", body: op({ data: "2033-06-01" }) },
    { nome: "extra-uniao-2050", body: op({ data: "2050-01-01", tpEnteGov: "1" }) },
    { nome: "extra-numeros-espacos", body: op({}, { cAtivSN: " 01 ", baseCalculo: " 100 " }) },
  ];
  return [...saida, ...extras];
}

async function bater(url: string, method: string, pathReq: string, body?: unknown): Promise<{ status: number; json: unknown; texto: string }> {
  const resp = await fetch(url + pathReq, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const texto = await resp.text();
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* não-JSON */
  }
  return { status: resp.status, json, texto };
}

/** Normaliza campos dinâmicos: timestamp, instance, type (host da URI de erro). */
function norm(v: unknown): unknown {
  if (typeof v === "string") {
    return v
      .replace(/^https?:\/\/[^/]+\//, "<HOST>/")
      .replace(/^\/api/, "")
      .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/, "<TS>");
  }
  if (Array.isArray(v)) return v.map(norm);
  if (v !== null && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      o[k] = k === "timestamp" && typeof val === "string" ? "<TS>" : norm(val);
    }
    return o;
  }
  return v;
}

let iguais = 0;
const falhas: Array<{ caso: string; motivo: string }> = [];

async function comparar(nome: string, method: string, pathReq: string, body?: unknown): Promise<void> {
  const [java, ts] = await Promise.all([
    bater(JAVA, method, pathReq, body),
    bater(TS, method, pathReq, body),
  ]);
  if (java.status !== ts.status) {
    falhas.push({ caso: nome, motivo: `status Java=${java.status} TS=${ts.status} · TS: ${ts.texto.slice(0, 200)}` });
    return;
  }
  if (java.json === null || ts.json === null) {
    if (java.texto !== ts.texto) {
      falhas.push({ caso: nome, motivo: "corpo não-JSON divergente" });
      return;
    }
    iguais++;
    return;
  }
  // /versao: versaoApp difere por design (aplicações distintas) — comparar o resto.
  const jv = java.json as Record<string, unknown>;
  const tv = ts.json as Record<string, unknown>;
  if (jv?.versaoApp !== undefined && tv?.versaoApp !== undefined && "versaoDb" in jv) {
    delete jv.versaoApp;
    delete tv.versaoApp;
  }
  const nj = JSON.stringify(norm(java.json));
  const nt = JSON.stringify(norm(ts.json));
  if (nj === nt) {
    iguais++;
  } else {
    // primeira divergência legível
    const lj = JSON.stringify(norm(java.json), null, 1).split("\n");
    const lt = JSON.stringify(norm(ts.json), null, 1).split("\n");
    let i = 0;
    while (i < Math.min(lj.length, lt.length) && lj[i] === lt[i]) i++;
    falhas.push({
      caso: nome,
      motivo: `linha ${i}:\n  Java: ${lj[i]?.trim()}\n  TS:   ${lt[i]?.trim()}`,
    });
  }
}

// POSTs
for (const { nome, body } of posts()) {
  await comparar(`POST ${nome}`, "POST", "/calculadora/observabilidade/simples-nacional", body);
}
// GETs
for (const p of PATHS_GET) {
  await comparar(`GET ${p}`, "GET", p);
}

console.log(`\n═══ Diferencial Simples Nacional ═══`);
console.log(`Idênticos: ${iguais}/${iguais + falhas.length}`);
if (falhas.length > 0) {
  console.error(`\nDIVERGÊNCIAS (${falhas.length}):`);
  for (const f of falhas) console.error(`  ✗ ${f.caso} — ${f.motivo}`);
  process.exit(1);
} else {
  console.log("✓ Paridade total.");
}
