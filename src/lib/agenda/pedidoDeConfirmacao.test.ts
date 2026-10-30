import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, leiturasSemGrupo, type BancoFalso } from "../../../test/bancoFalso";

/**
 * O pedido de confirmação de visita pelo WhatsApp (0246, 29/10/2026): nada
 * sai sem o toque do corretor (ou o opt-in do grupo), um pedido por data,
 * pelo número do dono do lead, e o lembrete da IA não repete a pergunta.
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
const envios: { instanceName: string; telefone: string; texto: string }[] = [];
const gravadas: { remetente: string; conteudo: string }[] = [];
let envioFunciona = true;
let cotas = 0;
let devolvidas = 0;
let situacao = { botAtivo: true, naoContatar: false, leadDeOutroCorretor: false };

vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: async (p: { instanceName: string; telefone: string; texto: string }) => {
    envios.push(p);
    return envioFunciona ? { enviado: true, messageId: "m1" } : { enviado: false, motivo: "falha" };
  },
}));
vi.mock("@/lib/whatsapp/repositorio", () => ({
  lerConversaPersistida: async (id: string) => ({ id, telefoneCliente: "5511999990000", ...situacao }),
  situacaoDaConversa: (c: typeof situacao) => ({ botAtivo: c.botAtivo, naoContatar: c.naoContatar, leadDeOutroCorretor: c.leadDeOutroCorretor }),
  gravarMensagem: async (m: { remetente: string; conteudo: string }) => {
    gravadas.push(m);
    return { inedita: true, id: "x" };
  },
  registrarResultadoEnvio: async () => {},
  reservarCotaCampanha: async () => {
    cotas++;
    return { permitido: true, esperaMs: 0 };
  },
  devolverCotaCampanha: async () => {
    devolvidas++;
  },
}));
vi.mock("@/lib/crm/interacoes", () => ({ registrarInteracao: async () => {} }));

const { pedirConfirmacaoDaVisita } = await import("./pedidoDeConfirmacao");
const { pedirConfirmacoesAutomaticas } = await import("./confirmacaoAutomatica");

// Quarta, 29/10/2026, 12h em São Paulo (dentro da janela e do expediente).
const agora = new Date("2026-10-29T15:00:00Z");
const daqui = (h: number) => new Date(agora.getTime() + h * 3_600_000).toISOString();
const AMANHA = daqui(22);

function montar() {
  banco = bancoFalso({
    grupos: [
      { id: GRUPO_A, confirmacao_visita_automatica: false },
      { id: GRUPO_B, confirmacao_visita_automatica: false },
    ],
    corretores: [
      { id: "ana", nome: "Ana Souza", grupo_id: GRUPO_A },
      { id: "bia", nome: "Bia", grupo_id: GRUPO_A },
    ],
    visitas: [
      { id: "v1", lead_id: "l1", corretor_id: "ana", inicio: AMANHA, status: "marcada", confirmacao_pedida_em: null, remarcacao_pedida_em: null, grupo_id: GRUPO_A },
      // Passada pelo gestor para a Bia: o lead continua da Ana.
      { id: "v2", lead_id: "l2", corretor_id: "bia", inicio: AMANHA, status: "marcada", confirmacao_pedida_em: null, remarcacao_pedida_em: null, grupo_id: GRUPO_A },
      { id: "vb", lead_id: "lb", corretor_id: "bia", inicio: AMANHA, status: "marcada", confirmacao_pedida_em: null, remarcacao_pedida_em: null, grupo_id: GRUPO_B },
    ],
    leads: [
      { id: "l1", nome: "Maria Lima", corretor_id: "ana", nao_contatar_em: null, arquivado_em: null, visita_agendada_em: AMANHA, visita_confirmada_em: null, visita_marcada_em: daqui(-48), empreendimento: { nome: "Residencial Bless" }, grupo_id: GRUPO_A },
      { id: "l2", nome: "João", corretor_id: "ana", nao_contatar_em: null, arquivado_em: null, visita_agendada_em: AMANHA, visita_confirmada_em: null, empreendimento: null, grupo_id: GRUPO_A },
    ],
    whatsapp_conversas: [
      { id: "c1", lead_id: "l1", corretor_id: "ana", grupo_id: GRUPO_A },
      { id: "c2", lead_id: "l2", corretor_id: "ana", grupo_id: GRUPO_A },
    ],
    corretor_whatsapp_instancias: [
      { id: "i-ana", corretor_id: "ana", instance_name: "ana-num", status_conexao: "conectado", conectado_em: daqui(-500), bloqueado_ate: null, modo_bot: "24_7", expediente_inicio: 9, expediente_fim: 20, grupo_id: GRUPO_A },
    ],
    whatsapp_followups: [
      // O lembrete de véspera da IA, ainda na fila: não pode sair depois do pedido.
      { id: "f-ia", conversa_id: "c1", tipo: "lembrete_visita", status: "pendente", created_at: daqui(-1), grupo_id: GRUPO_A },
    ],
  });
}

beforeEach(() => {
  envios.length = 0;
  gravadas.length = 0;
  envioFunciona = true;
  cotas = 0;
  devolvidas = 0;
  situacao = { botAtivo: true, naoContatar: false, leadDeOutroCorretor: false };
  montar();
});

const peloCorretor = (visitaId: string, corretorId = "ana", grupoId = GRUPO_A) =>
  pedirConfirmacaoDaVisita(banco.cliente as never, { visitaId, grupoId, quem: { por: "corretor", corretorId } }, agora);

describe("o toque do corretor", () => {
  it("manda o texto fixo do número dele, carimba a visita e registra o pedido como o lembrete daquela data", async () => {
    const r = await peloCorretor("v1");
    expect(r).toMatchObject({ enviado: true });
    expect(envios).toHaveLength(1);
    expect(envios[0]).toMatchObject({ instanceName: "ana-num", telefone: "5511999990000" });
    expect(envios[0].texto).toContain("Oi, Maria! Aqui é Ana.");
    expect(envios[0].texto).toContain("amanhã às 10h no Residencial Bless");
    expect(gravadas).toEqual([expect.objectContaining({ remetente: "corretor", conteudo: envios[0].texto })]);

    const visita = banco.tabelas.visitas.find((v) => v.id === "v1")!;
    expect(visita.confirmacao_pedida_em).toBe(agora.toISOString());
    expect(visita.confirmacao_pedida_por).toBe("corretor");
    expect(banco.tabelas.whatsapp_followups).toContainEqual(
      expect.objectContaining({ conversa_id: "c1", tipo: "lembrete_visita", status: "enviado", enviado_em: agora.toISOString() }),
    );
    // O lembrete da IA que estava na fila não sai mais.
    expect(banco.tabelas.whatsapp_followups.find((f) => f.id === "f-ia")).toMatchObject({ status: "cancelado" });
    // O toque é o corretor falando: não gasta a cota de envio por iniciativa.
    expect(cotas).toBe(0);
  });

  it("o texto ao cliente usa o vocabulário do ramo do grupo (30/10/2026)", async () => {
    banco.tabelas.grupos[0].ramo = "seguros";
    expect(await peloCorretor("v1")).toMatchObject({ enviado: true });
    expect(envios[0].texto).toContain("confirmar nossa reunião");
    expect(envios[0].texto).not.toContain("visita");
  });

  it("um pedido por data: o segundo toque não manda de novo", async () => {
    await peloCorretor("v1");
    const segundo = await peloCorretor("v1");
    expect(segundo).toEqual({ enviado: false, erro: expect.stringContaining("já foi pedida") });
    expect(envios).toHaveLength(1);
  });

  it("vale com a IA desligada na conversa (o corretor atende à mão)", async () => {
    situacao.botAtivo = false;
    expect(await peloCorretor("v1")).toMatchObject({ enviado: true });
  });

  it("não fala com quem pediu para não ser contatado", async () => {
    banco.tabelas.leads[0].nao_contatar_em = daqui(-5);
    expect(await peloCorretor("v1")).toMatchObject({ enviado: false });
    expect(envios).toHaveLength(0);
    expect(banco.tabelas.visitas[0].confirmacao_pedida_em).toBeNull();
  });

  it("só quem faz a visita, e só se for o dono do lead (a conversa é do número do dono)", async () => {
    expect(await peloCorretor("v1", "bia")).toMatchObject({ enviado: false });
    expect(await peloCorretor("v2", "bia")).toMatchObject({ enviado: false, erro: expect.stringContaining("passada") });
    expect(envios).toHaveLength(0);
  });

  it("visita de outro grupo não existe para quem pede", async () => {
    expect(await peloCorretor("vb", "bia", GRUPO_A)).toEqual({ enviado: false, erro: "Visita não encontrada." });
    expect(envios).toHaveLength(0);
  });

  it("envio que falha desfaz o carimbo: dá para tentar de novo", async () => {
    envioFunciona = false;
    expect(await peloCorretor("v1")).toMatchObject({ enviado: false });
    expect(banco.tabelas.visitas[0].confirmacao_pedida_em).toBeNull();
    expect(banco.tabelas.whatsapp_followups.find((f) => f.id === "f-ia")).toMatchObject({ status: "pendente" });
    envioFunciona = true;
    expect(await peloCorretor("v1")).toMatchObject({ enviado: true });
  });

  it("visita longe demais ainda não pode", async () => {
    banco.tabelas.visitas[0].inicio = daqui(60);
    banco.tabelas.leads[0].visita_agendada_em = daqui(60);
    expect(await peloCorretor("v1")).toMatchObject({ enviado: false, erro: expect.stringContaining("36h") });
  });

  it("toda leitura filtra o grupo de quem pede", async () => {
    await peloCorretor("v1");
    for (const tabela of ["visitas", "leads", "whatsapp_conversas", "corretor_whatsapp_instancias", "corretores"]) {
      expect(leiturasSemGrupo(banco, tabela), tabela).toEqual([]);
    }
  });
});

describe("a confirmação automática (opt-in do grupo)", () => {
  it("desligada (o padrão), nada sai", async () => {
    expect(await pedirConfirmacoesAutomaticas(banco.cliente as never, agora)).toBe(0);
    expect(envios).toHaveLength(0);
  });

  it("ligada, sai com a cota anti-ban e como mensagem da casa", async () => {
    banco.tabelas.grupos[0].confirmacao_visita_automatica = true;
    expect(await pedirConfirmacoesAutomaticas(banco.cliente as never, agora)).toBe(1);
    expect(envios).toHaveLength(1);
    expect(cotas).toBe(1);
    expect(gravadas[0].remetente).toBe("bot");
    expect(banco.tabelas.visitas.find((v) => v.id === "v1")?.confirmacao_pedida_por).toBe("automatica");
    // A v2 é de visita passada a outro corretor: não sai por número nenhum.
    expect(banco.tabelas.visitas.find((v) => v.id === "v2")?.confirmacao_pedida_em).toBeNull();
  });

  it("envio automático que falha devolve a cota e solta a visita", async () => {
    banco.tabelas.grupos[0].confirmacao_visita_automatica = true;
    envioFunciona = false;
    expect(await pedirConfirmacoesAutomaticas(banco.cliente as never, agora)).toBe(0);
    expect(cotas).toBe(1);
    expect(devolvidas).toBe(1);
    expect(banco.tabelas.visitas.find((v) => v.id === "v1")?.confirmacao_pedida_em).toBeNull();
  });

  it("respeita a IA desligada na conversa, como o lembrete de véspera", async () => {
    banco.tabelas.grupos[0].confirmacao_visita_automatica = true;
    situacao.botAtivo = false;
    expect(await pedirConfirmacoesAutomaticas(banco.cliente as never, agora)).toBe(0);
    expect(envios).toHaveLength(0);
  });

  it("respeita a IA desligada no número", async () => {
    banco.tabelas.grupos[0].confirmacao_visita_automatica = true;
    banco.tabelas.corretor_whatsapp_instancias[0].modo_bot = "desativado";
    expect(await pedirConfirmacoesAutomaticas(banco.cliente as never, agora)).toBe(0);
  });

  it("fora do expediente do corretor, espera", async () => {
    banco.tabelas.grupos[0].confirmacao_visita_automatica = true;
    banco.tabelas.corretor_whatsapp_instancias[0].expediente_inicio = 14;
    expect(await pedirConfirmacoesAutomaticas(banco.cliente as never, agora)).toBe(0);
    expect(banco.tabelas.visitas[0].confirmacao_pedida_em).toBeNull();
  });

  it("lembrete da IA que JÁ saiu vale como o pedido: o cliente não recebe os dois", async () => {
    banco.tabelas.grupos[0].confirmacao_visita_automatica = true;
    banco.tabelas.whatsapp_followups.push({
      id: "f-saiu",
      conversa_id: "c1",
      tipo: "lembrete_visita",
      status: "enviado",
      enviado_em: daqui(-2),
      grupo_id: GRUPO_A,
    });
    expect(await pedirConfirmacoesAutomaticas(banco.cliente as never, agora)).toBe(0);
  });
});
