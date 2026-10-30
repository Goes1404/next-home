import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_TRANSCREVENDO,
  ESPERA_MAXIMA_PELA_TRANSCRICAO_MS,
  MARCADOR_ENCALHADO_MS,
  ORCAMENTO_DA_TRANSCRICAO_MS,
  TIMEOUT_DO_DOWNLOAD_DO_AUDIO_MS,
  decidirTranscricao,
  esperarTranscricoesDaRajada,
  marcadorEncalhado,
} from "./transcricaoNoGrupo";
import { aIaVaiResponderAoAudio } from "./quandoAIaResponde";

/*
 * Revisão de 30/10/2026 do áudio do cliente gravado com o marcador:
 *
 * 1. rajada áudio + texto: o texto espera a transcrição antes de responder
 *    (senão responde ao marcador e o áudio, absorvido, nunca é respondido);
 * 2. marcador encalhado (invocação morta): a reentrega refaz, a varredura de
 *    respostas atrasadas não responde ao placeholder, e a transcrição tem
 *    orçamento total;
 * 5. o teto do dia vale sempre que a IA não vai MESMO responder.
 */

// ── O banco falso das consultas do repositório ─────────────────────────────

type Linha = Record<string, unknown>;
const mensagens: Linha[] = [];
const filtrosVistos: { tabela: string; op: string; coluna: string; valor: unknown }[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      const filtros: ((l: Linha) => boolean)[] = [];
      let limite = Infinity;
      let desc = false;
      const registrar = (op: string, coluna: string, valor: unknown, f: (l: Linha) => boolean) => {
        filtrosVistos.push({ tabela, op, coluna, valor });
        filtros.push(f);
        return cadeia;
      };
      const resultado = () => {
        let linhas = mensagens.filter((l) => filtros.every((f) => f(l)));
        linhas = [...linhas].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        if (desc) linhas.reverse();
        return { data: linhas.slice(0, limite), error: null };
      };
      const cadeia: Record<string, unknown> = {
        select: () => cadeia,
        eq: (c: string, v: unknown) => registrar("eq", c, v, (l) => l[c] === v),
        neq: (c: string, v: unknown) => registrar("neq", c, v, (l) => l[c] !== v),
        gte: (c: string, v: string) => registrar("gte", c, v, (l) => String(l[c]) >= v),
        order: (_c: string, o?: { ascending?: boolean }) => {
          desc = o?.ascending === false;
          return cadeia;
        },
        limit: (n: number) => {
          limite = n;
          return cadeia;
        },
        maybeSingle: async () => {
          const r = resultado();
          return { data: r.data[0] ?? null, error: null };
        },
        then: (ok: (r: unknown) => void) => ok(resultado()),
      };
      return cadeia;
    },
  }),
}));

const { haAudioTranscrevendo, historicoRecente, falaDoClientePeloProvedor } = await import("./repositorio");

const AGORA = new Date("2026-10-30T15:00:00.000Z");
const antes = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();

beforeEach(() => {
  mensagens.length = 0;
  filtrosVistos.length = 0;
});

