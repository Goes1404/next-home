import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { destinoDoAviso, textoDoLeadDistribuido } from "./enviosDeLeadParaGrupo";

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

describe("para quem o aviso do lead realmente vai", () => {
  const item = { corretor_id: "A", grupo_jid: "1@g.us" };
  const lead = { corretor_id: "B", trazido_por: "imobiliaria", etapa: "novo" };
  const dono = { id: "B", ativo: true, whatsapp_grupo_leads_jid: "2@g.us" };

  it("manda para o grupo do dono atual quando o lead trocou de mão depois de enfileirar", () => {
    expect(destinoDoAviso(item, lead, dono)).toEqual({ acao: "enviar", corretorId: "B", grupoJid: "2@g.us" });
  });

  it("mantém o destino da fila quando o dono não mudou", () => {
    expect(
      destinoDoAviso(item, { ...lead, corretor_id: "A" }, { ...dono, id: "A", whatsapp_grupo_leads_jid: "1@g.us" }),
    ).toEqual({ acao: "enviar", corretorId: "A", grupoJid: "1@g.us" });
  });

  it("cancela o impulsionamento do próprio corretor: não é lead distribuído", () => {
    expect(destinoDoAviso(item, { ...lead, trazido_por: "corretor" }, dono)).toEqual({
      acao: "cancelar",
      motivo: "O cliente é do próprio corretor (anúncio dele).",
    });
  });

  it("cancela quando o dono atual não tem grupo", () => {
    expect(destinoDoAviso(item, lead, { ...dono, whatsapp_grupo_leads_jid: null }).acao).toBe("cancelar");
    expect(destinoDoAviso(item, lead, { ...dono, whatsapp_grupo_leads_jid: "  " }).acao).toBe("cancelar");
  });

  it("cancela quando o lead ficou sem dono ou o dono não foi encontrado", () => {
    expect(destinoDoAviso(item, { ...lead, corretor_id: null }, null).acao).toBe("cancelar");
    expect(destinoDoAviso(item, lead, null).acao).toBe("cancelar");
    expect(destinoDoAviso(item, lead, { ...dono, id: "OUTRO" }).acao).toBe("cancelar");
  });

  it("cancela quando o dono atual está inativo", () => {
    expect(destinoDoAviso(item, lead, { ...dono, ativo: false }).acao).toBe("cancelar");
  });

  it("cancela lead perdido ou fechado: já não há o que ligar", () => {
    expect(destinoDoAviso(item, { ...lead, etapa: "perdido" }, dono).acao).toBe("cancelar");
    expect(destinoDoAviso(item, { ...lead, etapa: "fechado" }, dono).acao).toBe("cancelar");
  });

  it("sem a ficha do lead, cancela", () => {
    expect(destinoDoAviso(item, null, dono).acao).toBe("cancelar");
  });
});
