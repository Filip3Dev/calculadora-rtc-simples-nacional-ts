/**
 * Serviço do catálogo de Atividades do Simples Nacional — porte fiel de
 * AtividadeSimplesService. Erros de parâmetro viram ErroRespostaHttp (o
 * Java usa ResponseStatusException 400 com reason específico).
 */
import { derivar, ANEXOS_VALIDOS } from "./derivacao-anexos.js";
import { ParametroCalculoSimplesService } from "./parametrizacao.js";
import type { RepositoriosSimples } from "./db/repositorios.js";
import type { AtividadeSimplesNacional, ModoFatorR } from "./tipos.js";

/** Exceção com status+reason (equivalente ResponseStatusException do Java). */
export class ErroRespostaHttp extends Error {
  constructor(
    readonly status: number,
    readonly motivo: string,
  ) {
    super(motivo);
  }
}

/** Saída do catálogo — ordem/serialização em serialize.ts (@JsonInclude(ALWAYS)). */
export interface AtividadeSimplesDomain {
  codigo: string;
  ordem: number;
  descricao: string;
  anexoSemFatorR: string | null;
  anexoComFatorR: string | null;
  sujeitaFatorR: boolean;
  rotuloAnexo: string;
  rotuloCurtoAnexo: string;
  disponivel: boolean;
  anexosFaltantes: string[];
  modoFatorR: ModoFatorR;
  tpDocsAdmissiveis: string[];
  admissivelNoDocumento?: boolean;
  compativelComClassTrib?: boolean;
}

export class AtividadeSimplesService {
  private readonly parametros: ParametroCalculoSimplesService;

  constructor(
    private readonly repos: RepositoriosSimples,
    parametros?: ParametroCalculoSimplesService,
  ) {
    this.parametros = parametros ?? new ParametroCalculoSimplesService(repos);
  }

  listar(
    data: string,
    anexosConfigurados: ReadonlySet<string> | null,
    tpDoc: string | null,
    cClassTrib: string | null,
  ): AtividadeSimplesDomain[] {
    const tpDocValidado = this.validarTpDoc(tpDoc);
    const vedadoNaoTributavel = this.resolverVedadoNaoTributavel(cClassTrib, data);
    const tpDocsAdmissiveisPorAtividade = this.buscarTpDocsAdmissiveis(data);
    return this.repos.buscarVigentesAtividades(data).map((atividade) =>
      this.toDomain(
        atividade,
        anexosConfigurados,
        tpDocsAdmissiveisPorAtividade.get(atividade.id) ?? [],
        tpDocValidado,
        vedadoNaoTributavel,
      ),
    );
  }

  buscarPorCodigo(
    codigo: string | null,
    data: string,
    tpDoc: string | null,
    cClassTrib: string | null,
  ): AtividadeSimplesDomain | null {
    if (codigo === null) {
      return null;
    }
    return (
      this.listar(data, null, tpDoc, cClassTrib).find(
        (atividade) => atividade.codigo === codigo,
      ) ?? null
    );
  }

  private validarTpDoc(tpDoc: string | null): string | null {
    if (tpDoc === null || tpDoc.trim() === "") {
      return null;
    }
    const informado = tpDoc.trim();
    const tipo = /^[+-]?\d+$/.test(informado) ? parseInt(informado, 10) : NaN;
    if (Number.isNaN(tipo)) {
      throw new ErroRespostaHttp(
        400,
        `Tipo de documento fiscal inválido: '${informado}'` +
          `. Informe o valor numérico da coluna TPDF_TIPO da TIPO_DFE (ex.: 55, 65, 91).`,
      );
    }
    if (tipo < 0 || this.repos.contarTiposDfePorTipo(tipo) === 0) {
      throw new ErroRespostaHttp(
        400,
        `Tipo de documento fiscal desconhecido: '${informado}'` +
          `. Não há linha na TIPO_DFE com TPDF_TIPO correspondente.`,
      );
    }
    return String(tipo);
  }

