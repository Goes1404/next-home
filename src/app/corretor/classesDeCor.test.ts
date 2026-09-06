import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Todo mapa do painel que traduz um estado numa CLASSE precisa devolver
 * classe — e o TypeScript não cobra isso, porque `Record<Chave, string>`
 * aceita qualquer texto.
 *
 * Já falhou de verdade e da pior forma: `FilaAgora.tsx` tinha
 * `sem_resposta: "Esperando você"` no lugar da classe, e essa string ia
 * direto para o `className`. O item de MAIOR prioridade da fila do Início — o
 * cliente que escreveu e ficou sem resposta — era o único da tela sem cor
 * nenhuma. Tipo, teste e build passaram por meses; é a mesma família do
 * `bg-${gravidade}-lavado` montado em runtime, que a memória do projeto já
 * registra.
 *
 * O teste lê o CÓDIGO-FONTE em vez de importar os módulos: metade deles é
 * `.tsx` com JSX e dependência de servidor, e o que se quer travar aqui não é
 * o resultado de uma função — é o que está escrito no arquivo.
 */

const RAIZ = path.join(process.cwd(), "src/app/corretor");

/**
 * Mapas cujo valor é um OBJETO, não uma string: aqui só alguns campos são
 * classe (o resto é texto para o usuário), então a lista de campos é
 * declarada. Mapa novo desse tipo entra aqui, de propósito — uma heurística
 * adivinhando quais campos são classe erraria em silêncio nos dois sentidos.
 */
const CAMPOS_DE_CLASSE = ["classe", "ponto", "cor", "bg", "texto_classe", "barra", "regua"];

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Uma classe do Tailwind é minúscula e não tem espaço nem acento. Palavra em
 * português com maiúscula ou acento nunca é classe — que é exatamente como
 * "Esperando você" se denuncia.
 */
const CLASSE = /^-?[a-z0-9][a-z0-9:_\-/[\].%(),#*]*$/;

function ehClasse(valor: string): boolean {
  const partes = valor.trim().split(/\s+/).filter(Boolean);
  return partes.length > 0 && partes.every((p) => CLASSE.test(p));
}

/** Mapas `const NOME: Record<…, string> = { chave: "classe", … }`. */
function mapasDeString(codigo: string): { nome: string; entradas: [string, string][] }[] {
  const achados: { nome: string; entradas: [string, string][] }[] = [];
  const re = /const\s+([A-Za-z_$][\w$]*)\s*(?::\s*Record<[^=]*?>)?\s*=\s*\{([^{}]*?)\}/g;
  for (const m of codigo.matchAll(re)) {
    const entradas = [...m[2].matchAll(/([\w"'[\]. ]+)\s*:\s*"([^"]*)"/g)].map(
      (e) => [e[1].trim(), e[2]] as [string, string],
    );
    if (entradas.length >= 2) achados.push({ nome: m[1], entradas });
  }
  return achados;
}

/** O mapa é indexado dentro de um className? Só aí o valor precisa ser classe. */
function usadoComoClasse(codigo: string, nome: string): boolean {
  const linhas = codigo.split("\n");
  return linhas.some((l, i) => {
    if (!new RegExp(`\\b${nome}\\[`).test(l)) return false;
    return /className|cn\(/.test(l) || /className|cn\($/.test(linhas[i - 1] ?? "");
  });
}

/**
 * Mapa de CLASSE ou mapa de RÓTULO?
 *
 * A pergunta importa porque `ROTULO_DETALHE = { imovelBairro: "Bairro" }`
 * também aparece perto de um className, e acusá-lo mandaria alguém
 * "consertar" um texto que está certo — este projeto já perdeu tempo quatro
 * vezes com critério que reprova o comportamento correto.
 *
 * A régua é a forma do defeito: o que se procura é UM valor errado no meio de
 * vários certos. Se a maioria do mapa já é classe, ele é mapa de classe e a
 * minoria é suspeita; se quase nada é classe, é mapa de texto e não é da
 * conta deste teste.
 */
function ehMapaDeClasse(entradas: [string, string][]): boolean {
  const validos = entradas.filter(([, v]) => ehClasse(v)).length;
  return validos / entradas.length >= 0.6;
}

describe("mapas de cor devolvem classe, não texto", () => {
  const suspeitos: { arquivo: string; mapa: string; chave: string; valor: string }[] = [];
  let mapasVistos = 0;

  for (const arq of arquivos(RAIZ)) {
    const codigo = semComentarios(fs.readFileSync(arq, "utf8"));
    for (const { nome, entradas } of mapasDeString(codigo)) {
      if (!usadoComoClasse(codigo, nome) || !ehMapaDeClasse(entradas)) continue;
      mapasVistos++;
      for (const [chave, valor] of entradas) {
        if (!ehClasse(valor)) {
          suspeitos.push({ arquivo: path.relative(process.cwd(), arq), mapa: nome, chave, valor });
        }
      }
    }
  }

  it("encontra os mapas de cor do painel", () => {
    // Sanidade: se a heurística parar de achar mapa nenhum, o teste vira
    // decorativo — que é o defeito que este projeto já cometeu quatro vezes.
    expect(mapasVistos).toBeGreaterThan(3);
  });

  it("nenhum valor de mapa usado em className é texto solto", () => {
    expect(
      suspeitos.map((s) => `${s.arquivo} → ${s.mapa}.${s.chave} = ${JSON.stringify(s.valor)}`),
      "Estes valores viram className e não parecem classe do Tailwind. " +
        "Classe é minúscula, sem espaço estranho e sem acento — texto em " +
        "português aqui significa elemento SEM COR na tela, sem erro nenhum.",
    ).toEqual([]);
  });
});
