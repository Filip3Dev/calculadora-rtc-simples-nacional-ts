/**
 * Serialização dos domínios do Simples Nacional — equivalente aos
 * serializers Jackson + @JsonInclude(NON_NULL) + @JsonPropertyOrder.
 * Valores monetários saem com 2 casas (TDec1302), alíquotas com 2-4 casas
 * (TDec0302_04), sempre como strings — como na API oficial.
 */
import { formatarAliquota, formatarMoeda, type JBD } from "./jbd.js";
import type { AtividadeSimplesDomain } from "./atividades.js";
import type {
  ErroDetalhe,
} from "./erros.js";
import type {
  ObservabilidadeSimplesDomain,
  ObjetoSimplesDomain,
  TotalSimplesDomain,
  TributosSimplesDomain,
} from "./tipos.js";

type Json = Record<string, unknown>;

/** Remove chaves com valor null/undefined (equivalente a @JsonInclude(NON_NULL)). */
export function clean<T>(o: T): T {
  if (Array.isArray(o)) return o.map(clean) as unknown as T;
  if (o !== null && typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      out[k] = clean(v);
    }
    return out as T;
  }
  return o;
}

const moeda = (v: JBD | undefined): string | undefined =>
  v === undefined ? undefined : formatarMoeda(v);
const aliq = (v: JBD | undefined): string | undefined =>
  v === undefined ? undefined : formatarAliquota(v);

// ─── Observabilidade (NON_NULL, ordem @JsonPropertyOrder) ────────────────────

export function serializarErro(e: ErroDetalhe): Json {
  return clean({ type: e.type, title: e.title, code: e.code, pointer: e.pointer, detail: e.detail });
}

function tributosJson(t: TributosSimplesDomain): Json {
  return clean({
    vRBSNitem: moeda(t.vRBSNitem),
    tpRBSN: t.tpRBSN,
    tpRBSNDescricao: t.tpRBSNDescricao,
    vBC: moeda(t.vBC),
    pIBSSN: aliq(t.pIBSSN),
    vIBSSN: moeda(t.vIBSSN),
    vIBSPendSusp: moeda(t.vIBSPendSusp),
    pCBSSN: aliq(t.pCBSSN),
    vCBSSN: moeda(t.vCBSSN),
    vCBSPendSusp: moeda(t.vCBSPendSusp),
    IS: t.IS ? clean({ valor: moeda(t.IS.valor) }) : undefined,
    totalItem: moeda(t.totalItem),
  });
}

function objetoJson(o: ObjetoSimplesDomain): Json {
  return clean({
    nObj: o.nObj,
    estadoItem: o.estadoItem,
    tribCalc: o.tribCalc ? tributosJson(o.tribCalc) : undefined,
    erros: o.erros ? o.erros.map(serializarErro) : undefined,
  });
}

function totalJson(t: TotalSimplesDomain): Json {
  return clean({
    vRBSNtot: moeda(t.vRBSNtot),
    vBC: moeda(t.vBC),
    vIBSSNtot: moeda(t.vIBSSNtot),
    vIBSSNtotPendSusp: moeda(t.vIBSSNtotPendSusp),
    vCBSSNtot: moeda(t.vCBSSNtot),
    vCBSSNtotPendSusp: moeda(t.vCBSSNtotPendSusp),
    totalIs: moeda(t.totalIs),
    totalTributos: moeda(t.totalTributos),
  });
}

export function serializarObservabilidade(d: ObservabilidadeSimplesDomain): Json {
  return clean({
    oper: clean({
      data: d.oper.data,
      tpDoc: d.oper.tpDoc,
      CRT: d.oper.CRT,
      tpRegimeIBSCBS: d.oper.tpRegimeIBSCBS,
      tpEnteGov: d.oper.tpEnteGov,
    }),
    objetos: d.objetos.map(objetoJson),
    total: d.total ? totalJson(d.total) : undefined,
  });
}

// ─── Catálogo de atividades (@JsonInclude(ALWAYS) exceto campos condicionais) ─

export function serializarAtividade(a: AtividadeSimplesDomain): Json {
  // PARITY: a classe usa @JsonInclude(ALWAYS) — anexos null PRECISAM sair como
  // null; apenas admissivelNoDocumento/compativelComClassTrib são NON_NULL.
  return {
    codigo: a.codigo,
    ordem: a.ordem,
    descricao: a.descricao,
    anexoSemFatorR: a.anexoSemFatorR,
    anexoComFatorR: a.anexoComFatorR,
    sujeitaFatorR: a.sujeitaFatorR,
    rotuloAnexo: a.rotuloAnexo,
    rotuloCurtoAnexo: a.rotuloCurtoAnexo,
    disponivel: a.disponivel,
    anexosFaltantes: a.anexosFaltantes,
    modoFatorR: a.modoFatorR,
    tpDocsAdmissiveis: a.tpDocsAdmissiveis,
    ...(a.admissivelNoDocumento !== undefined ? { admissivelNoDocumento: a.admissivelNoDocumento } : {}),
    ...(a.compativelComClassTrib !== undefined ? { compativelComClassTrib: a.compativelComClassTrib } : {}),
  };
}
