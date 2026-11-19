/**
 * Repositórios SQLite do cálculo e do catálogo do Simples Nacional — porte
 * fiel das queries de *Repository (Spring Data JPA, consultas nativas).
 *
 * Todas as vigências usam a DATA DO FATO GERADOR (texto ISO yyyy-MM-dd —
 * o SQLite compara TEXT lexicograficamente, como o driver JDBC com
 * date_class=TEXT&date_string_format=yyyy-MM-dd do original).
 *
 * PARITY: CLTR_CD NÃO é único (grupos IS/CBS colidem) — toda resolução de
 * cClassTrib restringe ao grupo da CBS (TRIBUTO_SITUACAO_TRIBUTARIA com
 * TRST_TBTO_ID = 2).
 */
import Database from "better-sqlite3";
import { JBD } from "../jbd.js";
import type {
  AtividadeSimplesNacional,
  ClassificacaoTributariaSimples,
  RegimeApuracaoSimples,
  TipoReceitaBrutaSimples,
  TransicaoAliquotaCompraGovSimples,
  VersaoBaseDados,
} from "../tipos.js";

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) throw new Error(`Valor não numérico no banco: ${v}`);
  return n;
};
const bool = (v: unknown): boolean => (typeof v === "number" ? v !== 0 : v === 1 || v === "1" || v === true);
const str = (v: unknown): string => String(v ?? "");
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

// ─── Conversores de linha (projeções enxutas das entidades) ──────────────────

function regimeDe(row: Row): RegimeApuracaoSimples {
  return {
    id: num(row.RASN_ID),
    crt: num(row.RASN_CRT),
    tpRegimeIBSCBS: row.RASN_TPREGIMEIBSCBS === null ? null : num(row.RASN_TPREGIMEIBSCBS),
    descricao: str(row.RASN_DESCRICAO),
    geraIbs: bool(row.RASN_IN_GERA_IBS),
    destinoDevido: str(row.RASN_DESTINO_DEVIDO) as RegimeApuracaoSimples["destinoDevido"],
    destinoPendenteSuspenso: str(row.RASN_DESTINO_PENDENTE_SUSPENSO) as RegimeApuracaoSimples["destinoPendenteSuspenso"],
    inicioVigencia: str(row.RASN_INICIO_VIGENCIA),
    fimVigencia: strOrNull(row.RASN_FIM_VIGENCIA),
  };
}

function tipoReceitaDe(row: Row): TipoReceitaBrutaSimples {
  return {
    id: num(row.TRBS_ID),
    codigo: num(row.TRBS_CD),
    descricao: str(row.TRBS_DESCRICAO),
    compoeReceita: bool(row.TRBS_IN_COMPOE_RECEITA),
    impostoSeletivoCompoeReceita: bool(row.TRBS_IN_IS_COMPOE_RECEITA),
    fatorReceita: JBD.parse(str(row.TRBS_FATOR_RECEITA)),
    pendenteSuspenso: bool(row.TRBS_IN_PENDENTE_SUSPENSO),
    exigeAliquota: bool(row.TRBS_IN_EXIGE_ALIQUOTA),
    vedadoNaoTributavel: bool(row.TRBS_IN_VEDADO_NAO_TRIBUTAVEL),
    inicioVigencia: str(row.TRBS_INICIO_VIGENCIA),
    fimVigencia: strOrNull(row.TRBS_FIM_VIGENCIA),
  };
}

function transicaoDe(row: Row): TransicaoAliquotaCompraGovSimples {
  return {
    id: num(row.TACG_ID),
    fator: JBD.parse(str(row.TACG_FATOR)),
    inicioVigencia: str(row.TACG_INICIO_VIGENCIA),
    fimVigencia: strOrNull(row.TACG_FIM_VIGENCIA),
  };
}

function classificacaoDe(row: Row): ClassificacaoTributariaSimples {
  return {
    id: num(row.CLTR_ID),
    codigo: str(row.CLTR_CD),
    tpRBSN: num(row.CLTR_TPRBSN),
    inicioVigencia: str(row.CLTR_INICIO_VIGENCIA),
    fimVigencia: strOrNull(row.CLTR_FIM_VIGENCIA),
  };
}

