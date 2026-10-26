import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { destinoDoAviso, enviarLeadsDistribuidosParaGrupos, textoDoLeadDistribuido } from "./enviosDeLeadParaGrupo";

const enviarMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp/provider", () => ({ enviarMensagemWhatsappParaGrupo: enviarMock }));

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

describe("falha de leitura no worker", () => {
  type Linha = Record<string, unknown>;
  // Cliente falso: cada tabela devolve o que o teste mandar; os updates da
  // fila ficam registrados para conferir o que foi gravado.
  function clienteFalso(leitura: { leads: { data: Linha | null; error: { message: string } | null }; corretores: { data: Linha | null; error: { message: string } | null } }) {
    const updates: Linha[] = [];
    const fila = { id: "f1", lead_id: "L", corretor_id: "A", grupo_id: "G", instance_name: "central", grupo_jid: "1@g.us", tentativas: 0 };
    const cliente = {
      from(tabela: string) {
        let eUpdate = false;
        const cadeia: Record<string, unknown> = {
          select: () => cadeia,
          update: (valores: Linha) => {
            eUpdate = true;
            updates.push(valores);
            return cadeia;
          },
          in: () => cadeia,
          lte: () => cadeia,
          lt: () => cadeia,
          eq: () => cadeia,
          order: () => cadeia,
          limit: () => Promise.resolve({ data: [fila], error: null }),
          maybeSingle: () => {
            if (tabela === "lead_envios_grupo") return Promise.resolve({ data: eUpdate ? { id: "f1" } : null, error: null });
            if (tabela === "leads") return Promise.resolve(leitura.leads);
            if (tabela === "corretores") return Promise.resolve(leitura.corretores);
            return Promise.resolve({ data: { instance_name: "central", status_conexao: "conectado", conectado_em: "2026-10-01" }, error: null });
          },
          then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
        };
        return cadeia;
      },
    };
    return { cliente: cliente as never, updates };
  }
  const leadOk = { nome: "M", telefone: "1", origem: null, anuncio_origem: null, empreendimento_id: null, corretor_id: "B", trazido_por: "imobiliaria", etapa: "novo" };

  it("erro ao ler o lead volta para nova tentativa, não cancela", async () => {
    const { cliente, updates } = clienteFalso({ leads: { data: null, error: { message: "timeout" } }, corretores: { data: null, error: null } });
    await enviarLeadsDistribuidosParaGrupos(cliente);
    const final = updates.at(-1);
    expect(final).toMatchObject({ status: "erro", ultimo_erro: "Não foi possível consultar o lead agora." });
    expect(updates.some((u) => u.status === "cancelado")).toBe(false);
  });

  it("erro ao ler o corretor volta para nova tentativa, não cancela", async () => {
    const { cliente, updates } = clienteFalso({ leads: { data: leadOk, error: null }, corretores: { data: null, error: { message: "5xx" } } });
    await enviarLeadsDistribuidosParaGrupos(cliente);
    expect(updates.at(-1)).toMatchObject({ status: "erro" });
    expect(updates.some((u) => u.status === "cancelado")).toBe(false);
  });

  it("lead que a consulta confirma que não existe continua cancelando", async () => {
    const { cliente, updates } = clienteFalso({ leads: { data: null, error: null }, corretores: { data: null, error: null } });
    await enviarLeadsDistribuidosParaGrupos(cliente);
    expect(updates.at(-1)).toMatchObject({ status: "cancelado", ultimo_erro: "Lead não encontrado." });
  });
});