  private resolverVedadoNaoTributavel(cClassTrib: string | null, data: string): boolean | null {
    if (cClassTrib === null || cClassTrib.trim() === "") {
      return null;
    }
    const codigo = cClassTrib.trim();
    const vigentes = this.repos.buscarVigentesClassificacao(codigo, data);
    if (vigentes.length === 0) {
      throw new ErroRespostaHttp(
        400,
        `Código de classificação tributária desconhecido ou fora de vigência: '${codigo}'` +
          `. Informe um cClassTrib do grupo da CBS vigente na data de referência.`,
      );
    }
    const tpRBSN = vigentes[0].tpRBSN;
    const tipoReceita = this.parametros.buscarTipoReceitaBruta(tpRBSN, data);
    if (tipoReceita === null) {
      throw new ErroRespostaHttp(
        400,
        `Não há parametrização de efeito vigente para o tipo de receita bruta tpRBSN=${tpRBSN}` +
          ` do cClassTrib '${codigo}' na data de referência.`,
      );
    }
    return tipoReceita.vedadoNaoTributavel;
  }

  private buscarTpDocsAdmissiveis(data: string): Map<number, string[]> {
    const porAtividade = new Map<number, number[]>();
    for (const vinculo of this.repos.buscarVinculosTpDocVigentes(data)) {
      const lista = porAtividade.get(vinculo.atividadeId) ?? [];
      lista.push(vinculo.tpDoc);
      porAtividade.set(vinculo.atividadeId, lista);
    }
    const resultado = new Map<number, string[]>();
    for (const [atividadeId, tpDocs] of porAtividade) {
      resultado.set(
        atividadeId,
        tpDocs.sort((a, b) => a - b).map(String),
      );
    }
    return resultado;
  }

  private toDomain(
    atividade: AtividadeSimplesNacional,
    anexosConfigurados: ReadonlySet<string> | null,
    tpDocsAdmissiveis: string[],
    tpDoc: string | null,
    vedadoNaoTributavel: boolean | null,
  ): AtividadeSimplesDomain {
    const derivacao = derivar(
      atividade.anexoSemFatorR,
      atividade.anexoComFatorR,
      anexosConfigurados,
    );
    const admissivelNoDocumento = tpDoc === null ? null : tpDocsAdmissiveis.includes(tpDoc);
    const compativelComClassTrib =
      vedadoNaoTributavel === null
        ? null
        : !(vedadoNaoTributavel && atividade.naoTributavel);
    const disponivel =
      derivacao.disponivel &&
      admissivelNoDocumento !== false &&
      compativelComClassTrib !== false;

    const domain: AtividadeSimplesDomain = {
      codigo: atividade.cAtivSN!,
      ordem: atividade.ordem,
      descricao: atividade.descricao,
      anexoSemFatorR: atividade.anexoSemFatorR,
      anexoComFatorR: atividade.anexoComFatorR,
      sujeitaFatorR: atividade.anexoComFatorR !== null,
      rotuloAnexo: atividade.rotulo,
      rotuloCurtoAnexo: atividade.rotuloCurto,
      disponivel,
      anexosFaltantes: derivacao.anexosFaltantes,
      modoFatorR: derivacao.modoFatorR,
      tpDocsAdmissiveis,
    };
    if (admissivelNoDocumento !== null) {
      domain.admissivelNoDocumento = admissivelNoDocumento;
    }
    if (compativelComClassTrib !== null) {
      domain.compativelComClassTrib = compativelComClassTrib;
    }
    return domain;
  }
}

/**
 * Converte o query param anexos (repetido ou CSV) em Set — 400 quando fora
 * do domínio I..V (converterAnexos do controller Java).
 */
export function converterAnexos(anexos: string[] | null): ReadonlySet<string> | null {
  if (anexos === null) {
    return null;
  }
  const configurados = new Set<string>();
  for (const elemento of anexos) {
    for (const anexo of elemento.split(",")) {
      if (anexo === "") {
        continue;
      }
      if (!ANEXOS_VALIDOS.includes(anexo)) {
        throw new ErroRespostaHttp(
          400,
          `Anexo inválido: '${anexo}'. Valores aceitos: ${ANEXOS_VALIDOS.join(", ")}.`,
        );
      }
      configurados.add(anexo);
    }
  }
  return configurados;
}
