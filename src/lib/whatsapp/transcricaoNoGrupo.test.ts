import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_SEM_TRANSCRICAO,
  AUDIO_SEM_TRANSCRICAO_PELO_TETO,
  AUDIO_TRANSCREVENDO,
  decidirTranscricao,
  ehMarcadorDeAudio,
  inicioDoDiaEmSaoPaulo,
  tetoDeTranscricoesDoDia,
  textoDoAudioNaoTranscrito,
} from "./transcricaoNoGrupo";
import { TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";

/*
 * Áudio do cliente vira texto (IA no atendimento, 30/10/2026): o teto
 * diário por grupo com a IA calada, a troca idempotente do marcador e a
 * ordem no webhook (grava, guarda de reentrega, só então transcreve).
 */

describe("decidirTranscricao (teto do dia)", () => {
  it("com a IA atendendo transcreve sempre, mesmo acima do teto", () => {
    expect(decidirTranscricao({ iaAtende: true, transcricoesHoje: 999, teto: 10, grupoSuspenso: false })).toBe("transcrever");
  });

  it("grupo suspenso nunca transcreve, nem com a IA ligada (revisão de 30/10/2026)", () => {
    expect(decidirTranscricao({ iaAtende: true, transcricoesHoje: 0, teto: null, grupoSuspenso: true })).toBe("grupo_suspenso");
  });

  it("com a IA calada respeita o teto e a suspensão", () => {
    expect(decidirTranscricao({ iaAtende: false, transcricoesHoje: 9, teto: 10, grupoSuspenso: false })).toBe("transcrever");
    expect(decidirTranscricao({ iaAtende: false, transcricoesHoje: 10, teto: 10, grupoSuspenso: false })).toBe("teto_do_dia");
    expect(decidirTranscricao({ iaAtende: false, transcricoesHoje: 0, teto: 10, grupoSuspenso: true })).toBe("grupo_suspenso");
    expect(decidirTranscricao({ iaAtende: false, transcricoesHoje: 10_000, teto: null, grupoSuspenso: false })).toBe("transcrever");
  });

  it("o teto por plano: imobiliária por assento, custo sem teto, plano desconhecido no essencial", () => {
    expect(tetoDeTranscricoesDoDia({ plano: "essencial", assentos: 5 })).toBe(100);
    expect(tetoDeTranscricoesDoDia({ plano: "imobiliaria", assentos: 3 })).toBe(300);
    expect(tetoDeTranscricoesDoDia({ plano: "imobiliaria", assentos: 0 })).toBe(100);
    expect(tetoDeTranscricoesDoDia({ plano: "custo", assentos: 3 })).toBeNull();
    expect(tetoDeTranscricoesDoDia({ plano: "inventado", assentos: 1 })).toBe(100);
  });

  it("o texto que fica no lugar diz o motivo", () => {
    expect(textoDoAudioNaoTranscrito("teto_do_dia")).toBe(AUDIO_SEM_TRANSCRICAO_PELO_TETO);
    expect(textoDoAudioNaoTranscrito("grupo_suspenso")).toBe(AUDIO_SEM_TRANSCRICAO);
  });

  it("o dia do teto é o de São Paulo", () => {
    // 01h UTC do dia 31 ainda é dia 30 em São Paulo (22h).
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-10-31T01:00:00Z")).toISOString()).toBe("2026-10-30T03:00:00.000Z");
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-10-30T03:00:00Z")).toISOString()).toBe("2026-10-30T03:00:00.000Z");
  });

  it("marcadores de áudio (inclusive a falha antiga) não são fala", () => {
    expect(ehMarcadorDeAudio(AUDIO_TRANSCREVENDO)).toBe(true);
    expect(ehMarcadorDeAudio(AUDIO_SEM_TRANSCRICAO_PELO_TETO)).toBe(true);
    expect(ehMarcadorDeAudio("[Áudio recebido — não foi possível transcrever automaticamente]")).toBe(true);
    expect(ehMarcadorDeAudio("Quero visitar sábado")).toBe(false);
    expect(ehMarcadorDeAudio(null)).toBe(false);
  });
});

/*
 * A troca do marcador pela transcrição: um banco falso com UMA linha, que só
 * aceita o update quando todos os filtros `.eq` casam — como o PostgREST.
 */
type Linha = { id: string; conteudo: string };
const mensagens: Linha[] = [];
const conversas: { id: string; ultima_mensagem: string }[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => ({
      update: (valores: Record<string, string>) => {
        const filtros: Record<string, string> = {};
        const aplicar = () => {
          const alvo = (tabela === "whatsapp_mensagens" ? mensagens : conversas) as Record<string, string>[];
          const casam = alvo.filter((l) => Object.entries(filtros).every(([c, v]) => l[c] === v));
          for (const l of casam) Object.assign(l, valores);
          return casam.map((l) => ({ id: l.id }));
        };
        const cadeia = {
          eq: (c: string, v: string) => {
            filtros[c] = v;
            return cadeia;
          },
          select: async () => ({ data: aplicar(), error: null }),
          then: (ok: (r: unknown) => void) => ok({ data: aplicar(), error: null }),
        };
        return cadeia;
      },
    }),
  }),
}));

