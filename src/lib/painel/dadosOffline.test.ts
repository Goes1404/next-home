import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ItemDaAgenda } from "@/lib/agenda/itens";
import { LEADS_OFFLINE, ROTA_DOS_DADOS_OFFLINE, montarDadosOffline, textoDoItem } from "./dadosOffline";

describe("dados do app sem internet", () => {
  const visita: ItemDaAgenda = {
    tipo: "visita",
    id: "v1",
    inicio: "2026-10-29T13:00:00Z",
    leadId: "l1",
    nome: "Ana",
    telefone: "5511999990000",
    imovel: { nome: "Solar", endereco: "Rua Secreta, 10" },
    confirmadaPeloCliente: true,
  };

  it("o item da agenda vira uma linha, sem telefone nem endereço", () => {
    expect(textoDoItem(visita)).toBe("Visita: Ana · Solar");
    expect(textoDoItem({ tipo: "compromisso", id: "c", inicio: "", fim: "", subtipo: "reuniao", titulo: "", podeCancelar: false })).toBe(
      "Compromisso: Reunião",
    );
  });

  it("só os campos mínimos, só 20 leads, e o id do usuário para a caixa do service worker", () => {
    const leads = Array.from({ length: 30 }, (_, i) => ({ nome: ` Lead ${i} `, telefone: "55", etapa: "novo", created_at: "2026-10-29T10:00:00Z" }));
    const d = montarDadosOffline({ usuarioId: "u1", agora: new Date("2026-10-29T15:00:00Z"), dia: "2026-10-29", agenda: [visita], leads });
    expect(d.usuarioId).toBe("u1");
    expect(d.versao).toBe(1);
    expect(d.leads).toHaveLength(LEADS_OFFLINE);
    expect(d.leads[0]).toEqual({ nome: "Lead 0", telefone: "55", etapa: "Leads", criadoEm: "2026-10-29T10:00:00Z" });
    expect(Object.keys(d.agenda[0])).toEqual(["tipo", "inicio", "texto"]);
    expect(JSON.stringify(d)).not.toContain("Rua Secreta");
  });

  it("a página offline lê a mesma rota", () => {
    expect(readFileSync("public/offline.html", "utf8")).toContain(`fetch("${ROTA_DOS_DADOS_OFFLINE}"`);
    // Nome de lead nunca vira HTML na página offline.
    expect(readFileSync("public/offline.html", "utf8")).not.toMatch(/innerHTML/);
  });
});
