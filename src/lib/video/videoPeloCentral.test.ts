import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso } from "@/lib/central/bancoFalso";

/**
 * O vídeo pedido pelo número central: o `criarVideo` da tela sem sessão, e a
 * volta pelo central quando o worker conclui. O que não pode regredir:
 * - limite do plano e suspensão antes da fila; imóvel de outro grupo não;
 * - o job nasce marcado `origem: "central"` e o worker é acordado;
 * - a conclusão (status `pronto`/`erro` que o worker grava) volta pelo
 *   central uma vez só, com o vídeo como arquivo, e entra no histórico sem URL;
 * - com a onda desligada, o tique não lê nada.
 */

const G = "g1";
let limiteOk = true;
let suspenso = false;
const enfileirar = vi.fn<(...a: unknown[]) => Promise<{ ok: true; jobId: string; cobranca: "cota" }>>(async () => ({ ok: true, jobId: "job-1", cobranca: "cota" }));
const acionar = vi.fn();
let banco: ReturnType<typeof bancoFalso>;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/planos/cobrancaDoGrupo", () => ({ grupoSuspenso: async () => suspenso }));
vi.mock("@/lib/planos/usoDaIa", () => ({
  conferirLimite: async () =>
    limiteOk ? { ok: true, situacao: {} } : { ok: false, erro: "Seu plano tem 3 vídeos por mês e eles acabaram. Voltam no dia 1º.", situacao: {} },
}));
vi.mock("@/lib/marcaDoCrm/ler", () => ({ lerEnderecoDoCliente: async () => "https://nexthome.exemplo" }));
vi.mock("./fila", () => ({
  getSaldo: async () => ({ disponiveis: 2, cotaMensal: 5, usadosNoCiclo: 3, creditosAvulsos: 0 }),
  enfileirarVideo: (...a: unknown[]) => enfileirar(...a),
}));
vi.mock("./acionarRender", () => ({ acionarRender: () => acionar() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));

// A entrega: o canal dos avisos (Frente J) e o provedor, falsos.
const enviados: { tipo: string; telefone: string; conteudo: string }[] = [];
const historico: { corretorId: string; texto: string }[] = [];
let semCanal = false;
vi.mock("@/lib/central/avisos", async () => ({
  ...(await vi.importActual<object>("@/lib/central/avisos")),
  destinoPeloCentral: async () => (semCanal ? null : { instanceName: "central", telefone: "5511987654321" }),
  registrarAvisoNoHistorico: async (_s: unknown, corretorId: string, texto: string) => void historico.push({ corretorId, texto }),
}));
vi.mock("@/lib/whatsapp/provider", async () => ({
  ...(await vi.importActual<object>("@/lib/whatsapp/provider")),
  enviarMensagemWhatsapp: async (p: { telefone: string; texto: string }) => (enviados.push({ tipo: "texto", telefone: p.telefone, conteudo: p.texto }), { enviado: true }),
  enviarMidiaWhatsapp: async (p: { telefone: string; tipo: string; url: string }) => (enviados.push({ tipo: p.tipo, telefone: p.telefone, conteudo: p.url }), { enviado: true }),
}));

const { criarVideoPeloCentral } = await import("./videoPeloCentral");
const { entregarVideosPeloCentral } = await import("./entregaPeloCentral");

const foto = (n: number, alt: string) => ({ id: `m${n}`, tipo: "foto", url: `https://cdn.exemplo/f${n}.jpg`, alt, ordem: n, largura: 1, altura: 1, blur_data_url: null });

const linhaDoImovel = (id: string, grupo: string) => ({
  id,
  grupo_id: grupo,
  slug: `vitta-${id}`,
  nome: "Vitta",
  nomes_alternativos: [],
  status: "lancamento",
  tipo: "apartamento",
  finalidade: "lancamento",
  cidade: "Barueri",
  bairro: "Alphaville",
  midias: [foto(1, "Fachada do empreendimento"), foto(2, "Living integrado"), foto(3, "Piscina do condomínio")],
  tipologias: [],
  lazer: [],
  unidades: [],
});

const pedido = { corretorId: "c1", grupoId: G, empreendimentoId: "e1", canal: "story" as const, objetivo: "lancamento" as const };

describe("criarVideoPeloCentral", () => {
  beforeEach(() => {
    limiteOk = true;
    suspenso = false;
    enfileirar.mockClear();
    acionar.mockClear();
    banco = bancoFalso({
      empreendimentos: [linhaDoImovel("e1", G), linhaDoImovel("e9", "g2")],
      corretores: [{ id: "c1", grupo_id: G, nome: "Carol", slug: "carol" }],
    });
  });

  it("enfileira o roteiro do imóvel do grupo, marcado como pedido pelo central, e acorda o worker", async () => {
    expect(await criarVideoPeloCentral(pedido)).toEqual({ ok: true, jobId: "job-1" });
    const [args] = enfileirar.mock.calls[0] as [{ corretorId: string; empreendimentoId: string; briefing: Record<string, unknown>; roteiro: unknown[] }];
    expect(args.corretorId).toBe("c1");
    expect(args.empreendimentoId).toBe("e1");
    expect(args.briefing).toMatchObject({ origem: "central", imovelNome: "Vitta", canal: "story", fonte: "catalogo", titulo: "Vitta" });
    expect(String(args.briefing.rodape)).toContain("Carol");
    expect(args.roteiro.length).toBeGreaterThan(0);
    expect(acionar).toHaveBeenCalledTimes(1);
  });

  it("limite do plano, suspensão e imóvel de outro grupo barram antes da fila", async () => {
    limiteOk = false;
    expect(await criarVideoPeloCentral(pedido)).toMatchObject({ ok: false, erro: expect.stringContaining("acabaram") });
    limiteOk = true;
    suspenso = true;
    expect(await criarVideoPeloCentral(pedido)).toMatchObject({ ok: false, erro: expect.stringContaining("pausada") });
    suspenso = false;
    expect(await criarVideoPeloCentral({ ...pedido, empreendimentoId: "e9" })).toMatchObject({ ok: false });
    expect(enfileirar).not.toHaveBeenCalled();
    expect(acionar).not.toHaveBeenCalled();
  });
});

describe("entregarVideosPeloCentral (tique)", () => {
  const AGORA = new Date("2026-10-30T15:00:00Z");
  const job = (id: string, extra: Record<string, unknown>) => ({
    id,
    corretor_id: "c1",
    status: "pronto",
    url: `https://cdn.exemplo/${id}.mp4`,
    concluido_em: "2026-10-30T14:58:00Z",
    briefing: { origem: "central", imovelNome: "Vitta" },
    ...extra,
  });

  beforeEach(() => {
    enviados.length = 0;
    historico.length = 0;
    semCanal = false;
    banco = bancoFalso({
      video_jobs: [
        job("v1", {}),
        job("v2", { briefing: { imovelNome: "Vitta" } }), // pedido pela tela
        job("v3", { briefing: { origem: "central", imovelNome: "Vitta", centralEntregueEm: "2026-10-30T14:59:00Z" } }),
        job("v4", { status: "renderizando", concluido_em: null }),
        job("v5", { status: "erro", url: null }),
        job("v6", { concluido_em: "2026-10-28T10:00:00Z" }), // fora da janela de 24 h
      ],
    });
  });

  it("onda desligada: não lê nada", async () => {
    expect(await entregarVideosPeloCentral(banco.cliente, AGORA, 2)).toBe(0);
    expect(enviados).toEqual([]);
  });

  it("manda o pronto como vídeo e o que falhou como aviso, uma vez só, e grava a marca", async () => {
    expect(await entregarVideosPeloCentral(banco.cliente, AGORA, 3)).toBe(2);
    expect(enviados).toEqual([
      { tipo: "texto", telefone: "5511987654321", conteudo: "Ficou pronto o vídeo do Vitta. É só encaminhar." },
      { tipo: "video", telefone: "5511987654321", conteudo: "https://cdn.exemplo/v1.mp4" },
      { tipo: "texto", telefone: "5511987654321", conteudo: expect.stringContaining("o crédito voltou") },
    ]);
    expect(historico).toEqual([
      { corretorId: "c1", texto: "Ficou pronto o vídeo do Vitta. É só encaminhar.\n[vídeo]" },
      { corretorId: "c1", texto: expect.stringContaining("Não consegui fazer o vídeo") },
    ]);
    expect(JSON.stringify(historico)).not.toContain(".mp4");
    // Segundo tique: nada de novo.
    expect(await entregarVideosPeloCentral(banco.cliente, AGORA, 3)).toBe(0);
    expect(enviados).toHaveLength(3);
  });

  it("sem canal agora (central fora): não marca, e tenta no próximo tique", async () => {
    semCanal = true;
    expect(await entregarVideosPeloCentral(banco.cliente, AGORA, 3)).toBe(0);
    semCanal = false;
    expect(await entregarVideosPeloCentral(banco.cliente, AGORA, 3)).toBe(2);
  });
});
