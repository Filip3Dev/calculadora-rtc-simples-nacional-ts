# Exemplos — Calculadora do Simples Nacional (NT 2026.005)

Todas as respostas abaixo são **saídas reais** capturadas do JAR oficial da API Java (v0.0.6) executando com o mesmo banco deste projeto (V0059) — os e2e golden (`apps/api/test/golden/`) comparam as respostas deste porte byte a byte com elas. Hosts e timestamps são os únicos campos dinâmicos.

Base local: `http://localhost:8082/api`.

---

## 1. Cálculo com observabilidade — item calculado (CRT=1, tpRBSN=1)

`POST /calculadora/observabilidade/simples-nacional`

Entrada:

```json
{
  "id": "507f1f77bcf86cd799439011",
  "versao": "2.0.0",
  "data": "2027-03-15",
  "tpDoc": "55",
  "CRT": "1",
  "itens": [
    {
      "numero": 1,
      "cAtivSN": "01",
      "cClassTrib": "000001",
      "baseCalculo": "950.00",
      "valorImpostoSeletivo": "50.00",
      "pIBSSN": "1.25",
      "pCBSSN": "2.75"
    }
  ]
}
```

Resposta (`200`, headers `X-CALC-APP-VERSION`/`X-CALC-DB-VERSION`):

```json
{
  "oper": {
    "data": "2027-03-15",
    "tpDoc": "55",
    "CRT": "1"
  },
  "objetos": [
    {
      "nObj": 1,
      "estadoItem": "CALCULADO",
      "tribCalc": {
        "vRBSNitem": "950.00",
        "tpRBSN": 1,
        "tpRBSNDescricao": "Receita bruta - interna",
        "vBC": "950.00",
        "pIBSSN": "1.25",
        "vIBSSN": "11.88",
        "vIBSPendSusp": "0.00",
        "pCBSSN": "2.75",
        "vCBSSN": "26.12",
        "vCBSPendSusp": "0.00",
        "IS": {
          "valor": "50.00"
        },
        "totalItem": "88.00"
      }
    }
  ],
  "total": {
    "vRBSNtot": "950.00",
    "vBC": "950.00",
    "vIBSSNtot": "11.88",
    "vIBSSNtotPendSusp": "0.00",
    "vCBSSNtot": "26.12",
    "vCBSSNtotPendSusp": "0.00",
    "totalIs": "50.00",
    "totalTributos": "88.00"
  }
}
```

## 2. Compra governamental — Estado em 2029 (fator de transição 0,10)

Deslocamento dos arts. 372/473: `pIBS' = pIBS + 0,10 × pCBS`; `pCBS' = (1 − 0,10) × pCBS`.

```json
{
  "id": "abc",
  "versao": "2.0.0",
  "data": "2029-06-01",
  "tpDoc": "55",
  "CRT": "1",
  "itens": [
    {
      "numero": 1,
      "cAtivSN": "01",
      "cClassTrib": "000001",
      "baseCalculo": "1000.00",
      "valorImpostoSeletivo": "0.00",
      "pIBSSN": "1.25",
      "pCBSSN": "2.75"
    }
  ],
  "tpEnteGov": "2"
}
```

Resposta (`200`) — alíquotas transformadas e reportadas (1.525 / 2.475):

```json
{
  "nObj": 1,
  "estadoItem": "CALCULADO",
  "tribCalc": {
    "vRBSNitem": "1000.00",
    "tpRBSN": 1,
    "tpRBSNDescricao": "Receita bruta - interna",
    "vBC": "1000.00",
    "pIBSSN": "1.525",
    "vIBSSN": "15.25",
    "vIBSPendSusp": "0.00",
    "pCBSSN": "2.475",
    "vCBSSN": "24.75",
    "vCBSPendSusp": "0.00",
    "IS": {
      "valor": "0.00"
    },
    "totalItem": "40.00"
  }
}
```

## 3. Compra governamental — União (tpEnteGov=1, regra estrutural)

`pCBS' = pCBS + pIBS = 4.00`; `pIBS' = 0.00`:

```json
{
  "vRBSNitem": "1000.00",
  "tpRBSN": 1,
  "tpRBSNDescricao": "Receita bruta - interna",
  "vBC": "1000.00",
  "pIBSSN": "0.00",
  "vIBSSN": "0.00",
  "vIBSPendSusp": "0.00",
  "pCBSSN": "4.00",
  "vCBSSN": "40.00",
  "vCBSPendSusp": "0.00",
  "IS": {
    "valor": "0.00"
  },
  "totalItem": "40.00"
}
```

## 4. CRT=3 + tpRegimeIBSCBS=2 — valores integralmente pendentes/suspensos

```json
{
  "vRBSNitem": "1000.00",
  "tpRBSN": 1,
  "tpRBSNDescricao": "Receita bruta - interna",
  "vBC": "1000.00",
  "pIBSSN": "1.25",
  "vIBSSN": "0.00",
  "vIBSPendSusp": "12.50",
  "pCBSSN": "2.75",
  "vCBSSN": "0.00",
  "vCBSPendSusp": "27.50",
  "IS": {
    "valor": "0.00"
  },
  "totalItem": "0.00"
}
```

## 5. Item NAO_CALCULADO (cAtivSN fora do catálogo)

O cálculo não é realizado — sem erro; o item reporta apenas receita bruta e tipo de receita (e só entra em `vRBSNtot`):

```json
{
  "oper": {
    "data": "2027-03-15",
    "tpDoc": "55",
    "CRT": "1"
  },
  "objetos": [
    {
      "nObj": 1,
      "estadoItem": "NAO_CALCULADO",
      "tribCalc": {
        "vRBSNitem": "1000.00",
        "tpRBSN": 1,
        "tpRBSNDescricao": "Receita bruta - interna"
      }
    }
  ],
  "total": {
    "vRBSNtot": "1000.00"
  }
}
```