describe("rajada com áudio e texto (finding 1)", () => {
  it("o texto que chega 2 s depois do áudio espera a transcrição e responde com ela", async () => {
    // Áudio às t0 (ainda com o marcador), texto às t0+2s.
    mensagens.push(
      { id: "a", conversa_id: "c1", remetente: "cliente", conteudo: AUDIO_TRANSCREVENDO, provider_message_id: "A", created_at: antes(8_000) },
      { id: "t", conversa_id: "c1", remetente: "cliente", conteudo: "e aí?", provider_message_id: "B", created_at: antes(6_000) },
    );
    let consultas = 0;
    const desfecho = await esperarTranscricoesDaRajada({
      haAudioTranscrevendo: async () => {
        consultas++;
        // Na terceira olhada a invocação do áudio já trocou o marcador.
        if (consultas === 3) mensagens[0].conteudo = "Quero ver o apartamento de 3 quartos";
        return haAudioTranscrevendo({ conversaId: "c1", desde: new Date(AGORA.getTime() - MARCADOR_ENCALHADO_MS), excetoId: "t" });
      },
      dormir: async () => {},
    });
    expect(desfecho).toBe("livre");
    // E o histórico que a resposta lê tem a fala do áudio, não o marcador.
    const historico = await historicoRecente("c1");
    expect(historico.map((m) => m.texto)).toEqual(["Quero ver o apartamento de 3 quartos", "e aí?"]);
  });

  it("sem áudio transcrevendo, não espera nada", async () => {
    const dormir = vi.fn(async () => {});
    const desfecho = await esperarTranscricoesDaRajada({ haAudioTranscrevendo: async () => false, dormir });
    expect(desfecho).toBe("nada_a_esperar");
    expect(dormir).not.toHaveBeenCalled();
  });

  it("a espera tem teto: esgotado, responde assim mesmo", async () => {
    let relogio = 0;
    const desfecho = await esperarTranscricoesDaRajada({
      haAudioTranscrevendo: async () => true,
      dormir: async (ms) => {
        relogio += ms;
      },
      agora: () => relogio,
    });
    expect(desfecho).toBe("tempo_esgotado");
    expect(relogio).toBeGreaterThanOrEqual(ESPERA_MAXIMA_PELA_TRANSCRICAO_MS);
    expect(relogio).toBeLessThan(ESPERA_MAXIMA_PELA_TRANSCRICAO_MS + 2_000);
  });

  it("a consulta só olha marcador do cliente, recente, fora da própria fala", async () => {
    mensagens.push(
      { id: "proprio", conversa_id: "c1", remetente: "cliente", conteudo: AUDIO_TRANSCREVENDO, created_at: antes(1_000) },
      { id: "velho", conversa_id: "c1", remetente: "cliente", conteudo: AUDIO_TRANSCREVENDO, created_at: antes(MARCADOR_ENCALHADO_MS + 5_000) },
      { id: "outra", conversa_id: "c2", remetente: "cliente", conteudo: AUDIO_TRANSCREVENDO, created_at: antes(1_000) },
    );
    const desde = new Date(AGORA.getTime() - MARCADOR_ENCALHADO_MS);
    expect(await haAudioTranscrevendo({ conversaId: "c1", desde, excetoId: "proprio" })).toBe(false);
    expect(await haAudioTranscrevendo({ conversaId: "c1", desde })).toBe(true);
  });

  it("o marcador nunca entra no histórico do prompt", async () => {
    mensagens.push(
      { id: "1", conversa_id: "c1", remetente: "cliente", conteudo: "oi", created_at: antes(5_000) },
      { id: "2", conversa_id: "c1", remetente: "cliente", conteudo: AUDIO_TRANSCREVENDO, created_at: antes(4_000) },
    );
    expect((await historicoRecente("c1")).map((m) => m.texto)).toEqual(["oi"]);
    expect(filtrosVistos).toContainEqual({ tabela: "whatsapp_mensagens", op: "neq", coluna: "conteudo", valor: AUDIO_TRANSCREVENDO });
  });
});

describe("marcador encalhado (finding 2)", () => {
  it("só o marcador mais velho que o limite é encalhado", () => {
    expect(marcadorEncalhado({ conteudo: AUDIO_TRANSCREVENDO, criadoEm: antes(MARCADOR_ENCALHADO_MS + 1), agora: AGORA })).toBe(true);
    expect(marcadorEncalhado({ conteudo: AUDIO_TRANSCREVENDO, criadoEm: antes(5_000), agora: AGORA })).toBe(false);
    expect(marcadorEncalhado({ conteudo: "Quero visitar", criadoEm: antes(600_000), agora: AGORA })).toBe(false);
    expect(marcadorEncalhado({ conteudo: AUDIO_TRANSCREVENDO, criadoEm: null, agora: AGORA })).toBe(false);
  });

  it("a reentrega acha a fala gravada pelo id do provedor", async () => {
    mensagens.push({ id: "m1", conversa_id: "c1", remetente: "cliente", conteudo: AUDIO_TRANSCREVENDO, provider_message_id: "P1", created_at: antes(60_000) });
    const fala = await falaDoClientePeloProvedor({ conversaId: "c1", providerMessageId: "P1" });
    expect(fala).toEqual({ id: "m1", conteudo: AUDIO_TRANSCREVENDO, criadoEm: antes(60_000) });
    expect(marcadorEncalhado({ conteudo: fala!.conteudo, criadoEm: fala!.criadoEm, agora: AGORA })).toBe(true);
  });

  it("o orçamento (download + motores) cabe antes do limite de encalhado e do maxDuration", () => {
    // Duas tentativas de download + os motores, com folga para a gravação.
    expect(2 * TIMEOUT_DO_DOWNLOAD_DO_AUDIO_MS + ORCAMENTO_DA_TRANSCRICAO_MS).toBeLessThan(MARCADOR_ENCALHADO_MS);
    expect(MARCADOR_ENCALHADO_MS).toBeLessThan(60_000);
  });
});

