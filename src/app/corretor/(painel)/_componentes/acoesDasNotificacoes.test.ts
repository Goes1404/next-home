import { beforeEach, describe, expect, it, vi } from "vitest";

const envios: { corretorId: string; titulo: string }[] = [];
let sessao: { id: string; grupoId: string } | null = null;
let entregues = 1;

vi.mock("@/lib/corretorSessao", () => ({ getCorretorLogado: async () => sessao }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/notificacoes/push", () => ({
  notificarCorretor: async (_s: unknown, corretorId: string, n: { titulo: string }) => {
    envios.push({ corretorId, titulo: n.titulo });
    return entregues;
  },
}));

const { enviarNotificacaoDeTeste } = await import("./acoesDasNotificacoes");
const { NOTIFICACAO_DE_TESTE, resultadoDoTeste } = await import("./resultadoDoTeste");

beforeEach(() => {
  envios.length = 0;
  sessao = { id: "c1", grupoId: "g1" };
  entregues = 1;
});

describe("enviar notificação de teste", () => {
  it("vai só para os aparelhos do corretor da sessão", async () => {
    expect(await enviarNotificacaoDeTeste()).toEqual({ ok: "Enviada. Deve chegar em alguns segundos." });
    expect(envios).toEqual([{ corretorId: "c1", titulo: NOTIFICACAO_DE_TESTE.titulo }]);
  });

  it("a ação não aceita destino: nenhum argumento muda quem recebe", () => {
    expect(enviarNotificacaoDeTeste.length).toBe(0);
  });

  it("sem sessão não envia nada", async () => {
    sessao = null;
    expect((await enviarNotificacaoDeTeste()).erro).toMatch(/Entre no painel/);
    expect(envios).toHaveLength(0);
  });

  it("nenhum aparelho recebeu: explica o que fazer", async () => {
    entregues = 0;
    expect((await enviarNotificacaoDeTeste()).erro).toMatch(/Nenhum aparelho recebeu/);
  });

  it("a frase conta os aparelhos", () => {
    expect(resultadoDoTeste(3)).toEqual({ ok: "Enviada para 3 aparelhos." });
  });

  it("o texto é neutro, sem marca de casa", () => {
    expect(`${NOTIFICACAO_DE_TESTE.titulo} ${NOTIFICACAO_DE_TESTE.corpo}`).not.toMatch(/next home/i);
    expect(NOTIFICACAO_DE_TESTE.url.startsWith("/corretor")).toBe(true);
  });
});
