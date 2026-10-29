import { describe, expect, it } from "vitest";
import {
  ACOES_RAPIDAS,
  MAXIMO_DE_RECENTES,
  buscarNoPainel,
  consultasDeConversas,
  consultasDeLeads,
  filtrarAtalhos,
  lembrarBusca,
  lerRecentes,
  mesclarPorId,
  proximoIndice,
  recorteDaBusca,
  sanearTermo,
  type ClienteDaBusca,
} from "./buscaRapida";

/** Cliente que só grava as chamadas e devolve as linhas pedidas por tabela. */
function gravador(linhas: Record<string, unknown[]> = {}) {
  const consultas: { tabela: string; chamadas: [string, ...unknown[]][] }[] = [];
  const cliente: ClienteDaBusca = {
    from(tabela: string) {
      const registro = { tabela, chamadas: [] as [string, ...unknown[]][] };
      consultas.push(registro);
      const q: Record<string, unknown> = {};
      for (const m of ["eq", "ilike", "is", "not", "or", "order", "limit"]) {
        q[m] = (...args: unknown[]) => {
          registro.chamadas.push([m, ...args]);
          return q;
        };
      }
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas[tabela] ?? [], error: null }).then(ok);
      return {
        select: (colunas: string) => {
          registro.chamadas.push(["select", colunas]);
          return q as never;
        },
      };
    },
  };
  return { cliente, consultas };
}

const chamou = (c: { chamadas: [string, ...unknown[]][] }, metodo: string, ...args: unknown[]) =>
  c.chamadas.some(([m, ...a]) => m === metodo && JSON.stringify(a) === JSON.stringify(args));

describe("busca rápida: quem vê o quê", () => {
  it("corretor busca só nos leads dele; gestor no grupo (a RLS recorta o grupo)", () => {
    expect(recorteDaBusca({ id: "c1", papel: "corretor" })).toEqual({ tipo: "meus", corretorId: "c1" });
    expect(recorteDaBusca({ id: "g1", papel: "gestor" })).toEqual({ tipo: "grupo" });
    expect(recorteDaBusca(null)).toBeNull();
  });

  it("toda consulta de leads do corretor exige o corretor_id dele", () => {
    const { cliente, consultas } = gravador();
    consultasDeLeads(cliente, "ana 1199", { tipo: "meus", corretorId: "c1" }, "corretor_id.is.null");
    expect(consultas).toHaveLength(2); // nome e telefone
    for (const c of consultas) {
      expect(c.tabela).toBe("leads");
      expect(chamou(c, "eq", "corretor_id", "c1")).toBe(true);
      // O filtro das contas ocultas é da visão da equipe, não da carteira dele.
      expect(c.chamadas.some(([m]) => m === "or")).toBe(false);
      expect(chamou(c, "is", "arquivado_em", null)).toBe(true);
    }
  });

  it("o gestor busca no grupo sem corretor_id, mas sem as contas ocultas", () => {
    const { cliente, consultas } = gravador();
    consultasDeLeads(cliente, "ana", { tipo: "grupo" }, "corretor_id.is.null,corretor_id.not.in.(x)");
    expect(consultas).toHaveLength(1); // sem dígitos: só o nome
    expect(consultas[0].chamadas.some(([m, col]) => m === "eq" && col === "corretor_id")).toBe(false);
    expect(chamou(consultas[0], "or", "corretor_id.is.null,corretor_id.not.in.(x)")).toBe(true);
  });

  it("conversas são sempre a caixa pessoal, também para o gestor", async () => {
    const { cliente, consultas } = gravador();
    await buscarNoPainel(cliente, { termo: "ana", recorte: { tipo: "grupo" }, corretorId: "g1", foraDasOcultas: null });
    const deConversa = consultas.filter((c) => c.tabela === "whatsapp_conversas");
    expect(deConversa.length).toBeGreaterThan(0);
    for (const c of deConversa) expect(chamou(c, "eq", "corretor_id", "g1")).toBe(true);
    // Nenhuma tabela de mensagem é consultada pela busca.
    expect(consultas.some((c) => /mensage/.test(c.tabela))).toBe(false);
  });

  it("telefone casa pelos dígitos, e o termo não leva sintaxe do PostgREST", () => {
    const { cliente, consultas } = gravador();
    consultasDeConversas(cliente, sanearTermo("(11) 99999-0000"), "c1");
    expect(chamou(consultas[1], "ilike", "telefone_cliente", "%11999990000%")).toBe(true);
    expect(sanearTermo("ana,corretor_id.eq.x")).toBe("ana corretor id.eq.x");
    expect(sanearTermo("50%_*")).toBe("50");
  });

  it("monta os resultados com link e sem repetir quem casou por nome e por telefone", async () => {
    const lead = { id: "l1", nome: "Ana 11", telefone: "5511", etapa: "novo" };
    const { cliente } = gravador({
      leads: [lead],
      whatsapp_conversas: [{ id: "w1", nome_cliente: null, telefone_cliente: "5511" }],
      empreendimentos: [{ id: "e1", nome: "Solar", slug: "solar", bairro: "Centro", cidade: null }, { id: "e2", nome: "Sem slug", slug: null }],
    });
    const r = await buscarNoPainel(cliente, { termo: "ana 551", recorte: { tipo: "meus", corretorId: "c1" }, corretorId: "c1", foraDasOcultas: null });
    expect(r.leads).toEqual([{ tipo: "lead", id: "l1", titulo: "Ana 11", detalhe: "5511 · Leads", href: "/corretor/leads/l1" }]);
    expect(r.conversas[0]).toMatchObject({ titulo: "5511", href: "/corretor/conversas?c=w1" });
    expect(r.imoveis).toEqual([{ tipo: "imovel", id: "e1", titulo: "Solar", detalhe: "Centro", href: "/corretor/imoveis/solar" }]);
  });

  it("termo curto não vai ao banco", async () => {
    const { cliente, consultas } = gravador();
    await buscarNoPainel(cliente, { termo: " a ", recorte: { tipo: "meus", corretorId: "c1" }, corretorId: "c1", foraDasOcultas: null });
    expect(consultas).toEqual([]);
  });
});