function atividadeDe(row: Row): AtividadeSimplesNacional {
  return {
    id: num(row.ATSN_ID),
    ordem: num(row.ATSN_ORDEM),
    descricao: str(row.ATSN_DESCRICAO),
    anexoSemFatorR: strOrNull(row.ATSN_ANEXO_SEM_FATOR_R),
    anexoComFatorR: strOrNull(row.ATSN_ANEXO_COM_FATOR_R),
    rotulo: str(row.ATSN_ROTULO),
    rotuloCurto: str(row.ATSN_ROTULO_CURTO),
    inicioVigencia: str(row.ATSN_INICIO_VIGENCIA),
    fimVigencia: strOrNull(row.ATSN_FIM_VIGENCIA),
    cAtivSN: strOrNull(row.ATSN_CATIVSN),
    naoTributavel: bool(row.ATSN_IN_NAO_TRIBUTAVEL),
  };
}

/** SELECT de ATIVIDADE_SIMPLES_NACIONAL por colunas explícitas (linhas têm colunas com nome ATSN_*). */
const ATIVIDADE_COLS =
  "ATSN_ID, ATSN_ORDEM, ATSN_DESCRICAO, ATSN_ANEXO_SEM_FATOR_R, ATSN_ANEXO_COM_FATOR_R, " +
  "ATSN_ROTULO, ATSN_ROTULO_CURTO, ATSN_INICIO_VIGENCIA, ATSN_FIM_VIGENCIA, ATSN_CATIVSN, ATSN_IN_NAO_TRIBUTAVEL";

// ─── Classe de acesso ────────────────────────────────────────────────────────

export class RepositoriosSimples {
  constructor(private readonly db: Database.Database) {}

  // ── AtividadeSimplesCalculoRepository ─────────────────────────────────────

  /** Atividades com o código oficial, vigentes na data (vigência mais recente primeiro). */
  buscarVigentesPorCAtivSN(cAtivSN: string, data: string): AtividadeSimplesNacional[] {
    return (
      this.db
        .prepare(
          `SELECT ${ATIVIDADE_COLS}
           FROM ATIVIDADE_SIMPLES_NACIONAL
           WHERE ATSN_CATIVSN = ?
             AND ? BETWEEN ATSN_INICIO_VIGENCIA AND COALESCE(ATSN_FIM_VIGENCIA, ?)
           ORDER BY ATSN_INICIO_VIGENCIA DESC`,
        )
        .all(cAtivSN, data, data) as Row[]
    ).map(atividadeDe);
  }

