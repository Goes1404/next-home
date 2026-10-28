import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * O provedor do WhatsApp reentrega a mesma mensagem quando o webhook demora
 * a responder. No canal de comandos isso respondia duas vezes, e o segundo
 * "sim" (já sem pergunta pendente) virava "não entendi". A mensagem com o
 * mesmo id é tratada uma vez só (0228).
 */
const enviados: string[] = [];
const responder = vi.fn(async () => "Pronto: visita marcada.");

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: async (p: { texto: string }) => (enviados.push(p.texto), { enviado: true }),
}));
vi.mock("@/lib/whatsapp/repositorio", () => ({ agendarVisitaLead: async () => true }));
vi.mock("@/lib/planos/cobrancaDoGrupo", () => ({ grupoSuspenso: async () => false }));
vi.mock("./conversa", () => ({ responderAoCorretor: responder }));

const { tratarConversaComOSistema } = await import("./canal");

/** Banco falso: só a chave (corretor, id da mensagem) da 0228 importa aqui. */
function banco() {
  const tratadas = new Set<string>();
  return {
    from: (tabela: string) => {
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        maybeSingle: async () => ({ data: { papel: "corretor" }, error: null }),
        insert: async (linha: { corretor_id: string; provider_message_id: string }) => {
          if (tabela !== "agenda_mensagens_tratadas") return { error: null };
          const chave = `${linha.corretor_id}:${linha.provider_message_id}`;
          if (tratadas.has(chave)) return { error: { code: "23505", message: "duplicate key" } };
          tratadas.add(chave);
          return { error: null };
        },
      };
      return cadeia;
    },
  } as never;
}

const instancia = {
  id: "i1",
  corretorId: "c1",
  grupoId: "g1",
  instanceName: "inst",
  whatsappCorretor: "5511988887777",
  telefoneConectado: "5511988887777",
  palavraChaveAtivacao: null,
  palavraChaveTeste: null,
} as never;

const mensagem = (supabase: unknown, providerMessageId: string | null) =>
  tratarConversaComOSistema({
    instancia,
    sender: "5511988887777",
    fromMe: true,
    texto: "sim",
    ehAudio: false,
    supabase: supabase as never,
    providerMessageId,
  });

describe("tratarConversaComOSistema, reentrega do provedor", () => {
  beforeEach(() => {
    enviados.length = 0;
    responder.mockClear();
  });

  it("a mesma mensagem duas vezes é respondida uma vez só", async () => {
    const supabase = banco();
    expect(await mensagem(supabase, "ABC")).toBe(true);
    expect(await mensagem(supabase, "ABC")).toBe(true);
    expect(responder).toHaveBeenCalledTimes(1);
    expect(enviados).toHaveLength(1);
  });

  it("mensagens diferentes são respondidas cada uma", async () => {
    const supabase = banco();
    await mensagem(supabase, "ABC");
    await mensagem(supabase, "DEF");
    expect(responder).toHaveBeenCalledTimes(2);
  });
});
