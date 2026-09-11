import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const componente = fs.readFileSync(
  path.join(__dirname, "_componentes", "NovaCampanha.tsx"),
  "utf8",
);
const acoes = fs.readFileSync(path.join(__dirname, "acoes.ts"), "utf8");

describe("seleção manual da lista de transmissão", () => {
  it("leva etapa junto com o destinatário sem alterar a segurança por id", () => {
    expect(acoes).toContain("etapa: EtapaFunil");
    expect(acoes).toContain("etapa: lead.etapa");
    expect(acoes).toContain("elegiveis.filter((lead) => escolhidos.has(lead.id))");
  });

  it("busca por nome ou telefone e filtra por etapa", () => {
    expect(componente).toContain("`${lead.nome} ${lead.telefone}`");
    expect(componente).toContain("lead.etapa !== etapaLead");
    expect(componente).toContain("ETAPA_LABEL[lead.etapa]");
  });

  it("seleciona apenas resultados visíveis e permite revisar antes de avançar", () => {
    expect(componente).toContain("carteiraFiltrada.forEach");
    expect(componente).toContain("Selecionar resultados");
    expect(componente).toContain("Quem vai receber");
    expect(componente).toContain("Limpar seleção");
  });

  it("mostra a prévia e explica quem foi protegido de repetição", () => {
    expect(componente).toContain("preverPublicoCampanha(publico)");
    expect(componente).toContain("últimos 7 dias");
    expect(acoes).toContain("DIAS_SEM_REPETIR_CAMPANHA = 7");
    expect(acoes).toContain("status.eq.pendente,enviado_em.gte.");
  });

  it("agenda no horário de Brasília e revalida a janela no servidor", () => {
    expect(componente).toContain('type="datetime-local"');
    expect(componente).toContain("`${valor}:00-03:00`");
    expect(acoes).toContain("!dentroDaJanela(inicio)");
    expect(acoes).toContain("iniciarEm: inicio ?? undefined");
  });
});
