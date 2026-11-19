/**
 * Playground da Calculadora do Simples Nacional — NT 2026.005.
 * Abas: Cálculo (observabilidade por item), Atividades (catálogo cAtivSN) e
 * Erros (catálogo VSN-).
 */
import { useEffect, useMemo, useState } from "react";

type EstadoItem = "CALCULADO" | "NAO_CALCULADO" | "NAO_IMPLEMENTADO" | "INCONSISTENCIA_ENTRADA" | "FALHA_TECNICA";

interface TribCalc {
  vRBSNitem?: string;
  tpRBSN?: number;
  tpRBSNDescricao?: string;
  vBC?: string;
  pIBSSN?: string;
  vIBSSN?: string;
  vIBSPendSusp?: string;
  pCBSSN?: string;
  vCBSSN?: string;
  vCBSPendSusp?: string;
  IS?: { valor: string };
  totalItem?: string;
}

interface Objeto {
  nObj: number;
  estadoItem: EstadoItem;
  tribCalc?: TribCalc;
  erros?: Array<{ code: string | null; detail: string | null; pointer: string | null }>;
}

interface Total {
  vRBSNtot?: string;
  vBC?: string;
  vIBSSNtot?: string;
  vIBSSNtotPendSusp?: string;
  vCBSSNtot?: string;
  vCBSSNtotPendSusp?: string;
  totalIs?: string;
  totalTributos?: string;
}

interface RespostaCalculo {
  oper: Record<string, string>;
  objetos: Objeto[];
  total?: Total;
}

interface Problem {
  status: number;
  title: string;
  detail: string;
  errors?: Array<{ code: string | null; detail: string | null }>;
}

interface Atividade {
  codigo: string;
  ordem: number;
  descricao: string;
  anexoSemFatorR: string | null;
  anexoComFatorR: string | null;
  sujeitaFatorR: boolean;
  rotuloAnexo: string;
  disponivel: boolean;
  anexosFaltantes: string[];
  modoFatorR: string;
  tpDocsAdmissiveis: string[];
  admissivelNoDocumento?: boolean;
  compativelComClassTrib?: boolean;
}

/** Catálogo enxuto p/ autocomplete do cAtivSN (datalist). */
interface AtividadeOpcao {
  codigo: string;
  descricao: string;
}

const COR_ESTADO: Record<EstadoItem, string> = {
  CALCULADO: "ok",
  NAO_CALCULADO: "aviso",
  NAO_IMPLEMENTADO: "info",
  INCONSISTENCIA_ENTRADA: "erro",
  FALHA_TECNICA: "erro",
};

const CAMPOS_TRIB: Array<[keyof TribCalc, string]> = [
  ["vRBSNitem", "vRBSNitem"],
  ["tpRBSNDescricao", "tpRBSNDescricao"],
  ["vBC", "vBC"],
  ["pIBSSN", "pIBSSN"],
  ["vIBSSN", "vIBSSN"],
  ["vIBSPendSusp", "vIBSPendSusp"],
  ["pCBSSN", "pCBSSN"],
  ["vCBSSN", "vCBSSN"],
  ["vCBSPendSusp", "vCBSPendSusp"],
  ["totalItem", "totalItem"],
];

interface ItemForm {
  numero: string;
  cAtivSN: string;
  cClassTrib: string;
  baseCalculo: string;
  valorImpostoSeletivo: string;
  pIBSSN: string;
  pCBSSN: string;
}

const itemVazio = (n: number): ItemForm => ({
  numero: String(n),
  cAtivSN: "01",
  cClassTrib: "000001",
  baseCalculo: "1000.00",
  valorImpostoSeletivo: "0.00",
  pIBSSN: "1.25",
  pCBSSN: "2.75",
});

