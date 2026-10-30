import { beforeEach, describe, expect, it, vi } from "vitest";
import { comTentativa, decidirResumo, INTERVALO_AUTOMATICO_MS, tentativaDoResumo } from "./resumoDaConversa";

/*
 * O resumo da conversa e a nota pela SESSÃO do painel (revisão de
 * 30/10/2026):
 *
 * - finding 4: a sessão não grava a nota — ela pode não ler a conversa (ADM,
 *   lead em outro número) e gravaria "frio — sumiu" por cima da boa;
 * - finding 10: a tentativa de resumo é carimbada antes da chamada, e quem
 *   não consegue gravar (RLS: 0 linhas) não chama a IA.
 */

let respostaDaIa: { ok: true; json: unknown } | { ok: false; erro: string } = { ok: false, erro: "x" };
let chamadasDaIa = 0;
vi.mock("@/lib/whatsapp/llm", () => ({
  algumProvedorConfigurado: () => true,
  chamarLlmJson: async () => {
    chamadasDaIa++;
    return respostaDaIa;
  },
}));

const { atualizarResumoDaConversa, lerEstadoDoResumo } = await import("./resumoDaConversaServidor");

type Linha = Record<string, unknown>;
const AGORA = new Date("2026-10-30T15:00:00.000Z");
const minutosAtras = (m: number) => new Date(AGORA.getTime() - m * 60_000).toISOString();

/**
 * A sessão: `conversasVisiveis` é o que a RLS deixa ver; `podeGravar` diz se
 * o update no lead afeta a linha (a RLS devolve 0 linhas, sem erro).
 */
