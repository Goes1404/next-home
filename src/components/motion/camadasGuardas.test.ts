import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste que LÊ O CÓDIGO, como `escalaDoPainel.test.ts`.
 *
 * A regra não é sobre o resultado de uma função: é sobre QUAIS telas podem
 * receber camada. Mapa, player, formulário e navegação ficam parados por
 * decisão de produto — e a regressão, se acontecer, falha calada: o site
 * continua "funcionando", só com o mapa tremendo sob o dedo.
 */
const RAIZ = join(process.cwd(), "src", "components");

const PROIBIDOS = [
  "empreendimento/Localizacao.tsx",
  "empreendimento/Contato.tsx",
  "empreendimento/NavAncoras.tsx",
  "empreendimento/Video.tsx",
  "empreendimento/Tour360.tsx",
  "mapa/MapaInterativoClient.tsx",
  "mapa/MapaLocalClient.tsx",
  "mapa/GloboImoveis.tsx",
  "layout/MenuMobile.tsx",
  "busca/FiltroForm.tsx",
  "busca/FiltroSheet.tsx",
];

describe("onde camada NÃO pode entrar", () => {
  for (const caminho of PROIBIDOS) {
    it(`${caminho} continua sem camada`, () => {
      const fonte = readFileSync(join(RAIZ, caminho), "utf8");
      expect(fonte).not.toMatch(/motion\/Camada|useCamada|registrarCamada/);
    });
  }
});

/**
 * Dois donos da mesma matriz de transform fazem o elemento saltar: o Reveal
 * anima `x`/`y` na entrada e a camada escreve `y` a cada frame. O padrão
 * correto é `<Camada><Reveal>…</Reveal></Camada>` — nunca os dois no mesmo
 * nó, e nunca as props de um na tag do outro.
 */
describe("camada e reveal não dividem nó", () => {
  const ARQUIVOS = [
    "empreendimento/Galeria.tsx",
    "empreendimento/Sobre.tsx",
    "empreendimento/FichaNumeros.tsx",
    "empreendimento/Tipologias.tsx",
    "empreendimento/CardEmpreendimento.tsx",
    "empreendimento/CenaShowcase.tsx",
    "home/Regioes.tsx",
  ];

  for (const caminho of ARQUIVOS) {
    it(`${caminho} não mistura as props das duas primitivas`, () => {
      const fonte = readFileSync(join(RAIZ, caminho), "utf8");
      expect(fonte).not.toMatch(/<Reveal[^>]*\bvelocidade=/);
      expect(fonte).not.toMatch(/<Camada[^>]*\bstagger=/);
      expect(fonte).not.toMatch(/<Camada[^>]*\bfrom=/);
    });
  }
});

/**
 * `position: sticky` dentro de uma camada para de grudar: o transform muda
 * o containing block. No `Sobre`, é o sticky que segura a foto ao lado do
 * texto longo — perdê-lo é uma regressão visível e silenciosa.
 */
describe("sticky não vive dentro de camada", () => {
  it("a coluna sticky do Sobre não está dentro de uma Camada", () => {
    const fonte = readFileSync(join(RAIZ, "empreendimento/Sobre.tsx"), "utf8");
    const camada = fonte.indexOf("<Camada");
    const fechaCamada = fonte.indexOf("</Camada>");
    const sticky = fonte.indexOf("lg:sticky");

    expect(sticky).toBeGreaterThan(-1);
    expect(camada).toBeGreaterThan(-1);
    // O sticky vem DEPOIS do fechamento da camada, não entre abrir e fechar.
    expect(sticky).toBeGreaterThan(fechaCamada);
  });
});
