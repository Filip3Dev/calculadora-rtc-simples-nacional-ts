/**
 * Controller de versão — /versao e /versao/status (perfil offline).
 *
 * PARITY: /versao/status compara local × instalação online (VERSAO_URL,
 * default = endpoint de dados-abertos do piloto oficial); consulta
 * indisponível → campos remotos null e indicadores false. Comparação de
 * aplicação por prefixo semver (extrairSemver do Java).
 */
import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { versaoAplicacao, versaoBaseDados } from "./calc.provider.js";

interface VersaoDomain {
  versaoApp: string;
  versaoDb: string;
  descricaoVersaoDb: string;
  dataVersaoDb: string;
  ambiente: string;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/;

function extrairSemver(versao: string): string | null {
  const m = SEMVER.exec(versao);
  return m ? m[0] : null;
}

function versoesAplicacaoIguais(local: string, remota: string): boolean {
  const semverLocal = extrairSemver(local);
  const semverRemota = extrairSemver(remota);
  if (semverLocal !== null && semverRemota !== null) {
    return semverLocal === semverRemota;
  }
  return local === remota;
}

@ApiTags("Versão da aplicação")
@Controller()
export class VersaoController {
  private get versao(): VersaoDomain {
    const db = versaoBaseDados();
    return {
      versaoApp: versaoAplicacao(),
      versaoDb: db.numeroVersao,
      descricaoVersaoDb: db.descricao,
      dataVersaoDb: db.data,
      ambiente: process.env.VERSAO_AMBIENTE ?? "offline",
    };
  }

  @Get("versao")
  @ApiOperation({
    summary: "Consultar as informações de versão da aplicação",
    description:
      "Informa a versão da aplicação, a versão, descrição e data da base de dados " +
      "em uso e o ambiente em que a aplicação está publicada.",
  })
  getVersao(): VersaoDomain {
    return this.versao;
  }

  @Get("versao/status")
  @ApiOperation({
    summary: "Consultar o status de versão da aplicação offline",
    description:
      "Compara as versões locais da aplicação e do banco de dados com as versões remotas " +
      "publicadas no endpoint /versao da instalação online e informa, campo a campo, se a " +
      "instalação local está atualizada. Quando a consulta remota está indisponível, os campos " +
      "remotos retornam nulos e os indicadores resultam falsos.",
  })
  async getVersaoStatus(): Promise<Record<string, unknown>> {
    const local = this.versao;
    const remota = await VersaoController.consultarVersaoRemota();
    return {
      aplicacaoAtualizada:
        remota !== null && versoesAplicacaoIguais(local.versaoApp, remota.versaoApp),
      dbAtualizada: remota !== null && local.versaoDb === remota.versaoDb,
      dataDbAtualizada: remota !== null && local.dataVersaoDb === remota.dataVersaoDb,
      versaoAplicacaoLocal: local.versaoApp,
      versaoAplicacaoRemota: remota?.versaoApp ?? null,
      versaoDbLocal: local.versaoDb,
      versaoDbRemota: remota?.versaoDb ?? null,
      dataDbLocal: local.dataVersaoDb,
      dataDbRemota: remota?.dataVersaoDb ?? null,
    };
  }

  private static async consultarVersaoRemota(): Promise<VersaoDomain | null> {
    const url =
      process.env.VERSAO_URL ??
      "https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api/calculadora/dados-abertos/versao";
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const json = (await resp.json()) as Partial<VersaoDomain>;
      return {
        versaoApp: json.versaoApp ?? "",
        versaoDb: json.versaoDb ?? "",
        descricaoVersaoDb: json.descricaoVersaoDb ?? "",
        dataVersaoDb: json.dataVersaoDb ?? "",
        ambiente: json.ambiente ?? "",
      };
    } catch {
      return null;
    }
  }
}
