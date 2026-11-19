/** Smoke test manual: caso A dos testes Java contra o banco real. */
import { abrirBanco, SimplesNacionalObservabilidadeService, serializarObservabilidade } from "../src/index.js";

const repos = abrirBanco("../../db/calculadora.db");
const svc = new SimplesNacionalObservabilidadeService(repos);

const resultado = svc.processarOperacao(
  {
    id: "507f1f77bcf86cd799439011",
    versao: "2.0.0",
    data: "2027-03-15",
    tpDoc: "55",
    CRT: "1",
    itens: [
      {
        numero: 1,
        cAtivSN: "01",
        cClassTrib: "000001",
        baseCalculo: "950.00",
        valorImpostoSeletivo: "50.00",
        pIBSSN: "1.25",
        pCBSSN: "2.75",
      },
    ],
  },
  "http://localhost:8082",
);
console.log(JSON.stringify(serializarObservabilidade(resultado), null, 2));
