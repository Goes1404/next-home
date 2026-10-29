/**
 * Um Supabase de mentira para os testes das notificações (29/10/2026).
 *
 * Grava cada consulta (tabela, ação, valores e filtros, na ordem) e devolve
 * o que o `responder` do teste mandar. Cobre só o pedaço do construtor que
 * as notificações usam: o suficiente para conferir QUEM recebe e COMO o
 * claim é feito, sem banco.
 */

export type Consulta = {
  tabela: string;
  acao: "select" | "update" | "insert" | "delete" | "rpc";
  valores?: unknown;
  colunas?: string;
  filtros: [string, ...unknown[]][];
};

export type Resposta = { data: unknown; error: { message: string } | null };

export function filtro(c: Consulta, nome: string): unknown[] | undefined {
  return c.filtros.find((f) => f[0] === nome)?.slice(1);
}

export function supabaseFalso(
  responder: (c: Consulta) => Resposta,
  extra: { listUsers?: (p: { page: number; perPage: number }) => Promise<unknown> } = {},
) {
  const consultas: Consulta[] = [];

  function construtor(tabela: string) {
    const c: Consulta = { tabela, acao: "select", filtros: [] };
    const resolver = (unico: boolean): Promise<Resposta> => {
      consultas.push(c);
      const r = responder(c);
      if (!unico) return Promise.resolve(r);
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    };
    const filtroQue = (nome: string) => (...args: unknown[]) => {
      c.filtros.push([nome, ...args]);
      return b;
    };
    const b: Record<string, unknown> = {
      select: (colunas?: string) => {
        if (c.acao === "select") c.colunas = colunas;
        return b;
      },
      update: (v: unknown) => ((c.acao = "update"), (c.valores = v), b),
      insert: (v: unknown) => ((c.acao = "insert"), (c.valores = v), b),
      delete: () => ((c.acao = "delete"), b),
      eq: filtroQue("eq"),
      neq: filtroQue("neq"),
      is: filtroQue("is"),
      gt: filtroQue("gt"),
      gte: filtroQue("gte"),
      lt: filtroQue("lt"),
      lte: filtroQue("lte"),
      in: filtroQue("in"),
      or: filtroQue("or"),
      not: filtroQue("not"),
      order: filtroQue("order"),
      limit: filtroQue("limit"),
      maybeSingle: () => resolver(true),
      single: () => resolver(true),
      then: (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) => resolver(false).then(ok, falha),
    };
    return b;
  }

  const cliente = {
    from: construtor,
    rpc: async (nome: string, args: unknown) => {
      const c: Consulta = { tabela: `rpc:${nome}`, acao: "rpc", valores: args, filtros: [] };
      consultas.push(c);
      return responder(c);
    },
    auth: {
      admin: {
        listUsers: async (p: { page: number; perPage: number }) =>
          extra.listUsers ? extra.listUsers(p) : { data: { users: [] }, error: null },
      },
    },
  };

  return { cliente: cliente as never, consultas };
}