describe("guarda de código do webhook", () => {
  const fonte = readFileSync(join(process.cwd(), "src/app/api/webhooks/whatsapp/route.ts"), "utf8");

  it("a reentrega de um áudio encalhado refaz a transcrição, com trava por linha", () => {
    const guarda = fonte.slice(fonte.indexOf("if (!gravacao.inedita) {"), fonte.indexOf('ignored: "reentrega"'));
    expect(guarda).toContain("falaDoClientePeloProvedor(");
    expect(guarda).toContain("marcadorEncalhado(");
    expect(guarda).toContain("travarDisparo(`retranscricao:${jaGravada.id}`");
    // A resposta da fala refeita não reentra na trava de quem a gravou.
    expect(fonte).toContain("`${providerMessageId}:refeita`");
  });

  it("a rajada espera o áudio ANTES do debounce", () => {
    const espera = fonte.indexOf("await esperarTranscricoesDaRajada(");
    expect(espera).toBeGreaterThan(fonte.indexOf("await dormir(ESPERA_RAJADA_MS);"));
    expect(espera).toBeLessThan(fonte.indexOf("const maisRecente = await ultimaMensagemClienteId(conversa.id);"));
  });

  it("a transcrição do cliente decide o teto pela decisão inteira da IA, não pelo bot_ativo (finding 5)", () => {
    const bloco = fonte.slice(fonte.indexOf("if (ehAudio) {\n      /*"), fonte.indexOf("text = await transcreverEsteAudio({ iaAtende, suspenso: suspensoAntes });"));
    expect(bloco).toContain("aIaVaiResponderAoAudio(");
    expect(bloco).toContain("lerCotaDaIa(instancia.grupoId)");
    expect(bloco).toContain("grupoSuspenso(instancia.grupoId)");
    expect(bloco).toContain("cotaEsgotada: cotaAntes?.nivel === \"esgotada\"");
    expect(fonte).not.toContain("conversa.botAtivo && !conversa.leadDeOutroCorretor;");
  });

  it("o download do áudio tem timeout próprio", () => {
    expect(fonte).toContain("timeoutMs: TIMEOUT_DO_DOWNLOAD_DO_AUDIO_MS");
  });

  it("a varredura de respostas atrasadas não responde enquanto há áudio transcrevendo", () => {
    const cron = readFileSync(join(process.cwd(), "src/app/api/cron/followups/route.ts"), "utf8");
    const responder = cron.slice(cron.indexOf("async function responderAtrasada("), cron.indexOf("export async function GET("));
    expect(responder.indexOf("haAudioTranscrevendo(")).toBeGreaterThan(-1);
    expect(responder.indexOf("haAudioTranscrevendo(")).toBeLessThan(responder.indexOf("executarTurnoDeAtendimento("));
  });
});

describe("o teto do dia segue a decisão real da IA (finding 5)", () => {
  const base = {
    conversa: { botAtivo: true, naoContatar: false, leadDeOutroCorretor: false },
    anuncioMeta: false,
    numero: { modo: "24_7" as const, expediente: { inicioHora: 9, fimHora: 18 } },
    ultimaFalaCorretorEm: null,
    cotaEsgotada: false,
    grupoSuspenso: false,
  };

  it("IA ligada e nada a calando: atende (a transcrição fica fora do teto)", () => {
    expect(aIaVaiResponderAoAudio(base)).toBe(true);
  });

  it("com bot_ativo mas a IA calada por outro motivo, não atende (o teto vale)", () => {
    expect(aIaVaiResponderAoAudio({ ...base, cotaEsgotada: true })).toBe(false);
    expect(aIaVaiResponderAoAudio({ ...base, grupoSuspenso: true })).toBe(false);
    expect(aIaVaiResponderAoAudio({ ...base, numero: { ...base.numero, modo: "desativado" as const } })).toBe(false);
    expect(aIaVaiResponderAoAudio({ ...base, anuncioMeta: true })).toBe(false);
  });

  it("e o grupo suspenso não transcreve nem com a IA 'atendendo'", () => {
    expect(decidirTranscricao({ iaAtende: true, transcricoesHoje: 0, teto: null, grupoSuspenso: true })).toBe("grupo_suspenso");
    expect(decidirTranscricao({ iaAtende: false, transcricoesHoje: 100, teto: 100, grupoSuspenso: false })).toBe("teto_do_dia");
  });
});

describe("orçamento dos motores de transcrição", () => {
  const fetchOriginal = globalThis.fetch;
  const AUDIO = "A".repeat(4000);
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
  });

  it("motor que trava consome o orçamento e os seguintes nem são chamados", async () => {
    vi.stubEnv("OPENAI_API_KEY", "x");
    vi.stubEnv("GROQ_API_KEY", "y");
    vi.stubEnv("GEMINI_API_KEY", "z");
    const chamadas: string[] = [];
    globalThis.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      chamadas.push(String(url));
      // Nunca responde: só o abort do timeout tira daqui.
      return new Promise<Response>((_, rejeitar) => {
        init?.signal?.addEventListener("abort", () => rejeitar(Object.assign(new Error("abort"), { name: "AbortError" })));
      });
    }) as unknown as typeof fetch;
    const { transcreverAudioWhatsapp } = await import("./audioTranscriber");
    const inicio = Date.now();
    const r = await transcreverAudioWhatsapp({
      base64: AUDIO,
      quemPaga: { corretorId: "c", grupoId: "g" },
      orcamentoMs: 2_000,
    });
    const levou = Date.now() - inicio;
    expect(r.sucesso).toBe(false);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toContain("openai");
    expect(levou).toBeLessThan(3_500);
  });
});
