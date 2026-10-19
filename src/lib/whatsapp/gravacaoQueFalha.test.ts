import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gravação de mensagem e telemetria não engolem erro de insert (L26).
 *
 * Antes, `gravarMensagem` devolvia `inedita: true` para qualquer erro que
 * não fosse a reentrega (23505): o webhook seguia e a IA respondia ao
 * cliente por cima de uma mensagem que não estava no banco. E
 * `registrarInteracao` nem lia o `{ error }`: com dois grupos, o "falha em
 * voz alta" do gatilho de grupo (Review Focus 1) viraria silêncio, e o
 * medidor da fase 2 contaria menos do que aconteceu.
 */

let respostaDoInsert: { data: unknown; error: { code?: string; message: string } | null };
const inserts: { tabela: string; linha: unknown }[] = [];
const updates: string[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => ({
      insert: (linha: unknown) => {
        inserts.push({ tabela, linha });
        const resultado = Promise.resolve(respostaDoInsert);
        return Object.assign(resultado, {
          select: () => ({ maybeSingle: async () => respostaDoInsert }),
        });
      },
      update: () => {
        updates.push(tabela);
        return { eq: async () => ({ data: null, error: null }) };
      },
    }),
  }),
}));

const { gravarMensagem } = await import("./repositorio");
const { registrarInteracao } = await import("./telemetria");

const mensagem = {
  conversaId: "conversa-1",
  remetente: "cliente" as const,
  conteudo: "Oi",
  conversaLiberada: true,
  providerMessageId: "WAID-1",
};

describe("gravarMensagem", () => {
  beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("não diz inédita quando o insert falha", async () => {
    respostaDoInsert = { data: null, error: { code: "23503", message: "violates foreign key" } };
    const r = await gravarMensagem(mensagem);
    expect(r.inedita).toBe(false);
    expect(r.id).toBeNull();
    expect(r.erro).toMatch(/foreign key/);
    // A conversa não ganha "última mensagem" de algo que não foi gravado.
    expect(updates).toEqual([]);
  });

  it("reentrega continua sendo reentrega, sem erro", async () => {
    respostaDoInsert = { data: null, error: { code: "23505", message: "duplicate key" } };
    const r = await gravarMensagem(mensagem);
    expect(r).toEqual({ inedita: false, id: null });
  });

  it("gravada de verdade é inédita", async () => {
    respostaDoInsert = { data: { id: "mensagem-1" }, error: null };
    const r = await gravarMensagem(mensagem);
    expect(r).toEqual({ inedita: true, id: "mensagem-1" });
    expect(updates).toEqual(["whatsapp_conversas"]);
  });
});

describe("registrarInteracao (telemetria)", () => {
  beforeEach(() => {
    inserts.length = 0;
  });

  it("devolve falha e loga quando o insert é recusado", async () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    respostaDoInsert = { data: null, error: { code: "P0001", message: "grupo_id obrigatório em ia_interacoes" } };
    const r = await registrarInteracao({ origem: "webhook", promptVersao: "v1", acao: "respondida" });
    expect(r).toEqual({ ok: false, erro: "grupo_id obrigatório em ia_interacoes" });
    expect(aviso).toHaveBeenCalled();
  });

  it("devolve ok quando grava", async () => {
    respostaDoInsert = { data: null, error: null };
    const r = await registrarInteracao({ origem: "webhook", promptVersao: "v1", acao: "respondida" });
    expect(r).toEqual({ ok: true });
    expect(inserts.map((i) => i.tabela)).toEqual(["ia_interacoes"]);
  });
});
