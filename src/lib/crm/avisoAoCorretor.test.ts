import { describe, expect, it, vi } from "vitest";

/*
 * Todo aviso ao corretor pelo WhatsApp leva uma marca invisível no fim: se o
 * provedor devolver o eco da mensagem (fromMe, na conversa do próprio
 * corretor), o canal de comandos da Agenda a reconhece e não a lê como
 * pedido (revisão final das fases 2–5, 27/10/2026).
 */
const enviados: string[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notificacoes/push", () => ({ notificarCorretor: async () => false }));
vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: async (p: { texto: string }) => (enviados.push(p.texto), { enviado: true }),
}));

const { avisarCorretor, MARCA_INVISIVEL_DO_SISTEMA } = await import("./avisoAoCorretor");

const supabase = {
  from: (tabela: string) => {
    const cadeia = {
      select: () => cadeia,
      eq: () => cadeia,
      limit: () => cadeia,
      maybeSingle: async () => ({
        data: tabela === "corretores" ? { whatsapp: "5511988887777", ativo: true, nome: "Ana" } : { instance_name: "inst" },
        error: null,
      }),
    };
    return cadeia;
  },
} as never;

describe("avisarCorretor", () => {
  it("o texto do WhatsApp termina com a marca invisível do sistema", async () => {
    await avisarCorretor(supabase, "c1", "Você recebeu uma visita.");
    expect(MARCA_INVISIVEL_DO_SISTEMA).toBe(String.fromCharCode(0x2063));
    expect(enviados[0]).toBe(`Você recebeu uma visita.${String.fromCharCode(0x2063)}`);
  });
});
