import { describe, expect, it } from "vitest";
import { FALAS_POR_LEAD, NOTAS_POR_TIQUE, recalcularNotas } from "./notaDoLeadServidor";

/*
 * A nota do lead gravada (0248), revisão de 30/10/2026:
 *
 * - as falas eram UMA consulta com `.limit(40 * leads)`; o PostgREST corta
 *   em `max_rows` = 1.000, e o lead além do corte saía "frio — sumiu";
 * - um erro de gravação parava a varredura inteira (`break`);
 * - a sessão do painel pode só calcular (`gravar: false`).
 */

const MAX_ROWS = 1000;
type Linha = Record<string, unknown>;

/** Banco falso com o corte do PostgREST e o registro das consultas. */
function banco(tabelas: Record<string, Linha[]>, falhaNaGravacao: (id: string, valores: Linha) => { message: string; code?: string } | null = () => null) {
  const consultas: { tabela: string; limite: number; operacao: string; valores?: Linha; id?: unknown }[] = [];
  const cliente = {
    from(tabela: string) {
      const filtros: ((l: Linha) => boolean)[] = [];
      let limite = Infinity;
      let desc = false;
      let operacao = "select";
      let valores: Linha | undefined;
      let idAlvo: unknown;
      const executar = () => {
        consultas.push({ tabela, limite, operacao, valores, id: idAlvo });
        if (operacao === "update") {
          const erro = falhaNaGravacao(String(idAlvo), valores!);
          if (erro) return { data: null, error: erro };
          for (const l of (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))) Object.assign(l, valores);
          return { data: null, error: null };
        }
        let linhas = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
        linhas = [...linhas].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
        if (desc) linhas.reverse();
        return { data: linhas.slice(0, Math.min(limite, MAX_ROWS)), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        update: (v: Linha) => {
          operacao = "update";
          valores = v;
          return q;
        },
        eq: (c: string, v: unknown) => {
          if (c === "id") idAlvo = v;
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
        then: (ok: (r: unknown) => void, falha?: (e: unknown) => void) => Promise.resolve(executar()).then(ok, falha),
      };
      return q;
    },
  };
  return { cliente: cliente as never, consultas, tabelas };
}

const AGORA = new Date("2026-10-30T15:00:00.000Z");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();

/** 30 leads, cada um com a sua conversa; os 29 primeiros falaram MUITO hoje. */
function cenario() {
  const leads: Linha[] = [];
  const conversas: Linha[] = [];
  const mensagens: Linha[] = [];
  for (let i = 0; i < NOTAS_POR_TIQUE; i++) {
    leads.push({ id: `L${i}`, grupo_id: "g1", etapa: "em_conversa", tentativas_sem_resposta: 0 });
    conversas.push({ id: `C${i}`, lead_id: `L${i}` });
  }
  for (let i = 0; i < NOTAS_POR_TIQUE - 1; i++) {
    for (let k = 0; k < 40; k++) {
      mensagens.push({ conversa_id: `C${i}`, remetente: "cliente", conteudo: "oi", created_at: horasAtras(1 + k / 100) });
    }
  }
  // O último falou ontem: na consulta única, ficava além do corte de 1.000.
  const ultimo = `L${NOTAS_POR_TIQUE - 1}`;
  for (let k = 0; k < 5; k++) {
    mensagens.push({ conversa_id: `C${NOTAS_POR_TIQUE - 1}`, remetente: "cliente", conteudo: "quero visitar", created_at: horasAtras(20 + k) });
  }
  return { tabelas: { leads, whatsapp_conversas: conversas, whatsapp_mensagens: mensagens, lead_observacoes_ia: [], grupos: [{ id: "g1", ramo: null }] }, ultimo };
}

describe("recalcularNotas com mais de 1.000 falas", () => {
  it("o lead além do corte do PostgREST recebe as próprias falas (não sai 'sumiu')", async () => {
    const { tabelas, ultimo } = cenario();
    expect(tabelas.whatsapp_mensagens.length).toBeGreaterThan(MAX_ROWS);
    const b = banco(tabelas);
    const todas = await recalcularNotas(b.cliente, tabelas.leads.map((l) => String(l.id)), AGORA, { gravar: false });

    // A mesma nota que ele teria sozinho (sem disputar a cota com ninguém).
    const sozinho = await recalcularNotas(banco(cenario().tabelas).cliente, [ultimo], AGORA, { gravar: false });
    expect(todas.get(ultimo)).toEqual(sozinho.get(ultimo));
    expect(todas.get(ultimo)!.motivo).not.toMatch(/sumiu/i);

    // Uma consulta de falas por lead, cada uma com o teto exato.
    const falas = b.consultas.filter((c) => c.tabela === "whatsapp_mensagens");
    expect(falas).toHaveLength(NOTAS_POR_TIQUE);
    expect(falas.every((c) => c.limite === FALAS_POR_LEAD)).toBe(true);
  });
});

describe("recalcularNotas grava lead a lead", () => {
  it("um lead que falha não para os outros, e ganha o carimbo mesmo assim", async () => {
    const { tabelas } = cenario();
    const b = banco(tabelas, (id, valores) =>
      id === "L3" && "nota_score" in valores ? { message: "violates check constraint", code: "23514" } : null,
    );
    await recalcularNotas(b.cliente, ["L1", "L3", "L5"], AGORA);
    const gravacoes = b.consultas.filter((c) => c.operacao === "update");
    expect(gravacoes.map((c) => c.id)).toEqual(["L1", "L3", "L3", "L5"]);
    const lead3 = tabelas.leads.find((l) => l.id === "L3")!;
    expect(lead3.nota_calculada_em).toBe(AGORA.toISOString());
    expect(lead3.nota_score).toBeUndefined();
    expect(tabelas.leads.find((l) => l.id === "L5")!.nota_score).toEqual(expect.any(Number));
  });

  it("antes da 0248 (42703) não insiste lead a lead", async () => {
    const { tabelas } = cenario();
    const b = banco(tabelas, () => ({ message: "column does not exist", code: "42703" }));
    await recalcularNotas(b.cliente, ["L1", "L3", "L5"], AGORA);
    expect(b.consultas.filter((c) => c.operacao === "update")).toHaveLength(1);
  });

  it("`gravar: false` só calcula", async () => {
    const { tabelas } = cenario();
    const b = banco(tabelas);
    const notas = await recalcularNotas(b.cliente, ["L1"], AGORA, { gravar: false });
    expect(notas.get("L1")).toBeTruthy();
    expect(b.consultas.some((c) => c.operacao === "update")).toBe(false);
  });

  it("a varredura do tique é menor (30)", () => {
    expect(NOTAS_POR_TIQUE).toBe(30);
  });
});
