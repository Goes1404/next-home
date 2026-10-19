import { describe, expect, it } from "vitest";
import {
  ETAPAS_DO_CAMINHO,
  ETAPAS_FUNIL,
  ETAPA_LABEL,
  GRUPOS_FUNIL,
  GRUPO_DA_ETAPA,
  PROXIMA_ETAPA,
  type EtapaFunil,
} from "@/lib/types";

/**
 * O caminho do funil é a regra de produto mais visível do painel: é o que o
 * botão de um toque executa, o que a barra de passos desenha e o que as
 * colunas do quadro mostram. Uma etapa a mais aqui é um clique a mais na
 * vida do corretor, todo dia.
 */

describe("o caminho do funil", () => {
  // Era "cinco passos" (0045). Em 06/10/2026 o usuário pediu o funil
  // completo (0165): a IA move as etapas do começo sozinha, então o clique a
  // mais não é do corretor. Quem quer o caminho curto usa o RESUMIDO, que
  // continua com os cinco grupos de antes.
  it("o completo tem nove passos e o resumido continua com cinco", () => {
    expect(ETAPAS_DO_CAMINHO).toHaveLength(9);
    expect(GRUPOS_FUNIL.filter((g) => g !== "perdido")).toHaveLength(5);
  });

  it("toda etapa tem um grupo, e as etapas de um grupo são vizinhas", () => {
    let anterior = GRUPO_DA_ETAPA[ETAPAS_FUNIL[0]];
    const vistos = new Set([anterior]);
    for (const etapa of ETAPAS_FUNIL) {
      const grupo = GRUPO_DA_ETAPA[etapa];
      if (grupo !== anterior) {
        expect(vistos.has(grupo)).toBe(false);
        vistos.add(grupo);
        anterior = grupo;
      }
    }
  });

  it("perdido existe, mas fora do caminho: é a saída, não um passo", () => {
    expect(ETAPAS_FUNIL).toContain("perdido");
    expect(ETAPAS_DO_CAMINHO as readonly string[]).not.toContain("perdido");
  });

  it("todo passo do caminho tem rótulo em português de corretor", () => {
    for (const etapa of ETAPAS_FUNIL) {
      expect(ETAPA_LABEL[etapa]).toBeTruthy();
      // Nome de coluna de banco não chega à tela.
      expect(ETAPA_LABEL[etapa]).not.toContain("_");
    }
  });
});

describe("o botão de um toque", () => {
  it("leva sempre ao passo SEGUINTE do caminho, nunca para trás nem pulando", () => {
    for (let i = 0; i < ETAPAS_DO_CAMINHO.length - 1; i += 1) {
      const atual = ETAPAS_DO_CAMINHO[i];
      const seguinte = ETAPAS_DO_CAMINHO[i + 1];
      expect(PROXIMA_ETAPA[atual]?.etapa).toBe(seguinte);
    }
  });

  it("não existe em quem já saiu do jogo — botão ali seria armadilha", () => {
    expect(PROXIMA_ETAPA.fechado).toBeNull();
    expect(PROXIMA_ETAPA.perdido).toBeNull();
  });

  it("o rótulo é o ATO do corretor, não o nome do destino", () => {
    // "Falei com ele", não "mover para primeiro contato": quem vende pensa
    // no que acabou de fazer, não em mover cartão.
    for (const etapa of ETAPAS_FUNIL) {
      const proxima = PROXIMA_ETAPA[etapa];
      if (!proxima) continue;
      expect(proxima.acao).not.toContain("Mover");
      expect(proxima.acao).not.toBe(ETAPA_LABEL[proxima.etapa]);
    }
  });

  it("de qualquer etapa do caminho, o fim é alcançável só apertando o botão", () => {
    // A prova de que o caminho não tem buraco: partindo do começo e sempre
    // avançando, chega-se a "fechado" (oito toques; os três primeiros a IA
    // costuma dar sozinha).
    let etapa: EtapaFunil = "novo";
    let toques = 0;
    while (PROXIMA_ETAPA[etapa] && toques < 10) {
      etapa = PROXIMA_ETAPA[etapa]!.etapa;
      toques += 1;
    }
    expect(etapa).toBe("fechado");
    expect(toques).toBe(ETAPAS_DO_CAMINHO.length - 1);
  });
});

describe("o funil do banco e o da tela são o mesmo (0165)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync, readdirSync } = require("node:fs") as typeof import("node:fs");
  const pasta = "supabase/migrations";
  const ultimaCheck = readdirSync(pasta)
    .filter((a) => a.endsWith(".sql"))
    .sort()
    .map((a) => readFileSync(`${pasta}/${a}`, "utf8"))
    .filter((sql) => sql.includes("add constraint leads_etapa_check"))
    .at(-1)!;

  it("o check do banco aceita exatamente as etapas da tela", () => {
    const dentro = ultimaCheck.slice(ultimaCheck.indexOf("add constraint leads_etapa_check"));
    const lista = dentro.slice(dentro.indexOf("("), dentro.indexOf(");"));
    const noBanco = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(noBanco).toEqual([...ETAPAS_FUNIL]);
  });

  it("resposta do cliente e ficha completa movem o lead sozinhas", () => {
    const webhook = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
    const repositorio = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");
    expect(webhook).toContain("await avancarLeadParaEmConversa(conversa.leadId);");
    expect(repositorio).toContain("await avancarLeadParaQualificado(leadId);");
  });
});