export default function App() {
  const [aba, setAba] = useState<"calculo" | "atividades" | "erros">("calculo");

  // ── Cálculo ──
  const [data, setData] = useState("2027-03-15");
  const [tpDoc, setTpDoc] = useState("55");
  const [crt, setCrt] = useState("1");
  const [tpRegime, setTpRegime] = useState("");
  const [tpEnteGov, setTpEnteGov] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([itemVazio(1)]);
  const [resposta, setResposta] = useState<RespostaCalculo | null>(null);
  const [problema, setProblema] = useState<Problem | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Autocomplete de cAtivSN: catálogo oficial vigente na data do fato gerador
  // (datalist — digitação livre continua válida; código fora do catálogo → NAO_CALCULADO).
  const [opcoesAtividade, setOpcoesAtividade] = useState<AtividadeOpcao[]>([]);
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
    let vivo = true;
    fetch(`/api/calculadora/simples-nacional/atividades?data=${data}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((lista: Atividade[]) => {
        if (vivo) setOpcoesAtividade(lista.map((a) => ({ codigo: a.codigo, descricao: a.descricao })));
      })
      .catch(() => setOpcoesAtividade([]));
    return () => {
      vivo = false;
    };
  }, [data]);

  async function calcular(): Promise<void> {
    setCarregando(true);
    setResposta(null);
    setProblema(null);
    try {
      const payload = {
        id: crypto.randomUUID(),
        versao: "2.0.0",
        data,
        tpDoc,
        CRT: crt,
        ...(tpRegime ? { tpRegimeIBSCBS: tpRegime } : {}),
        ...(tpEnteGov ? { tpEnteGov } : {}),
        itens: itens.map((i) => ({
          numero: i.numero === "" ? null : Number(i.numero),
          cAtivSN: i.cAtivSN || null,
          cClassTrib: i.cClassTrib,
          baseCalculo: i.baseCalculo,
          valorImpostoSeletivo: i.valorImpostoSeletivo,
          pIBSSN: i.pIBSSN || null,
          pCBSSN: i.pCBSSN || null,
        })),
      };
      const resp = await fetch("/api/calculadora/observabilidade/simples-nacional", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const corpo = await resp.json();
      if (resp.ok) setResposta(corpo as RespostaCalculo);
      else setProblema(corpo as Problem);
    } catch (e) {
      setProblema({ status: 0, title: "Falha de rede", detail: String(e) });
    } finally {
      setCarregando(false);
    }
  }

  // ── Atividades ──
  const [dataAtiv, setDataAtiv] = useState("2027-01-01");
  const [anexos, setAnexos] = useState("");
  const [tpDocAtiv, setTpDocAtiv] = useState("");
  const [cClassAtiv, setCClassAtiv] = useState("");
  const [atividades, setAtividades] = useState<Atividade[] | null>(null);
  const [erroAtiv, setErroAtiv] = useState<string | null>(null);

  async function buscarAtividades(): Promise<void> {
    setErroAtiv(null);
    const qs = new URLSearchParams({ data: dataAtiv });
    if (anexos) qs.set("anexos", anexos);
    if (tpDocAtiv) qs.set("tpDoc", tpDocAtiv);
    if (cClassAtiv) qs.set("cClassTrib", cClassAtiv);
    const resp = await fetch(`/api/calculadora/simples-nacional/atividades?${qs}`);
    if (resp.ok) {
      setAtividades((await resp.json()) as Atividade[]);
    } else {
      setAtividades(null);
      const p = (await resp.json()) as Problem;
      setErroAtiv(p.detail ?? String(p));
    }
  }

  // ── Erros VSN ──
  const [codigo, setCodigo] = useState("VSN-027");
  const [erroDetalhe, setErroDetalhe] = useState<{ codigo: string; titulo: string; descricao: string } | null>(null);

  async function buscarErro(): Promise<void> {
    setErroDetalhe(null);
    const resp = await fetch(`/api/calculadora/observabilidade/simples-nacional/erros?codigo=${codigo}`);
    if (resp.ok) setErroDetalhe(await resp.json());
  }

  const totalResumo = useMemo(() => {
    if (!resposta?.total) return null;
    const t = resposta.total;
    return (
      <table className="tabela">
        <thead>
          <tr>
            <th>vRBSNtot</th>
            <th>vBC</th>
            <th>vIBSSNtot</th>
            <th>vCBSSNtot</th>
            <th>totalIs</th>
            <th>totalTributos</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t.vRBSNtot ?? "—"}</td>
            <td>{t.vBC ?? "—"}</td>
            <td>{t.vIBSSNtot ?? "—"}</td>
            <td>{t.vCBSSNtot ?? "—"}</td>
            <td>{t.totalIs ?? "—"}</td>
            <td className="destaque">{t.totalTributos ?? "—"}</td>
          </tr>
        </tbody>
      </table>
    );
  }, [resposta]);

  return (
    <main>
      <datalist id="cativsn-opcoes">
        {opcoesAtividade.map((a) => (
          <option key={a.codigo} value={a.codigo}>
            {a.descricao}
          </option>
        ))}
      </datalist>
      <header>
        <h1>Calculadora de Tributos — Simples Nacional</h1>
        <p className="sub">CBS e IBS na LC 214/2025 · NT 2026.005 · porte TypeScript com paridade estrita</p>
        <nav>
          <button className={aba === "calculo" ? "ativo" : ""} onClick={() => setAba("calculo")}>Cálculo</button>
          <button className={aba === "atividades" ? "ativo" : ""} onClick={() => setAba("atividades")}>Atividades</button>
          <button className={aba === "erros" ? "ativo" : ""} onClick={() => setAba("erros")}>Erros VSN</button>
        </nav>
      </header>

      {aba === "calculo" && (
        <section>
          <div className="grid-oper">
            <label>Data do fato gerador<input value={data} onChange={(e) => setData(e.target.value)} placeholder="2027-03-15" /></label>
            <label>tpDoc<input value={tpDoc} onChange={(e) => setTpDoc(e.target.value)} placeholder="55" /></label>
            <label>CRT<input value={crt} onChange={(e) => setCrt(e.target.value)} placeholder="1" /></label>
            <label>tpRegimeIBSCBS<input value={tpRegime} onChange={(e) => setTpRegime(e.target.value)} placeholder="(vazio)" /></label>
            <label>tpEnteGov<input value={tpEnteGov} onChange={(e) => setTpEnteGov(e.target.value)} placeholder="(vazio)" /></label>
          </div>

          <h2>Itens</h2>
          {itens.map((item, idx) => (
            <fieldset key={idx}>
              <legend>Item {idx + 1}</legend>
              <div className="grid-item">
                <label>nº<input value={item.numero} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, numero: e.target.value } : x))} /></label>
                <label>cAtivSN<input list="cativsn-opcoes" value={item.cAtivSN} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, cAtivSN: e.target.value } : x))} /></label>
                <label>cClassTrib<input value={item.cClassTrib} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, cClassTrib: e.target.value } : x))} /></label>
                <label>baseCalculo<input value={item.baseCalculo} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, baseCalculo: e.target.value } : x))} /></label>
                <label>vIS<input value={item.valorImpostoSeletivo} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, valorImpostoSeletivo: e.target.value } : x))} /></label>
                <label>pIBSSN<input value={item.pIBSSN} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, pIBSSN: e.target.value } : x))} /></label>
                <label>pCBSSN<input value={item.pCBSSN} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, pCBSSN: e.target.value } : x))} /></label>
              </div>
              {itens.length > 1 && (
                <button className="linha" onClick={() => setItens(itens.filter((_, i) => i !== idx))}>Remover item</button>
              )}
            </fieldset>
          ))}
          <div className="acoes">
            <button onClick={() => setItens([...itens, itemVazio(itens.length + 1)])}>+ Item</button>
            <button className="primario" onClick={calcular} disabled={carregando}>
              {carregando ? "Calculando…" : "Calcular"}
            </button>
          </div>

          {problema && (
            <div className="box erro">
              <strong>HTTP {problema.status} — {problema.title}</strong>
              <p>{problema.detail}</p>
              {problema.errors?.map((e, i) => (
                <p key={i} className="mono">{e.code} · {e.detail}</p>
              ))}
            </div>
          )}

          {resposta && (
            <>
              <h2>Resultado</h2>
              {resposta.objetos.map((obj) => (
                <div key={obj.nObj} className={`item ${COR_ESTADO[obj.estadoItem]}`}>
                  <div className="cabecalho-item">
                    <strong>Item {obj.nObj}</strong>
                    <span className={`pill ${COR_ESTADO[obj.estadoItem]}`}>{obj.estadoItem}</span>
                  </div>
                  {obj.tribCalc && (
                    <table className="tabela">
                      <tbody>
                        {CAMPOS_TRIB.filter(([k]) => obj.tribCalc![k] !== undefined).map(([k, rotulo]) => (
                          <tr key={k}>
                            <th>{rotulo}</th>
                            <td className="mono">{String(obj.tribCalc![k])}</td>
                          </tr>
                        ))}
                        {obj.tribCalc.IS && (
                          <tr><th>IS.valor</th><td className="mono">{obj.tribCalc.IS.valor}</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}
                  {obj.erros?.map((e, i) => (
                    <p key={i} className="mono erro-texto">{e.code} · {e.pointer} · {e.detail}</p>
                  ))}
                </div>
              ))}
              <h3>Total</h3>
              {totalResumo ?? <p className="sub">Sem itens calculáveis — nenhum total gerado.</p>}
            </>
          )}
        </section>
      )}

      {aba === "atividades" && (
        <section>
          <div className="grid-oper">
            <label>Data<input value={dataAtiv} onChange={(e) => setDataAtiv(e.target.value)} /></label>
            <label>Anexos (CSV)<input value={anexos} onChange={(e) => setAnexos(e.target.value)} placeholder="I,II,III,IV,V" /></label>
            <label>tpDoc<input value={tpDocAtiv} onChange={(e) => setTpDocAtiv(e.target.value)} placeholder="(vazio)" /></label>
            <label>cClassTrib<input value={cClassAtiv} onChange={(e) => setCClassAtiv(e.target.value)} placeholder="(vazio)" /></label>
          </div>
          <button className="primario" onClick={buscarAtividades}>Consultar atividades</button>
          {erroAtiv && <div className="box erro"><p>{erroAtiv}</p></div>}
          {atividades && (
            <table className="tabela">
              <thead>
                <tr>
                  <th>#</th><th>código</th><th>descrição</th><th>anexos</th><th>Fator R</th>
                  <th>tpDocs</th><th>disp.</th>
                </tr>
              </thead>
              <tbody>
                {atividades.map((a) => (
                  <tr key={a.codigo} className={a.disponivel ? "" : "linha-off"}>
                    <td>{a.ordem}</td>
                    <td className="mono">{a.codigo}</td>
                    <td>{a.descricao}</td>
                    <td>{a.rotuloAnexo}</td>
                    <td>{a.modoFatorR}</td>
                    <td className="mono">{a.tpDocsAdmissiveis.join(" ")}</td>
                    <td>{a.disponivel ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {aba === "erros" && (
        <section>
          <div className="grid-oper">
            <label>Código<input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="VSN-001" /></label>
          </div>
          <button className="primario" onClick={buscarErro}>Consultar</button>
          {erroDetalhe && (
            <div className="box info">
              <strong className="mono">{erroDetalhe.codigo}</strong>
              <p>{erroDetalhe.titulo}</p>
              <p>{erroDetalhe.descricao}</p>
            </div>
          )}
        </section>
      )}

      <footer>
        <span>Receita Federal · LC 123/2006 + LC 214/2025 · NT 2026.005 — porte TS (paridade estrita)</span>
      </footer>
    </main>
  );
}