describe("busca rápida: telas, recentes e teclado", () => {
  it("filtra telas e ações sem acento e por palavra-chave", () => {
    const atalhos = [...ACOES_RAPIDAS, { tipo: "pagina" as const, href: "/corretor/agenda", titulo: "Agenda" }];
    expect(filtrarAtalhos(atalhos, "importar")[0].href).toBe("/corretor/importar");
    expect(filtrarAtalhos(atalhos, "VISITA").map((a) => a.titulo)).toContain("Nova visita");
    expect(filtrarAtalhos(atalhos, "planilha")[0].titulo).toBe("Importar leads");
    // Campo vazio: as ações, para começar.
    expect(filtrarAtalhos(atalhos, "").every((a) => a.tipo === "acao")).toBe(true);
  });

  it("recentes: no topo, sem repetir, com teto, e lixo guardado vira lista vazia", () => {
    let r: string[] = [];
    for (const t of ["Ana", "Bruno", "ana", "x", "Carla", "Davi", "Eva", "Fabio", "Gil"]) r = lembrarBusca(r, t);
    expect(r[0]).toBe("Gil");
    expect(r).toHaveLength(MAXIMO_DE_RECENTES);
    // "Ana" e "ana" são a mesma busca (fica a grafia mais nova); "Bruno" saiu pelo teto; "x" é curto demais.
    expect(r).toEqual(["Gil", "Fabio", "Eva", "Davi", "Carla", "ana"]);
    expect(lerRecentes("{quebrado")).toEqual([]);
    expect(lerRecentes(JSON.stringify(["a1", 3, "", "b2"]))).toEqual(["a1", "b2"]);
    expect(lerRecentes(null)).toEqual([]);
  });

  it("setas dão a volta nas pontas", () => {
    expect(proximoIndice(-1, 3, 1)).toBe(0);
    expect(proximoIndice(2, 3, 1)).toBe(0);
    expect(proximoIndice(0, 3, -1)).toBe(2);
    expect(proximoIndice(0, 0, 1)).toBe(-1);
  });

  it("mescla por id respeitando o teto", () => {
    expect(mesclarPorId([[{ id: "a" }, { id: "b" }], [{ id: "a" }, { id: "c" }]], 2)).toEqual([{ id: "a" }, { id: "b" }]);
  });
});
