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
