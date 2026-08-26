import { describe, expect, it } from "vitest";
import { linhasDeInsights } from "./metaAds";

describe("linhasDeInsights — o JSON da Meta vira linha nossa", () => {
  it("converte as strings da Graph API em números de verdade", () => {
    const [linha] = linhasDeInsights([
      {
        date_start: "2026-08-25",
        campaign_id: "123",
        campaign_name: "Manacá — tráfego WhatsApp",
        spend: "143.27",
        impressions: "5301",
        clicks: "88",
        actions: [
          { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" },
          { action_type: "lead", value: "3" },
          { action_type: "link_click", value: "88" }, // clique tem coluna própria — não conta
        ],
      },
    ]);

    expect(linha).toEqual({
      dia: "2026-08-25",
      campanhaId: "123",
      campanhaNome: "Manacá — tráfego WhatsApp",
      gasto: 143.27,
      impressoes: 5301,
      cliques: 88,
      resultadosMeta: 15,
    });
  });

  it("linha sem dia ou sem campanha é descartada — sem chave não há upsert", () => {
    expect(linhasDeInsights([{ spend: "10" }, { date_start: "2026-08-25" }])).toEqual([]);
  });

  it("valor não numérico vira zero, nunca NaN gravado no banco", () => {
    const [linha] = linhasDeInsights([
      { date_start: "2026-08-25", campaign_id: "1", spend: "abc", actions: [{ action_type: "lead", value: "x" }] },
    ]);
    expect(linha.gasto).toBe(0);
    expect(linha.resultadosMeta).toBe(0);
  });
});