function sessao(p: { conversasVisiveis: boolean; podeGravar: boolean; lead?: Linha }) {
  const tabelas: Record<string, Linha[]> = {
    leads: [
      {
        id: "L1",
        grupo_id: "g1",
        etapa: "em_conversa",
        tentativas_sem_resposta: 0,
        resumo_conversa: null,
        resumo_conversa_em: null,
        resumo_conversa_ate: null,
        nota_score: 80,
        nota_label: "quente",
        nota_motivo: "pediu visita",
        nota_calculada_em: minutosAtras(120),
        ...p.lead,
      },
    ],
    whatsapp_conversas: p.conversasVisiveis ? [{ id: "C1", lead_id: "L1" }] : [],
    whatsapp_mensagens: p.conversasVisiveis
      ? [
          { conversa_id: "C1", remetente: "cliente", conteudo: "quero visitar sábado", created_at: minutosAtras(30) },
          { conversa_id: "C1", remetente: "bot", conteudo: "claro, às 10h?", created_at: minutosAtras(29) },
          { conversa_id: "C1", remetente: "cliente", conteudo: "pode ser", created_at: minutosAtras(28) },
        ]
      : [],
    lead_observacoes_ia: [],
    grupos: [{ id: "g1", ramo: null }],
  };
  const updates: Linha[] = [];
  const cliente = {
    from(tabela: string) {
      const filtros: ((l: Linha) => boolean)[] = [];
      let operacao = "select";
      let valores: Linha = {};
      let limite = Infinity;
      let desc = false;
      const executar = () => {
        const linhas = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
        if (operacao === "update") {
          updates.push({ tabela, ...valores });
          if (!p.podeGravar) return { data: [], error: null };
          for (const l of linhas) Object.assign(l, valores);
          return { data: linhas.map((l) => ({ id: l.id })), error: null };
        }
        const ordenadas = [...linhas].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
        if (desc) ordenadas.reverse();
        return { data: ordenadas.slice(0, limite), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        update: (v: Linha) => {
          operacao = "update";
          valores = v;
          return q;
        },
        eq: (c: string, v: unknown) => {
          filtros.push((l) => l[c] === v);
          return q;
        },
        in: (c: string, vs: unknown[]) => {
          filtros.push((l) => vs.includes(l[c]));
          return q;
        },
        gte: (c: string, v: string) => {
          filtros.push((l) => String(l[c]) >= v);
          return q;
        },
        order: (_c: string, o?: { ascending?: boolean }) => {
          desc = o?.ascending === false;
          return q;
        },
        limit: (n: number) => {
          limite = n;
          return q;
        },
        maybeSingle: async () => {
          const r = executar();
          return { data: (r.data as Linha[])[0] ?? null, error: null };
        },
        then: (ok: (r: unknown) => void, falha?: (e: unknown) => void) => Promise.resolve(executar()).then(ok, falha),
      };
      return q;
    },
  };
  return { cliente: cliente as never, tabelas, updates };
}

const pedido = { leadId: "L1", corretorId: "c1", grupoId: "g1", ramo: "imobiliaria" as const, ramoDescricao: null, resumosHoje: 0, semCota: false };

beforeEach(() => {
  chamadasDaIa = 0;
  respostaDaIa = { ok: false, erro: "x" };
});

describe("a sessão não grava a nota (finding 4)", () => {
  it("ADM sem a conversa: mostra a nota gravada pela chave e não grava nada", async () => {
    const s = sessao({ conversasVisiveis: false, podeGravar: true });
    const estado = await lerEstadoDoResumo(s.cliente, "L1", AGORA);
    expect(estado?.nota).toEqual({ score: 80, label: "quente", motivo: "pediu visita" });
    expect(s.updates).toEqual([]);
    expect(s.tabelas.leads[0].nota_score).toBe(80);
  });

  it("dono da conversa: a nota vencida é refeita só para a tela", async () => {
    const s = sessao({ conversasVisiveis: true, podeGravar: true });
    const estado = await lerEstadoDoResumo(s.cliente, "L1", AGORA);
    expect(estado?.nota).toBeTruthy();
    expect(s.updates).toEqual([]);
  });

  it("depois do resumo, a nota fica para a chave refazer (nota_calculada_em vazio), sem gravar score", async () => {
    respostaDaIa = { ok: true, json: { quer: "Visitar sábado", proximoPasso: "Confirmar a visita hoje", temperatura: "quente" } };
    const s = sessao({ conversasVisiveis: true, podeGravar: true });
    const estado = await atualizarResumoDaConversa(s.cliente, { ...pedido, forcar: false, agora: AGORA });
    expect(estado?.decisao).toBe("gerar");
    expect(s.updates.some((u) => "nota_score" in u)).toBe(false);
    expect(s.tabelas.leads[0].nota_calculada_em).toBeNull();
    expect(s.tabelas.leads[0].nota_score).toBe(80);
  });
});

describe("o intervalo do resumo conta a TENTATIVA (finding 10)", () => {
  it("resposta ilegível carimba a tentativa e a próxima abertura não chama a IA", async () => {
    respostaDaIa = { ok: true, json: { lixo: true } };
    const s = sessao({ conversasVisiveis: true, podeGravar: true });
    const primeira = await atualizarResumoDaConversa(s.cliente, { ...pedido, forcar: false, agora: AGORA });
    expect(primeira?.decisao).toBe("falhou");
    expect(chamadasDaIa).toBe(1);
    expect(tentativaDoResumo(s.tabelas.leads[0].resumo_conversa)).toBe(AGORA.toISOString());

    const depois = new Date(AGORA.getTime() + 60_000);
    const segunda = await atualizarResumoDaConversa(s.cliente, { ...pedido, forcar: false, agora: depois });
    expect(segunda?.decisao).toBe("espera");
    expect(chamadasDaIa).toBe(1);
  });

  it("sessão que a RLS não deixa gravar (0 linhas) não chama a IA", async () => {
    respostaDaIa = { ok: true, json: { quer: "x", proximoPasso: "y" } };
    const s = sessao({ conversasVisiveis: true, podeGravar: false });
    const estado = await atualizarResumoDaConversa(s.cliente, { ...pedido, forcar: false, agora: AGORA });
    expect(estado?.decisao).toBe("falhou");
    expect(chamadasDaIa).toBe(0);
  });

  it("decidirResumo: tentativa recente sem cache segura a chamada; vencida libera", () => {
    const base = { cache: null, ultimaMensagemEm: minutosAtras(1), totalDeFalas: 5, agora: AGORA, forcar: false, resumosHoje: 0, semCota: false };
    expect(decidirResumo({ ...base, ultimaTentativaEm: minutosAtras(2) })).toBe("espera");
    expect(decidirResumo({ ...base, ultimaTentativaEm: new Date(AGORA.getTime() - INTERVALO_AUTOMATICO_MS - 1).toISOString() })).toBe("gerar");
    expect(decidirResumo({ ...base, ultimaTentativaEm: null })).toBe("gerar");
  });

  it("o carimbo mantém o resumo anterior", () => {
    const anterior = { quer: "a", proximoPasso: "b" };
    expect(comTentativa(anterior, "2026-10-30T15:00:00.000Z")).toEqual({ ...anterior, tentativaEm: "2026-10-30T15:00:00.000Z" });
    expect(comTentativa(null, "2026-10-30T15:00:00.000Z")).toEqual({ tentativaEm: "2026-10-30T15:00:00.000Z" });
  });
});