## 6. Item NAO_IMPLEMENTADO (VSN-027 — prioridade máxima)

cClassTrib vinculado a tratamento sem implementação; `total` inteiro é suprimido:

```json
{
  "oper": {
    "data": "2027-03-15",
    "tpDoc": "55",
    "CRT": "1"
  },
  "objetos": [
    {
      "nObj": 1,
      "estadoItem": "NAO_IMPLEMENTADO",
      "erros": [
        {
          "type": "http://localhost/calculadora/observabilidade/simples-nacional/erros?codigo=VSN-027",
          "title": "cClassTrib sem tratamento implementado no cálculo do Simples Nacional",
          "code": "VSN-027",
          "pointer": "#/itens/0/cClassTrib",
          "detail": "A classificação tributária '620001' ainda não possui tratamento implementado no cálculo do Simples Nacional na data '2027-03-15'. Essa funcionalidade está prevista no roadmap e será disponibilizada em versão futura."
        }
      ]
    }
  ]
}
```

## 7. Mistura de estados — totais

Item com erro não entra em nenhum total; NAO_CALCULADO só em `vRBSNtot`:

```json
{
  "vRBSNtot": "1500.00",
  "vBC": "1000.00",
  "vIBSSNtot": "12.50",
  "vIBSSNtotPendSusp": "0.00",
  "vCBSSNtot": "27.50",
  "vCBSSNtotPendSusp": "0.00",
  "totalIs": "0.00",
  "totalTributos": "40.00"
}
```

## 8. Erro global — HTTP 422 ProblemDetail (RFC 9457)

tpEnteGov inválido rejeita a operação inteira:

```json
{
  "id": "abc",
  "versao": "2.0.0",
  "data": "2027-03-15",
  "tpDoc": "55",
  "CRT": "1",
  "itens": [
    {
      "numero": 1,
      "cAtivSN": "01",
      "cClassTrib": "000001",
      "baseCalculo": "1000.00",
      "valorImpostoSeletivo": "0.00",
      "pIBSSN": "1.25",
      "pCBSSN": "2.75"
    }
  ],
  "tpEnteGov": "7"
}
```

Resposta (`422`, `Content-Type: application/problem+json`):

```json
{
  "type": "about:blank",
  "title": "Erros no processamento do cálculo do Simples Nacional",
  "status": 422,
  "detail": "O cálculo contém 1 erro(s).",
  "instance": "/api/calculadora/observabilidade/simples-nacional",
  "timestamp": "<TS>",
  "errors": [
    {
      "type": "http://localhost/calculadora/observabilidade/simples-nacional/erros?codigo=VSN-024",
      "title": "Tipo de ente governamental (tpEnteGov) inválido",
      "code": "VSN-024",
      "pointer": "#/tpEnteGov",
      "detail": "Tipo de ente governamental inválido, recebido: '7' (esperado 1, 2, 3 ou 4)."
    }
  ]
}
```

## 9. Catálogo de atividades — Fator R (código 09)

`GET /calculadora/simples-nacional/atividades/09?data=2027-01-01`:

```json
{
  "codigo": "09",
  "ordem": 9,
  "descricao": "Prestação de serviços — Sujeitos ao Fator \"R\"",
  "anexoSemFatorR": "III",
  "anexoComFatorR": "V",
  "sujeitaFatorR": true,
  "rotuloAnexo": "III ou V",
  "rotuloCurtoAnexo": "III ou V",
  "disponivel": true,
  "anexosFaltantes": [],
  "modoFatorR": "OPCIONAL",
  "tpDocsAdmissiveis": [
    "91"
  ]
}
```

## 10. Atividade 90 (não tributável) × cClassTrib vedado (UB14-90)

`GET /calculadora/simples-nacional/atividades/90?data=2027-01-01&cClassTrib=000001` — `compativelComClassTrib: false` (espelho do erro VSN-023 do cálculo):

```json
{
  "codigo": "90",
  "ordem": 15,
  "descricao": "Operações não Tributáveis",
  "anexoSemFatorR": null,
  "anexoComFatorR": null,
  "sujeitaFatorR": false,
  "rotuloAnexo": "Não tributável",
  "rotuloCurtoAnexo": "Não tributável",
  "disponivel": false,
  "anexosFaltantes": [],
  "modoFatorR": "NAO_APLICAVEL",
  "tpDocsAdmissiveis": [
    "55",
    "57",
    "62",
    "63",
    "65",
    "67",
    "91",
    "93"
  ],
  "compativelComClassTrib": false
}
```

## 11. Catálogo de erros VSN-

`GET /calculadora/observabilidade/simples-nacional/erros?codigo=VSN-025`:

```json
{
  "codigo": "VSN-025",
  "titulo": "Parametrização de compra governamental indisponível para a data",
  "descricao": "A data do fato gerador está fora de todas as vigências do parâmetro de transição de alíquotas de compra governamental do Simples Nacional (NT 2026.005, seção 5.3.3; arts. 372 e 473 da LC 214/2025). Como o tpEnteGov é dado da operação, a falha rejeita a operação inteira."
}
```

Código inexistente/aposentado (ex.: VSN-008) → `404` sem body.

## 12. Versão

`GET /versao`:

```json
{
  "versaoApp": "0.0.6",
  "versaoDb": "V0059",
  "descricaoVersaoDb": "Habilitação de 820 para NFSe.",
  "dataVersaoDb": "2026-09-30",
  "ambiente": "offline"
}
```

`GET /versao/status` compara com a instalação online (`VERSAO_URL`); consulta indisponível → campos remotos `null` e indicadores `false`.
