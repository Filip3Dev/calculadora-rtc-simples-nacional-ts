/**
 * Derivação de anexos do Simples Nacional — porte fiel de
 * DerivacaoAnexosSimples (ADR011: modelo de estado do Fator R).
 *
 * Regra pura: dado o par (anexoSemFatorR, anexoComFatorR) da atividade e o
 * conjunto de anexos CONFIGURADOS na consulta (I..V, ou todos quando a
 * consulta não filtra), deriva disponibilidade, anexos faltantes e o modo
 * do Fator R.
 */
import type { ModoFatorR } from "./tipos.js";

export const ANEXOS_VALIDOS: ReadonlyArray<string> = ["I", "II", "III", "IV", "V"];

export interface Derivacao {
  disponivel: boolean;
  anexosFaltantes: string[];
  modoFatorR: ModoFatorR;
}

export function derivar(
  anexoSemFatorR: string | null,
  anexoComFatorR: string | null,
  anexosConfigurados: ReadonlySet<string> | null,
): Derivacao {
  // PARITY: atividade "só com Fator R" é inconsistência de banco — o Java
  // lança IllegalStateException (corrompimento de carga, não erro do usuário).
  if (anexoComFatorR !== null && anexoSemFatorR === null) {
    throw new Error(
      `Atividade inconsistente: anexoComFatorR (${anexoComFatorR}) preenchido sem anexoSemFatorR. ` +
        `Não existe atividade "só com Fator R"; corrija o banco.`,
    );
  }

  const configurados = anexosConfigurados ?? new Set(ANEXOS_VALIDOS);

  const anexosPossiveis = ANEXOS_VALIDOS.filter(
    (anexo) => anexo === anexoSemFatorR || anexo === anexoComFatorR,
  );

  const anexosFaltantes = anexosPossiveis.filter((anexo) => !configurados.has(anexo));

  const disponivel =
    anexosPossiveis.length === 0 ||
    anexosPossiveis.some((anexo) => configurados.has(anexo));

  let modoFatorR: ModoFatorR;
  if (anexoComFatorR === null) {
    modoFatorR = "NAO_APLICAVEL";
  } else if (configurados.has(anexoComFatorR)) {
    modoFatorR = configurados.has(anexoSemFatorR!) ? "OPCIONAL" : "OBRIGATORIO";
  } else {
    modoFatorR = "INDISPONIVEL";
  }

  return { disponivel, anexosFaltantes, modoFatorR };
}
