/** Copia o banco pré-gerado para dentro do pacote antes do npm pack/publish. */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origem = path.join(raiz, "..", "..", "db", "calculadora.db");
const destinoDir = path.join(raiz, "db");
if (existsSync(origem)) {
  mkdirSync(destinoDir, { recursive: true });
  copyFileSync(origem, path.join(destinoDir, "calculadora.db"));
  console.log("✓ db/calculadora.db copiado para o pacote (prepack)");
} else {
  console.warn("⚠ db/calculadora.db ausente — rode pnpm db:build antes de publicar (tarball seguirá sem banco).");
}