const { gravarTranscricaoDoAudio } = await import("./repositorio");

describe("gravarTranscricaoDoAudio (idempotente)", () => {
  beforeEach(() => {
    mensagens.length = 0;
    conversas.length = 0;
    mensagens.push({ id: "m1", conteudo: AUDIO_TRANSCREVENDO });
    conversas.push({ id: "c1", ultima_mensagem: AUDIO_TRANSCREVENDO });
  });

  it("troca o marcador pela transcrição, na mensagem e na prévia da conversa", async () => {
    const trocou = await gravarTranscricaoDoAudio({ mensagemId: "m1", conversaId: "c1", texto: "Quero visitar sábado", textoLiberado: true });
    expect(trocou).toBe(true);
    expect(mensagens[0].conteudo).toBe("Quero visitar sábado");
    expect(conversas[0].ultima_mensagem).toBe("Quero visitar sábado");
  });

  it("a segunda chamada não muda nada (o marcador já saiu)", async () => {
    await gravarTranscricaoDoAudio({ mensagemId: "m1", conversaId: "c1", texto: "primeira", textoLiberado: true });
    const deNovo = await gravarTranscricaoDoAudio({ mensagemId: "m1", conversaId: "c1", texto: "segunda", textoLiberado: true });
    expect(deNovo).toBe(false);
    expect(mensagens[0].conteudo).toBe("primeira");
  });

  it("conversa sem atendimento liberado continua sem texto", async () => {
    mensagens[0].conteudo = TEXTO_NAO_GUARDADO;
    const trocou = await gravarTranscricaoDoAudio({ mensagemId: "m1", conversaId: "c1", texto: "fala pessoal", textoLiberado: false });
    expect(trocou).toBe(false);
    expect(mensagens[0].conteudo).toBe(TEXTO_NAO_GUARDADO);
  });
});

describe("webhook: a fala do cliente é gravada antes da transcrição", () => {
  const fonte = readFileSync(join(process.cwd(), "src/app/api/webhooks/whatsapp/route.ts"), "utf8");

  it("o áudio do cliente entra no banco com o marcador", () => {
    expect(fonte).toMatch(/if \(ehAudio\) text = fromMe \? await transcreverEsteAudio\(\{ iaAtende: false \}\) : AUDIO_TRANSCREVENDO;/);
  });

  it("a transcrição do cliente vem DEPOIS da guarda de reentrega (o mesmo áudio nunca é pago duas vezes)", () => {
    const gravacao = fonte.indexOf('remetente: "cliente",');
    const reentrega = fonte.indexOf('ignored: "reentrega"');
    const transcricao = fonte.indexOf("text = await transcreverEsteAudio({ iaAtende, suspenso: suspensoAntes });");
    expect(gravacao).toBeGreaterThan(-1);
    expect(reentrega).toBeGreaterThan(gravacao);
    expect(transcricao).toBeGreaterThan(reentrega);
    // E antes da decisão da IA: o turno, a recusa e o dossiê leem o texto.
    expect(transcricao).toBeLessThan(fonte.indexOf("const decisaoIA = decidirSeAIaResponde("));
    expect(fonte.slice(transcricao, transcricao + 600)).toContain("gravarTranscricaoDoAudio(");
  });

  it("com a IA calada, o teto do dia é lido antes de transcrever", () => {
    const funcao = fonte.slice(fonte.indexOf("const transcreverEsteAudio"), fonte.indexOf("if (ehAudio) text = fromMe"));
    expect(funcao).toContain('contarUsoDaIaDeHoje(instancia.grupoId, "transcricao_audio")');
    expect(funcao.indexOf("decidirTranscricao(")).toBeLessThan(funcao.indexOf("transcreverAudioWhatsapp("));
  });
});
