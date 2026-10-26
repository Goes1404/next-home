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

function cenario(leadVisivel = true) {
  // O cliente de sessão só enxerga o lead quando a RLS deixa.
  const sessao = bancoFalso({ leads: leadVisivel ? [{ id: "l1", grupo_id: G }] : [] });
  const assinados: string[][] = [];
  const servico = {
    storage: {
      from: () => ({
        createSignedUrls: async (caminhos: string[]) => {
          assinados.push(caminhos);
          return { data: caminhos.map((path) => ({ path, signedUrl: `https://x/${path}`, error: null })), error: null };
        },
      }),
    },
  };
  return { sessao: sessao.cliente as never, servico: servico as never, assinados, consultas: sessao.consultas };
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
