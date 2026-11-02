// Gera `src/lib/prospeccao/amostra/molde.ts` a partir de `molde.html`.
//
// O molde da amostra é editado como HTML (é uma página inteira, com CSS e
// script) e embutido no código como texto, para a rota da amostra não
// depender de ler arquivo em tempo de execução na Vercel. Depois de mexer no
// `molde.html`, rode `node scripts/prospeccao/gerarMolde.mjs`;
// `molde.test.ts` reprova se os dois estiverem diferentes.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pasta = join(raiz, "src", "lib", "prospeccao", "amostra");
const html = readFileSync(join(pasta, "molde.html"), "utf8");

const ts = `// GERADO por scripts/prospeccao/gerarMolde.mjs a partir de molde.html. Não editar à mão.
export const MOLDE_DA_AMOSTRA: string = ${JSON.stringify(html)};
`;
writeFileSync(join(pasta, "molde.ts"), ts);
console.log("molde.ts atualizado (" + html.length + " caracteres)");
