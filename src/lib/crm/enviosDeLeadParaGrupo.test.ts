import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { textoDoLeadDistribuido } from "./enviosDeLeadParaGrupo";

describe("aviso de lead distribuÃ­do no grupo", () => {
  it("traz o essencial para o corretor agir, em vez de expor a ficha inteira", () => {
    const texto = textoDoLeadDistribuido({
      corretor: "Andr\u00e9",
      nome: "Marina\nSilva",
      telefone: "(11) 99999-0000",
      origem: "site/contato",
      anuncio: null,
      empreendimento: "Aretz Residence",
    });
    expect(texto).toContain("Novo lead distribu\u00eddo");
    expect(texto).toContain("Andr\u00e9");
    expect(texto).toContain("Marina Silva");
    expect(texto).toContain("pelo site");
    expect(texto).toContain("Aretz Residence");
  });

  it("enfileira depois da roleta e deixa a entrega para o servidor", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0215_envio_de_leads_para_grupos.sql"), "utf8");
    expect(sql).toMatch(/after insert on public\.leads/i);
    expect(sql).toContain("new.corretor_id is null");
    expect(sql).toContain("on conflict (lead_id) do nothing");
  });
});
