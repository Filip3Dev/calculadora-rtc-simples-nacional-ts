# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.
O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e o projeto adere a [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.1.0] — 2026-11-19

### Adicionado

- **Core** (`@sn/core`): motor de cálculo puro da NT 2026.005 (vRBSNitem, pipeline de
  compra governamental com deslocamento CBS↔IBS dos arts. 372/473, matriz de regime
  CRT×tpRegimeIBSCBS, efeito dos tipos de receita bruta tpRBSN com fatores 1,0/0,5/0,0),
  serviço de observabilidade (validação global 422 + erros por item `VSN-000..027/999`
  com JSON Pointers, estados CALCULADO/NAO_CALCULADO/NAO_IMPLEMENTADO/INCONSISTENCIA_ENTRADA/
  FALHA_TECNICA, totalização), derivação de anexos I–V com estado do Fator R, repositórios
  SQLite somente-leitura com as queries nativas oficiais e emulação de `BigDecimal` (JBD).
- **API** (`@sn/api`, NestJS :8082, prefixo `/api`): 6 endpoints — cálculo com observabilidade,
  catálogo de erros VSN-, atividades (lista + por código, com filtros anexos/tpDoc/cClassTrib),
  versão e status de versão (comparador local × online). ProblemDetail RFC 9457 com os shapes
  exatos do oficial, headers `X-CALC-APP-VERSION`/`X-CALC-DB-VERSION`, Swagger com exemplos.
- **Playground** (`@sn/playground`, Vite + React :5174): abas de cálculo (operação + itens com
  estados coloridos e totais), catálogo de atividades e consulta de erros VSN-.
- **Banco**: build do `calculadora.db` a partir dos scripts SQL oficiais (portados do
  Flyway do repo regime-regular; tabelas do Simples nas migrações V0047/49/50/51).
- **Testes**: 73 unitários do core + 46 e2e golden — 45 fixtures capturadas do **JAR oficial**
  executando localmente (Docker) com o mesmo banco, comparadas integralmente (status + body).
- **CI** (GitHub Actions): a cada push/PR — geração do banco, build, typecheck e os 119 testes.
- **Deploy Cloudflare**: Worker `calculadora-sn` (Static Assets + Cloudflare Container) publicado
  em **https://sn.bitpag.xyz** (`pnpm deploy:cloudflare`; wrangler pinado em 4.136.1).