  /** Conta vínculos vigentes da atividade com o tpDoc (whitelist TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL). */
  contarVinculosComTpDoc(atividadeId: number, tpDoc: number, data: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(1) AS total
         FROM TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL t
         JOIN TIPO_DFE td ON td.TPDF_ID = t.TDAS_TPDF_ID
         WHERE t.TDAS_ATSN_ID = ?
           AND td.TPDF_TIPO = ?
           AND ? BETWEEN t.TDAS_INICIO_VIGENCIA AND COALESCE(t.TDAS_FIM_VIGENCIA, ?)
           AND ? BETWEEN td.TPDF_INICIO_VIGENCIA AND COALESCE(td.TPDF_FIM_VIGENCIA, ?)`,
      )
      .get(atividadeId, tpDoc, data, data, data, data) as Row;
    return num(row.total);
  }

  // ── ClassificacaoTributariaSimplesRepository ──────────────────────────────

  /** Classificações DO GRUPO DA CBS (tributo 2) com o código, vigentes na data (mais recente primeiro). */
  buscarVigentesClassificacao(codigo: string, data: string): ClassificacaoTributariaSimples[] {
    return (
      this.db
        .prepare(
          `SELECT ct.*
           FROM CLASSIFICACAO_TRIBUTARIA ct
           WHERE ct.CLTR_CD = ?
             AND ? BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, ?)
             AND ct.CLTR_SITR_ID IN (
               SELECT tst.TRST_SITR_ID
               FROM TRIBUTO_SITUACAO_TRIBUTARIA tst
               WHERE tst.TRST_TBTO_ID = 2
             )
           ORDER BY ct.CLTR_INICIO_VIGENCIA DESC`,
        )
        .all(codigo, data, data) as Row[]
    ).map(classificacaoDe);
  }

  /** Conta vínculos vigentes entre o cClassTrib (grupo CBS) e o tpDoc. */
  contarVinculosClassificacaoComTpDoc(codigo: string, tpDoc: number, data: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(1) AS total
         FROM TIPO_DFE_CLASSIFICACAO tdcl
         JOIN TIPO_DFE td ON td.TPDF_ID = tdcl.TDCL_TPDF_ID
         JOIN CLASSIFICACAO_TRIBUTARIA ct ON ct.CLTR_ID = tdcl.TDCL_CLTR_ID
         WHERE ct.CLTR_CD = ?
           AND td.TPDF_TIPO = ?
           AND ct.CLTR_SITR_ID IN (
             SELECT tst.TRST_SITR_ID
             FROM TRIBUTO_SITUACAO_TRIBUTARIA tst
             WHERE tst.TRST_TBTO_ID = 2
           )
           AND ? BETWEEN tdcl.TDCL_INICIO_VIGENCIA AND COALESCE(tdcl.TDCL_FIM_VIGENCIA, ?)
           AND ? BETWEEN td.TPDF_INICIO_VIGENCIA AND COALESCE(td.TPDF_FIM_VIGENCIA, ?)`,
      )
      .get(codigo, tpDoc, data, data, data, data) as Row;
    return num(row.total);
  }

  /**
   * Conta vínculos VIGENTES entre o cClassTrib (grupo CBS) e tratamentos
   * marcados "sem implementação" (TRTR_IN_POSSUI_AJUSTE=1) — NAO_IMPLEMENTADO
   * (VSN-027). PRIMEIRA consulta de banco do item (prioridade máxima).
   */
  contarTratamentosNaoImplementados(codigo: string, data: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(1) AS total
         FROM TRATAMENTO_CLASSIFICACAO tc
         JOIN TRATAMENTO_TRIBUTARIO tt ON tt.TRTR_ID = tc.TRCL_TRTR_ID
         JOIN CLASSIFICACAO_TRIBUTARIA ct ON ct.CLTR_ID = tc.TRCL_CLTR_ID
         WHERE ct.CLTR_CD = ?
           AND tt.TRTR_IN_POSSUI_AJUSTE = 1
           AND ct.CLTR_SITR_ID IN (
             SELECT tst.TRST_SITR_ID
             FROM TRIBUTO_SITUACAO_TRIBUTARIA tst
             WHERE tst.TRST_TBTO_ID = 2
           )
           AND ? BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, ?)
           AND ? BETWEEN tc.TRCL_INICIO_VIGENCIA AND COALESCE(tc.TRCL_FIM_VIGENCIA, ?)
           AND ? BETWEEN tt.TRTR_INICIO_VIGENCIA AND COALESCE(tt.TRTR_FIM_VIGENCIA, ?)`,
      )
      .get(codigo, data, data, data, data, data, data) as Row;
    return num(row.total);
  }

  // ── RegimeApuracaoSimplesRepository ───────────────────────────────────────

  /** Linhas da combinação CRT × tpRegimeIBSCBS vigentes na data (tpRegime null casa coluna null). */
  buscarVigentesRegime(crt: number, tpRegimeIBSCBS: number | null, data: string): RegimeApuracaoSimples[] {
    return (
      this.db
        .prepare(
          `SELECT *
           FROM REGIME_APURACAO_SIMPLES_NACIONAL
           WHERE RASN_CRT = ?
             AND ((? IS NULL AND RASN_TPREGIMEIBSCBS IS NULL) OR RASN_TPREGIMEIBSCBS = ?)
             AND ? BETWEEN RASN_INICIO_VIGENCIA AND COALESCE(RASN_FIM_VIGENCIA, ?)
           ORDER BY RASN_INICIO_VIGENCIA DESC`,
        )
        .all(crt, tpRegimeIBSCBS, tpRegimeIBSCBS, data, data) as Row[]
    ).map(regimeDe);
  }

  // ── TipoDfeCalculoSimplesRepository ───────────────────────────────────────

  /** Conta vínculos vigentes do tpDoc com o cálculo do Simples (TIPO_DFE_CALCULO_SIMPLES_NACIONAL). */
  contarVinculosVigentesTipoDfe(tpDoc: number, data: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(1) AS total
         FROM TIPO_DFE_CALCULO_SIMPLES_NACIONAL t
         JOIN TIPO_DFE td ON td.TPDF_ID = t.TDCS_TPDF_ID
         WHERE td.TPDF_TIPO = ?
           AND ? BETWEEN t.TDCS_INICIO_VIGENCIA AND COALESCE(t.TDCS_FIM_VIGENCIA, ?)
           AND ? BETWEEN td.TPDF_INICIO_VIGENCIA AND COALESCE(td.TPDF_FIM_VIGENCIA, ?)`,
      )
      .get(tpDoc, data, data, data, data) as Row;
    return num(row.total);
  }

  // ── TipoReceitaBrutaSimplesRepository ─────────────────────────────────────

  /** Efeitos do tpRBSN vigentes na data (mais recente primeiro). */
  buscarVigentesPorCodigoTipoReceita(codigo: number, data: string): TipoReceitaBrutaSimples[] {
    return (
      this.db
        .prepare(
          `SELECT *
           FROM TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL
           WHERE TRBS_CD = ?
             AND ? BETWEEN TRBS_INICIO_VIGENCIA AND COALESCE(TRBS_FIM_VIGENCIA, ?)
           ORDER BY TRBS_INICIO_VIGENCIA DESC`,
        )
        .all(codigo, data, data) as Row[]
    ).map(tipoReceitaDe);
  }

  // ── TransicaoAliquotaCompraGovSimplesRepository ───────────────────────────

  /** Fatores de transição vigentes na data (mais recente primeiro). */
  buscarVigentesTransicao(data: string): TransicaoAliquotaCompraGovSimples[] {
    return (
      this.db
        .prepare(
          `SELECT *
           FROM TRANSICAO_ALIQUOTA_COMPRA_GOV_SIMPLES_NACIONAL
           WHERE ? BETWEEN TACG_INICIO_VIGENCIA AND COALESCE(TACG_FIM_VIGENCIA, ?)
           ORDER BY TACG_INICIO_VIGENCIA DESC`,
        )
        .all(data, data) as Row[]
    ).map(transicaoDe);
  }

  // ── AtividadeSimplesRepository (catálogo p/ endpoint de atividades) ───────

  /** Atividades vigentes na data, ordenadas por ATSN_ORDEM. */
  buscarVigentesAtividades(data: string): AtividadeSimplesNacional[] {
    return (
      this.db
        .prepare(
          `SELECT ${ATIVIDADE_COLS}
           FROM ATIVIDADE_SIMPLES_NACIONAL
           WHERE ? BETWEEN ATSN_INICIO_VIGENCIA AND COALESCE(ATSN_FIM_VIGENCIA, ?)
           ORDER BY ATSN_ORDEM ASC`,
        )
        .all(data, data) as Row[]
    ).map(atividadeDe);
  }

  /** Todos os vínculos vigentes da associativa atividade×tpDoc (whitelist), com o TPDF_TIPO. */
  buscarVinculosTpDocVigentes(data: string): Array<{ atividadeId: number; tpDoc: number }> {
    const rows = this.db
      .prepare(
        `SELECT t.TDAS_ATSN_ID AS atividadeId, td.TPDF_TIPO AS tpDoc
         FROM TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL t
         JOIN TIPO_DFE td ON td.TPDF_ID = t.TDAS_TPDF_ID
           AND ? BETWEEN td.TPDF_INICIO_VIGENCIA AND COALESCE(td.TPDF_FIM_VIGENCIA, ?)
         WHERE ? BETWEEN t.TDAS_INICIO_VIGENCIA AND COALESCE(t.TDAS_FIM_VIGENCIA, ?)`,
      )
      .all(data, data, data, data) as Row[];
    return rows.map((r) => ({ atividadeId: num(r.atividadeId), tpDoc: num(r.tpDoc) }));
  }

  /** Conta linhas de TIPO_DFE com o tipo informado (validação do query param tpDoc). */
  contarTiposDfePorTipo(tpDoc: number): number {
    const row = this.db
      .prepare(`SELECT COUNT(1) AS total FROM TIPO_DFE td WHERE td.TPDF_TIPO = ?`)
      .get(tpDoc) as Row;
    return num(row.total);
  }

  // ── VersaoBaseDadosRepository ─────────────────────────────────────────────

  /** Última versão da base (findTopByOrderByIdDesc). */
  buscarUltimaVersaoBase(): VersaoBaseDados | null {
    const row = this.db
      .prepare(`SELECT * FROM VERSAO_BASE_DADO ORDER BY VRBD_ID DESC LIMIT 1`)
      .get() as Row | undefined;
    if (!row) return null;
    return {
      id: num(row.VRBD_ID),
      data: str(row.VRBD_DATA),
      descricao: str(row.VRBD_DESCRICAO),
      numeroVersao: str(row.VRBD_VERSAO_BASE_DADO),
    };
  }
}

/** Abre o banco SQLite em modo somente leitura (equivalente ao mode=ro do JDBC). */
export function abrirBanco(caminho: string): RepositoriosSimples {
  const db = new Database(caminho, { readonly: true, fileMustExist: true });
  return new RepositoriosSimples(db);
}
