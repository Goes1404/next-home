import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, leiturasSemGrupo, type BancoFalso } from "../../../../test/bancoFalso";

let banco: BancoFalso;
const enviadas: Array<{ grupoJid: string; texto: string }> = [];

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsappParaGrupo: async (p: { grupoJid: string; texto: string }) => {
    enviadas.push({ grupoJid: p.grupoJid, texto: p.texto });
    return { enviado: true, messageId: "central-1" };
  },
}));

const { avisarMensagemDoClienteNoGrupo } = await import("./mensagemDoCliente");

const G = "grupo-a";
const OUTRO = "grupo-b";

function semear(parcial: { envioStatus?: string; jidDoDono?: string | null } = {}) {
  banco = bancoFalso({
    lead_envios_grupo: [
      { id: "env-1", grupo_id: G, lead_id: "lead-ana", status: parcial.envioStatus ?? "enviado", enviado_em: "2026-10-26T12:00:00.000Z", ultima_mensagem_avisada_em: null },
    ],
    leads: [{ id: "lead-ana", grupo_id: G, nome: "Ana", corretor_id: "fernando" }],
    grupos: [
      { id: G, envio_grupo_leads_ativo: true, envio_grupo_leads_instancia: "central" },
      { id: OUTRO, envio_grupo_leads_ativo: true, envio_grupo_leads_instancia: "outra" },
    ],
    corretores: [
      { id: "fernando", grupo_id: G, ativo: true, whatsapp_grupo_leads_jid: parcial.jidDoDono === undefined ? "111@g.us" : parcial.jidDoDono },
    ],
    whatsapp_mensagens: [
      { id: "m1", grupo_id: G, conversa_id: "c1", remetente: "cliente", tipo: "texto", conteudo: "oi", created_at: "2026-10-26T13:00:00.000Z" },
      { id: "m2", grupo_id: G, conversa_id: "c1", remetente: "cliente", tipo: "audio", conteudo: "[Áudio recebido — não foi possível transcrever automaticamente]", created_at: "2026-10-26T13:00:05.000Z" },
      { id: "m3", grupo_id: G, conversa_id: "c1", remetente: "cliente", tipo: "texto", conteudo: "quando vão me ligar?", created_at: "2026-10-26T13:00:06.000Z" },
      { id: "x9", grupo_id: OUTRO, conversa_id: "c1", remetente: "cliente", tipo: "texto", conteudo: "de outro grupo", created_at: "2026-10-26T13:00:07.000Z" },
    ],
  });
  ordenarDeVerdade("whatsapp_mensagens");
}

/*
 * O `order` do banco falso não faz nada. Aqui ele ordena a tabela antes da
 * consulta rodar (e antes do `limit` cortar), como o Postgres: é isso que
 * mostra qual janela de mensagens a consulta enxerga de fato.
 */
function ordenarDeVerdade(tabela: string) {
  const from = banco.cliente.from;
  banco.cliente.from = ((t: string) => {
    const q = from(t);
    if (t !== tabela) return q;
    q.order = ((coluna: string, opcoes?: { ascending?: boolean }) => {
      const sinal = opcoes?.ascending === false ? -1 : 1;
      banco.tabelas[tabela].sort((a, b) => sinal * String(a[coluna]).localeCompare(String(b[coluna])));
      return q;
    }) as typeof q.order;
    return q;
  }) as typeof banco.cliente.from;
}

const chamar = (mensagemId: string) =>
  avisarMensagemDoClienteNoGrupo({ grupoId: G, leadId: "lead-ana", conversaId: "c1", mensagemId, esperaMs: 0 });

describe("aviso de mensagem do cliente no grupo (fluxo)", () => {
  beforeEach(() => {
    enviadas.length = 0;
    semear();
  });

  it("a chamada da mensagem mais nova avisa a rajada inteira no grupo do dono, sem o marcador do áudio", async () => {
    await chamar("m3");
    expect(enviadas).toEqual([
      { grupoJid: "111@g.us", texto: '💬 Ana mandou mensagens e áudio:\n"oi"\n"quando vão me ligar?"' },
    ]);
    expect(banco.tabelas.lead_envios_grupo[0].ultima_mensagem_avisada_em).toBe("2026-10-26T13:00:06.000Z");
    for (const tabela of ["lead_envios_grupo", "leads", "corretores", "whatsapp_mensagens"]) {
      expect(leiturasSemGrupo(banco, tabela)).toEqual([]);
    }
  });

  it("a chamada de uma mensagem que não é a mais nova não avisa", async () => {
    await chamar("m1");
    expect(enviadas).toEqual([]);
  });

  it("lead sem aviso no grupo ou dono sem grupo: nada sai", async () => {
    semear({ envioStatus: "pendente" });
    await chamar("m3");
    semear({ jidDoDono: null });
    await chamar("m3");
    expect(enviadas).toEqual([]);
  });

  it("mais de 50 mensagens acumuladas: a mais nova ainda avisa, com as mais recentes", async () => {
    const base = Date.parse("2026-10-26T13:01:00.000Z");
    for (let i = 0; i < 60; i++) {
      banco.tabelas.whatsapp_mensagens.push({
        id: `r${i}`,
        grupo_id: G,
        conversa_id: "c1",
        remetente: "cliente",
        tipo: "texto",
        conteudo: `mensagem ${i}`,
        created_at: new Date(base + i * 1000).toISOString(),
      });
    }
    await chamar("r59");
    expect(enviadas).toHaveLength(1);
    // As 50 mais recentes (r10..r59), em ordem: as 5 primeiras aparecem, o resto é contado.
    expect(enviadas[0].texto.split("\n").slice(1, 3)).toEqual(['"mensagem 10"', '"mensagem 11"']);
    expect(enviadas[0].texto.split("\n").at(-1)).toBe("…e mais 45");
    expect(banco.tabelas.lead_envios_grupo[0].ultima_mensagem_avisada_em).toBe("2026-10-26T13:01:59.000Z");
  });

  it("depois do aviso, só as mensagens novas entram no próximo", async () => {
    await chamar("m3");
    banco.tabelas.whatsapp_mensagens.push({ id: "m4", grupo_id: G, conversa_id: "c1", remetente: "cliente", tipo: "texto", conteudo: "alô?", created_at: "2026-10-26T13:05:00.000Z" });
    await chamar("m4");
    expect(enviadas.at(-1)?.texto).toBe('💬 Ana mandou mensagem: "alô?"');
  });
});
