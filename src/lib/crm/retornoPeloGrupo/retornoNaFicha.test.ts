import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("o teste passa o cliente");
  },
}));

import { bancoFalso } from "../../../../test/bancoFalso";
import { retornosDaLigacaoNaFicha } from "./retornoNaFicha";

const G = "g-1";

/** Os áudios que o número central de fato guardou para cada lead (retornos_de_ligacao). */
const GUARDADOS = [
  { id: "r1", grupo_id: G, lead_id: "l1", audio_path: `${G}/m1.ogg` },
  { id: "r2", grupo_id: G, lead_id: "l2", audio_path: `${G}/de-outro-lead.ogg` },
  { id: "r3", grupo_id: "g-2", lead_id: "l1", audio_path: `${G}/m-outro-grupo.ogg` },
];

function cenario(leadVisivel = true) {
  // O cliente de sessão só enxerga o lead quando a RLS deixa.
  const sessao = bancoFalso({ leads: leadVisivel ? [{ id: "l1", grupo_id: G }] : [] });
  const assinados: string[][] = [];
  const servico = bancoFalso({ retornos_de_ligacao: GUARDADOS });
  servico.cliente.storage = {
    from: () => ({
      createSignedUrls: async (caminhos: string[]) => {
        assinados.push(caminhos);
        return { data: caminhos.map((path) => ({ path, signedUrl: `https://x/${path}`, error: null })), error: null };
      },
    }),
  };
  return { sessao: sessao.cliente as never, servico: servico.cliente as never, assinados, consultas: sessao.consultas };
}

const retorno = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  tipo: "ligacao",
  detalhes: { origem: "grupo_whatsapp", resultado: "atendeu", mensagem_id: id, ...extra },
});

describe("retorno da ligação na ficha", () => {
  it("devolve o resultado em palavras e o link do áudio, só para a ligação do grupo", async () => {
    const c = cenario();
    const r = await retornosDaLigacaoNaFicha({
      sessao: c.sessao,
      servico: c.servico,
      leadId: "l1",
      linhas: [
        retorno("i1", { audio_path: `${G}/m1.ogg` }),
        retorno("i2", { resultado: "nao_atendeu" }),
        { id: "i3", tipo: "ligacao", detalhes: { origem: "painel" } },
        { id: "i4", tipo: "nota", detalhes: null },
      ],
    });
    expect(r.get("i1")).toEqual({ resultado: "Atendeu", audioUrl: `https://x/${G}/m1.ogg` });
    expect(r.get("i2")).toEqual({ resultado: "Não atendeu", audioUrl: null });
    expect(r.has("i3")).toBe(false);
    expect(r.has("i4")).toBe(false);
  });

  it("não assina link de áudio de outra pasta nem lê o grupo se não há áudio", async () => {
    const semAudio = cenario();
    await retornosDaLigacaoNaFicha({ sessao: semAudio.sessao, servico: semAudio.servico, leadId: "l1", linhas: [retorno("i1")] });
    expect(semAudio.consultas).toEqual([]);

    const c = cenario();
    const r = await retornosDaLigacaoNaFicha({
      sessao: c.sessao,
      servico: c.servico,
      leadId: "l1",
      linhas: [retorno("i1", { audio_path: "g-2/intruso.ogg" })],
    });
    expect(c.assinados).toEqual([]);
    expect(r.get("i1")).toEqual({ resultado: "Atendeu", audioUrl: null });
  });

  it("só assina o áudio que o retorno DESTE lead guardou, não o caminho que o histórico disser", async () => {
    const c = cenario();
    const r = await retornosDaLigacaoNaFicha({
      sessao: c.sessao,
      servico: c.servico,
      leadId: "l1",
      linhas: [
        retorno("i1", { audio_path: `${G}/m1.ogg` }),
        // Mesma pasta do grupo, mas o áudio é do relato de outro lead.
        retorno("i2", { audio_path: `${G}/de-outro-lead.ogg` }),
        // Linha que aponta para um arquivo que nenhum retorno guardou.
        retorno("i3", { audio_path: `${G}/inventado.ogg` }),
        // Retorno com o lead certo, mas registrado em outro grupo.
        retorno("i4", { audio_path: `${G}/m-outro-grupo.ogg` }),
      ],
    });
    expect(c.assinados).toEqual([[`${G}/m1.ogg`]]);
    expect(r.get("i1")?.audioUrl).toBe(`https://x/${G}/m1.ogg`);
    for (const id of ["i2", "i3", "i4"]) expect(r.get(id)).toEqual({ resultado: "Atendeu", audioUrl: null });
  });

  it("lead que a sessão não enxerga não ganha link nenhum", async () => {
    const c = cenario(false);
    const r = await retornosDaLigacaoNaFicha({
      sessao: c.sessao,
      servico: c.servico,
      leadId: "l1",
      linhas: [retorno("i1", { audio_path: `${G}/m1.ogg` })],
    });
    expect(c.assinados).toEqual([]);
    expect(r.get("i1")?.audioUrl).toBeNull();
  });
});
