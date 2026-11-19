/**
 * Captura golden fixtures da API Java oficial rodando localmente.
 *
 * Uso: node captura-golden.mjs [baseUrl]
 *   baseUrl default: http://localhost:8082/api
 *
 * Cada fixture: { request: {method, path, body}, status, contentType,
 * headers: {appVersion, dbVersion}, body } — timestamps são normalizados
 * para "<TS>" (campo dinâmico).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:8082/api";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "golden");
mkdirSync(OUT, { recursive: true });

const POST = "/calculadora/observabilidade/simples-nacional";
const calc = (over = {}, item = {}) => ({
  id: "507f1f77bcf86cd799439011",
  versao: "2.0.0",
  data: "2027-03-15",
  tpDoc: "55",
  CRT: "1",
  itens: [
    {
      numero: 1,
      cAtivSN: "01",
      cClassTrib: "000001",
      baseCalculo: "1000.00",
      valorImpostoSeletivo: "0.00",
      pIBSSN: "1.25",
      pCBSSN: "2.75",
      ...item,
    },
  ],
  ...over,
});

const ATIV = "/calculadora/simples-nacional/atividades";

const casos = [
  ["casoA-calculado", "POST", POST, calc({}, { baseCalculo: "950.00", valorImpostoSeletivo: "50.00" })],
  ["casoB-nao-calculado", "POST", POST, calc({}, { cAtivSN: "99" })],
  ["casoC-nao-implementado", "POST", POST, calc({}, { cClassTrib: "620001" })],
  [
    "casoE-mistura",
    "POST",
    POST,
    {
      id: "abc",
      versao: "2.0.0",
      data: "2027-03-15",
      tpDoc: "55",
      CRT: "1",
      itens: [
        { numero: 1, cAtivSN: "01", cClassTrib: "000001", baseCalculo: "-10.00", valorImpostoSeletivo: "0.00", pIBSSN: "1.25", pCBSSN: "2.75" },
        { numero: 2, cAtivSN: "01", cClassTrib: "000001", baseCalculo: "1000.00", valorImpostoSeletivo: "0.00", pIBSSN: "1.25", pCBSSN: "2.75" },
        { numero: 3, cAtivSN: "99", cClassTrib: "000001", baseCalculo: "500.00", valorImpostoSeletivo: "0.00", pIBSSN: "1.25", pCBSSN: "2.75" },
      ],
    },
  ],
  ["compra-gov-2029", "POST", POST, calc({ data: "2029-06-01", tpEnteGov: "2", id: "abc" })],
  ["compra-gov-uniao", "POST", POST, calc({ tpEnteGov: "1", id: "abc" })],
  ["compra-gov-2033", "POST", POST, calc({ data: "2033-06-01", tpEnteGov: "3", id: "abc" })],
  ["crt2-suprime-ibs", "POST", POST, calc({ CRT: "2", id: "abc" }, { pIBSSN: null })],
  ["crt3-pendente", "POST", POST, calc({ CRT: "3", tpRegimeIBSCBS: "2", id: "abc" })],
  ["vsn023-nao-tributavel", "POST", POST, calc({ id: "abc" }, { cAtivSN: "90" })],
  ["tprbsn0-nao-tributavel-ok", "POST", POST, calc({ id: "abc" }, { cAtivSN: "90", cClassTrib: "410001", pIBSSN: null, pCBSSN: null })],
  ["tprbsn5-fator-meio", "POST", POST, calc({ id: "abc" }, { cClassTrib: "222001" })],
  ["atividade-91-nao-admissivel-55", "POST", POST, calc({ id: "abc" }, { cAtivSN: "07" })],
  ["422-tpEnteGov", "POST", POST, calc({ tpEnteGov: "7", id: "abc" })],
  ["422-fora-escopo-crt4", "POST", POST, calc({ CRT: "4", id: "abc" })],
  ["422-crt4-com-tpregime", "POST", POST, calc({ CRT: "4", tpRegimeIBSCBS: "2", id: "abc" })],
  ["422-crt3-sem-tpregime", "POST", POST, calc({ CRT: "3", id: "abc" })],
  ["422-crt1-tpregime2", "POST", POST, calc({ tpRegimeIBSCBS: "2", id: "abc" })],
  ["422-tpdoc-nao-suportado", "POST", POST, calc({ tpDoc: "97", id: "abc" })],
  ["422-tpdoc-77-sem-tratamento", "POST", POST, calc({ tpDoc: "77", id: "abc" })],
  ["422-itens-vazios", "POST", POST, calc({ itens: [], id: "abc" })],
  ["422-data-invalida", "POST", POST, calc({ data: "2027-13-99", id: "abc" })],
  ["422-data-pre-vigencia", "POST", POST, calc({ data: "2026-06-01", id: "abc" })],
  ["422-id-ausente", "POST", POST, calc({ id: null })],
  ["422-cclasstrib-fora-vigencia", "POST", POST, calc({ id: "abc" }, { cClassTrib: "220001" })],
  ["422-cclasstrib-inexistente", "POST", POST, calc({ id: "abc" }, { cClassTrib: "999999" })],
  ["vsn004-aliquota-ausente", "POST", POST, calc({ id: "abc" }, { pCBSSN: null })],
  ["vsn010-numero-ausente", "POST", POST, calc({ id: "abc" }, { numero: null })],
  ["nao-implementado-prioridade", "POST", POST, { id: "abc", versao: "2.0.0", data: "2027-03-15", tpDoc: "55", CRT: "1", itens: [{ numero: 1, cAtivSN: "01", cClassTrib: "620001", baseCalculo: "-10.00", valorImpostoSeletivo: "0.00" }] }],
  ["atividades-2027", "GET", `${ATIV}?data=2027-01-01`, null],
  ["atividades-anexos-IV", "GET", `${ATIV}?data=2027-01-01&anexos=I,V`, null],
  ["atividades-tpdoc-91", "GET", `${ATIV}?data=2027-01-01&tpDoc=91`, null],
  ["atividades-cclasstrib-nt", "GET", `${ATIV}?data=2027-01-01&cClassTrib=000001`, null],
  ["atividade-09", "GET", `${ATIV}/09?data=2027-01-01`, null],
  ["atividade-90-cclasstrib", "GET", `${ATIV}/90?data=2027-01-01&cClassTrib=000001`, null],
  ["atividade-404", "GET", `${ATIV}/99?data=2027-01-01`, null],
  ["erro-vsn025", "GET", "/calculadora/observabilidade/simples-nacional/erros?codigo=VSN-025", null],
  ["erro-404", "GET", "/calculadora/observabilidade/simples-nacional/erros?codigo=VSN-008", null],
  ["versao", "GET", "/versao", null],
  ["400-tpdoc-abc", "GET", `${ATIV}?data=2027-01-01&tpDoc=abc`, null],
  ["400-tpdoc-99", "GET", `${ATIV}?data=2027-01-01&tpDoc=99`, null],
  ["400-data-malformada", "GET", `${ATIV}?data=01/01/2027`, null],
  ["400-data-ausente", "GET", ATIV, null],
  ["400-anexo-invalido", "GET", `${ATIV}?data=2027-01-01&anexos=I,X`, null],
  ["400-cclasstrib-999999", "GET", `${ATIV}?data=2027-01-01&cClassTrib=999999`, null],
];

function normalizar(obj) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const copia = {};
    for (const [k, v] of Object.entries(obj)) {
      copia[k] = k === "timestamp" && typeof v === "string" ? "<TS>" : normalizar(v);
    }
    return copia;
  }
  return obj;
}

let ok = 0;
for (const [nome, method, rota, body] of casos) {
  const url = BASE + rota;
  const resp = await fetch(url, {
    method,
    headers: body !== null ? { "content-type": "application/json" } : {},
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const texto = await resp.text();
  let json = null;
  if (texto !== "") {
    try {
      json = normalizar(JSON.parse(texto));
    } catch {
      json = { raw: texto };
    }
  }
  const fixture = {
    request: { method, path: rota, body },
    status: resp.status,
    contentType: resp.headers.get("content-type"),
    headers: {
      appVersion: resp.headers.get("x-calc-app-version"),
      dbVersion: resp.headers.get("x-calc-db-version"),
    },
    body: json,
  };
  writeFileSync(join(OUT, `${nome}.json`), JSON.stringify(fixture, null, 2) + "\n");
  console.log(`✓ ${nome} → ${resp.status}`);
  ok++;
}
console.log(`\n${ok} fixtures em ${OUT}`);
