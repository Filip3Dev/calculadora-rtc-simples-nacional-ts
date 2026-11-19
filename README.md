# Calculadora de Tributos — Simples Nacional (TypeScript)

Porte **TypeScript** da [Calculadora de Tributos do Simples Nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) da Receita Federal — API REST que calcula a **CBS** e o **IBS** (Reforma Tributária do Consumo, LC 214/2025) nas operações de contribuintes optantes pelo Simples Nacional, conforme a **NT 2026.005** (LC 123/2006 + LC 214/2025 + LC 227/2026).

> [!NOTE]
> Paridade **estrita** de saída com a API oficial: mesmos endpoints, payloads, códigos de erro `VSN-`, mensagens, ordem de campos e formatos numéricos — verificada por **golden tests** que reproduzem, byte a byte, respostas capturadas do JAR oficial executando com o mesmo banco.

## Como rodar

```bash
pnpm install

# 1. Gerar o banco SQLite (mesmos scripts Flyway oficiais do regime-regular, portados)
pnpm db:build

# 2. API (NestJS) — http://localhost:8082/api · Swagger: /api/swagger
pnpm dev:api

# 3. Playground (Vite + React) — http://localhost:5174
pnpm dev:web

# Testes (73 unitários do core + 46 e2e golden)
pnpm test
```

Requisitos: Node ≥ 22, pnpm ≥ 10.

## Endpoints (todos sob `/api`)

| Funcionalidade | Endpoint |
|---|---|
| Cálculo com observabilidade (erros por item, sem interromper os demais) | `POST /calculadora/observabilidade/simples-nacional` |
| Descrição de um código de erro `VSN-` | `GET /calculadora/observabilidade/simples-nacional/erros?codigo=VSN-001` |
| Atividades do Simples vigentes na data (anexos I–V, Fator R, whitelist por tpDoc) | `GET /calculadora/simples-nacional/atividades?data=AAAA-MM-DD` |
| Consulta de uma atividade pelo código | `GET /calculadora/simples-nacional/atividades/{codigo}?data=AAAA-MM-DD` |
| Versão da aplicação, base de dados e ambiente | `GET /versao` |
| Status da versão local × instalação online | `GET /versao/status` |

Documentação interativa: **`/api/swagger`** · Exemplos com saídas reais: [docs/exemplos.md](docs/exemplos.md)

## Arquitetura

```
packages/core        Motor puro (fórmulas fixas da NT 2026.005 — sem JEXL, sem banco):
  ├─ calculo.ts        vRBSNitem → pipeline compra-gov → matriz de regime × tpRBSN
  ├─ observabilidade.ts  validação global (422) + por item (VSN-) + totalização
  ├─ parametrizacao.ts   lookups por vigência (regime, tpRBSN, transição compra-gov)
  ├─ derivacao-anexos.ts anexos I–V + estado do Fator R (ADR011)
  ├─ db/repositorios.ts  SQLite somente-leitura (queries nativas fiéis)
  └─ jbd.ts              emulação de java.math.BigDecimal (escala + HALF_EVEN)
apps/api             NestJS :8082 — controllers, ProblemDetail (RFC 9457), Swagger
apps/playground      Vite + React :5174 — cálculo, catálogo de atividades, erros VSN
db/                  scripts SQL oficiais (Flyway do repo regime-regular) → calculadora.db
```

**Banco**: o mesmo `calculadora-pro.db` do projeto oficial — as tabelas do Simples Nacional são criadas nas migrações V0047/V0049/V0050/V0051 do repositório `calculadora-rtc-regime-regular`, com vigências a partir de **2027-01-01**. O build roda os scripts SQL com `better-sqlite3` (sem Java/Flyway), replicando a ordem exata do build oficial.

### Como este porte foi feito

1. **Análise** do repositório Java oficial (v0.0.6, ~4,5k linhas) — motor, queries, catálogo VSN e testes;
2. **Porte fiel** do motor (fórmulas fixas da NT, arredondamento HALF_EVEN 8 casas internas, decimais como strings na saída);
3. **Golden tests**: as respostas do **JAR oficial** (executado localmente via Docker, com o mesmo banco) foram capturadas em 45 fixtures (`apps/api/test/golden/`) e os e2e fazem replay comparação completa de status + body (normalizando apenas host/timestamp dinâmicos).

Paridades deliberadamente preservadas (marcadas com `// PARITY:` no código): vIS fora da receita bruta em todas as vigências; destino ZERO do CRT=3+tpRegimeIBSCBS=2 (fórmulas P32/P33); redutor de compra governamental **não** aplicado (a NT 2026.005 usa só o deslocamento); prioridade do estado NAO_IMPLEMENTADO sobre validações do item; códigos VSN-008/009 aposentados.

## Contribuições do porte em relação ao original

- Mesma API sem JVM (~90 MB de JAR → processo Node leve);
- Testes de paridade automatizados contra respostas reais do oficial;
- Playground incluso.

## Licença

[MIT](LICENSE) — mantém o crédito ao projeto original (SERPRO/Receita Federal do Brasil).
