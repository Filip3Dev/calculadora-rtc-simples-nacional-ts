# calculadora-simples-nacional-core

Motor de cálculo **CBS/IBS do Simples Nacional** na Reforma Tributária do Consumo (LC 123/2006 + LC 214/2025, **NT 2026.005**) — porte TypeScript da [Calculadora do Simples Nacional da Receita Federal](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional), com **paridade estrita** de saída (golden tests contra a API oficial).

```bash
npm i calculadora-simples-nacional-core
```

## Uso programático

```js
import {
  abrirBanco,
  SimplesNacionalObservabilidadeService,
  serializarObservabilidade,
} from "calculadora-simples-nacional-core";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const repos = abrirBanco(require.resolve("calculadora-simples-nacional-core/db/calculadora.db"));
const svc = new SimplesNacionalObservabilidadeService(repos);
const resultado = svc.processarOperacao(operacao, "https://meu.host");
console.log(JSON.stringify(serializarObservabilidade(resultado)));
```

## CLI

```
calculadora-sn operacao.json [--db caminho.db] [--base-url https://meu.host]
```

Saída: JSON da observabilidade (estados por item, totais) ou o ProblemDetail 422 equivalente (exit 1).

O banco de dados (mesma base da calculadora regime-regular, gerada dos scripts SQL oficiais) vem embutido — zero setup. Código, testes e documentação no [repositório](https://github.com/Filip3Dev/calculadora-rtc-simples-nacional-ts).

MIT — crédito compartilhado ao projeto original (SERPRO/Receita Federal do Brasil).
