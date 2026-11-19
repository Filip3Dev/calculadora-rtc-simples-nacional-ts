/**
 * Worker de borda da Calculadora do Simples Nacional (Cloudflare).
 *
 * O front (apps/playground/dist) é servido pela camada de Static Assets;
 * o que chega aqui é /api/* e é proxyado para o container da API NestJS
 * (Dockerfile da raiz), gerenciado pelo Durable Object abaixo.
 *
 * Adaptado do template oficial cloudflare/templates/containers-template
 * (sem pool/lb — uma única instância serve toda a API).
 */
import { DurableObject } from "cloudflare:workers";

const PORT = 8080;

/** Container dorme após este período sem tráfego (a 1ª chamada seguinte paga o boot). */
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/** Nome estável → o hash determinístico garante uma única instância global. */
const INSTANCE_NAME = "calculadora-sn-v3"; // bump: força container novo (a instância antiga persiste até o timeout)

/** Sonda de prontidão: GET leve (1 query SQLite) que valida servidor + banco. */
const HEALTH_PATH = "/api/versao";

export interface Env {
  CONTAINER: DurableObjectNamespace<CalculadoraSnContainer>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      // Assets já resolveram antes do Worker; aqui só deveria chegar /api/*.
      return new Response("Não encontrado", { status: 404 });
    }
    return env.CONTAINER.getByName(INSTANCE_NAME).fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class CalculadoraSnContainer extends DurableObject {
  /** Startup compartilhado entre requests concorrentes. */
  private starting?: Promise<void>;
  /** Container pronto (sonda passou) — evita re-sondar a cada request morna. */
  private ready = false;
  private monitoring = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Reinício do DO com o container ainda de pé: restaura timeout e monitor.
    this.ctx.blockConcurrencyWhile(async () => {
      const container = this.ctx.container;
      if (container?.running) {
        container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
        this.observeExit();
      }
    });
  }

  override async fetch(request: Request): Promise<Response> {
    if (!this.ready) {
      try {
        await (this.starting ??= this.start());
      } catch (err) {
        this.starting = undefined; // falha libera para retry na próxima request
        throw err;
      }
    }

    const url = new URL(request.url);
    const proto = url.protocol.replace(":", "");
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    // API monta as URIs de catálogo (ErroDetalhe.type) com o scheme original.
    forwarded.headers.set("x-forwarded-proto", proto);
    return this.ctx.container!.getTcpPort(PORT).fetch(forwarded);
  }

  private async start(): Promise<void> {
    const container = this.ctx.container!;
    try {
      if (!container.running) {
        container.start({
          image: container.images.base,
          instance: "lite",
          enableInternet: false, // o banco vem na imagem; nada a acessar fora
        });
      }
    } catch (err) {
      // Corrida após hibernação do DO: o container pode subir entre o check
      // `running` e o start() — nesse caso segue direto para a sonda.
      if (!/already running/i.test(String(err))) throw err;
    }
    container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    this.observeExit();

    // "running" só significa que o start foi pedido — espera o HTTP responder.
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const probe = await container
          .getTcpPort(PORT)
          .fetch(`http://container${HEALTH_PATH}`, {
            signal: AbortSignal.timeout(1000),
          });
        if (probe.ok) {
          this.ready = true;
          return;
        }
      } catch {
        // porta ainda não escutando — tenta de novo em 200ms
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Container não ficou pronto na porta ${PORT} (${HEALTH_PATH})`);
  }

  private observeExit(): void {
    if (this.monitoring) return;
    this.monitoring = true;
    // monitor() resolve quando o container sai; waitUntil segura o DO enquanto
    // há uma saída pendente de observar (padrão do template oficial).
    this.ctx.waitUntil(
      this.ctx.container!.monitor().then(
        () => console.log("Container da Calculadora SN finalizou."),
        (err: unknown) => console.error("Container finalizou com erro:", err),
      ),
    );
  }
}
