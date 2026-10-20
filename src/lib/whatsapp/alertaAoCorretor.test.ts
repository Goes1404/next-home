import { describe, expect, it } from "vitest";
import { alertaLiberado, formatarAlertaCorretor, type DadosDoAlerta } from "./brokerNotifier";
import { notificacaoDoTexto } from "@/lib/crm/avisoAoCorretor";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const base: DadosDoAlerta = {
  motivo: "ligacao_solicitada",
  nomeCliente: "Ana Prado",
  telefoneCliente: "5511988881111",
  imovel: "Dom Parque",
  ficha: { rendaMensal: 6000, regiaoInteresse: "Osasco", dormitoriosMin: 2, orcamentoMax: null },
  falaDoCliente: "pode me ligar?",
  linkFicha: "https://x/corretor/leads/1",
};

describe("alerta ao corretor", () => {
  it("abre pelo que fazer, com o nome da ficha", () => {
    const texto = formatarAlertaCorretor(base);
    expect(texto.split("\n")[0]).toBe("*📞 Ligue para Ana Prado*");
    expect(texto).toContain('Disse: "pode me ligar?"');
    expect(texto).toMatch(/Dom Parque · 2 dorm · renda R\$\s6\.000 · Osasco/);
    expect(texto).toContain("wa.me/5511988881111");
    expect(texto).toContain("Ficha: https://x/corretor/leads/1");
  });

  it("não usa frase de marketing nem imóvel inventado", () => {
    const texto = formatarAlertaCorretor({ ...base, motivo: "visita_desmarcada", imovel: null, fato: "Era sáb 25/10 às 10h." });
    expect(texto).not.toMatch(/alto padrão|taxa de conversão|Alphaville|qualificar/i);
    expect(texto.split("\n")[0]).toContain("desmarcou");
    expect(texto).not.toContain("Falta saber");
  });

  it("diz o que falta saber", () => {
    const texto = formatarAlertaCorretor({
      ...base,
      motivo: "lead_quente",
      ficha: { rendaMensal: null, regiaoInteresse: null, dormitoriosMin: 2, orcamentoMax: null },
    });
    expect(texto).toContain("Falta saber: renda, região");
    // O que o deixou quente é a fala dele, não um parágrafo da IA.
    expect(texto).toContain('Disse: "pode me ligar?"');
  });

  it("o mesmo motivo não se repete dentro da carência; visita sempre sai", () => {
    const agora = new Date("2026-10-20T12:00:00Z");
    const ha1h = { ligacao_solicitada: "2026-10-20T11:00:00Z", visita_confirmada: "2026-10-20T11:59:00Z" };
    expect(alertaLiberado("ligacao_solicitada", ha1h, agora)).toBe(false);
    expect(alertaLiberado("transferencia_humana", ha1h, agora)).toBe(true);
    expect(alertaLiberado("visita_confirmada", ha1h, agora)).toBe(true);
    expect(alertaLiberado("ligacao_solicitada", { ligacao_solicitada: "2026-10-20T08:00:00Z" }, agora)).toBe(true);
  });

  it("vira notificação com a ação no título e sem endereços no corpo", () => {
    const n = notificacaoDoTexto(formatarAlertaCorretor(base));
    expect(n.titulo).toBe("📞 Ligue para Ana Prado");
    expect(n.corpo).toContain("Dom Parque");
    expect(n.corpo).not.toMatch(/https?:\/\//);
  });
});
