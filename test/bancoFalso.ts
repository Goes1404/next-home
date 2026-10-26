/**
 * Um banco falso em memória que APLICA os filtros do PostgREST e registra
 * cada consulta, para os testes de isolamento por grupo que rodam sem
 * Docker. A linha de outro grupo só some se o código filtrar por ele: é isso
 * que distingue "recortou" de "deu sorte".
 *
 * Cobre o subconjunto que os módulos testados usam; filtro desconhecido
 * lança, para o teste não passar porque o filtro foi ignorado.
 */

export type Linha = Record<string, unknown>;
export type Consulta = { tabela: string; operacao: string; filtros: string[]; valores?: unknown; opcoes?: unknown };

export type BancoFalso = {
  tabelas: Record<string, Linha[]>;
  consultas: Consulta[];
  cliente: { from: (tabela: string) => ReturnType<typeof construtor>; auth: unknown; storage: unknown; rpc: unknown };
};

function valorDe(linha: Linha, coluna: string): unknown {
  const [col, chave] = coluna.split("->>");
  if (chave === undefined) return linha[col];
  const objeto = linha[col] as Record<string, unknown> | null | undefined;
  const v = objeto?.[chave];
  return v === undefined || v === null ? null : String(v);
}

const literalNaRegex = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function padraoDoLike(padrao: string): RegExp {
  // O PostgREST troca TODO `*` por `%` antes de chegar ao Postgres, inclusive
  // um `*` escapado (`\*` vira `\%`, um `%` literal).
  const p = padrao.replaceAll("*", "%");
  let fonte = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\" && i + 1 < p.length) fonte += literalNaRegex(p[++i]);
    else if (c === "%") fonte += ".*";
    else if (c === "_") fonte += ".";
    else fonte += literalNaRegex(c);
  }
  return new RegExp(`^${fonte}$`, "is");
}

function construtor(banco: { tabelas: Record<string, Linha[]>; consultas: Consulta[] }, tabela: string) {
  const registro: Consulta = { tabela, operacao: "select", filtros: [] };
  const predicados: ((l: Linha) => boolean)[] = [];
  let modo: "lista" | "um" | "contagem" = "lista";
  let comContagem = false;
  let limite = Infinity;

  const executar = () => {
    banco.consultas.push(registro);
    const linhas = (banco.tabelas[tabela] ?? []).filter((l) => predicados.every((p) => p(l)));
    if (registro.operacao === "insert") {
      const novas = ([] as Linha[]).concat(registro.valores as Linha).map((l, i) => ({
        id: `${tabela}-novo-${(banco.tabelas[tabela]?.length ?? 0) + i}`,
        ...l,
      }));
      banco.tabelas[tabela] = [...(banco.tabelas[tabela] ?? []), ...novas];
      return { data: modo === "um" ? novas[0] : novas, error: null };
    }
    if (registro.operacao === "upsert") {
      // Como o PostgREST: conflito pelas colunas de `onConflict`; com
      // `ignoreDuplicates` a linha que já existe fica como está e não volta.
      const { onConflict, ignoreDuplicates } = (registro.opcoes ?? {}) as { onConflict?: string; ignoreDuplicates?: boolean };
      const chaves = (onConflict ?? "id").split(",").map((c) => c.trim());
      const atuais = (banco.tabelas[tabela] ??= []);
      const gravadas: Linha[] = [];
      for (const valor of ([] as Linha[]).concat(registro.valores as Linha)) {
        const existente = atuais.find((l) => chaves.every((c) => l[c] === valor[c]));
        if (existente) {
          if (ignoreDuplicates) continue;
          Object.assign(existente, valor);
          gravadas.push(existente);
        } else {
          const nova = { id: `${tabela}-novo-${atuais.length}`, ...valor };
          atuais.push(nova);
          gravadas.push(nova);
        }
      }
      return { data: modo === "um" ? (gravadas[0] ?? null) : gravadas, error: null };
    }
    if (registro.operacao === "update") {
      for (const l of linhas) Object.assign(l, registro.valores as Linha);
      return { data: linhas, error: null };
    }
    if (registro.operacao === "delete") {
      banco.tabelas[tabela] = (banco.tabelas[tabela] ?? []).filter((l) => !linhas.includes(l));
      return { data: linhas, error: null };
    }
    const fatia = linhas.slice(0, limite);
    if (modo === "contagem") return { data: null, count: fatia.length, error: null };
    if (modo === "um") return { data: fatia[0] ?? null, error: null };
    return { data: fatia, count: comContagem ? fatia.length : null, error: null };
  };

  const filtro = (nome: string, col: string, teste: (v: unknown) => boolean) => {
    registro.filtros.push(`${nome}:${col}`);
    predicados.push((l) => teste(valorDe(l, col)));
    return q;
  };

  const q = {
    select: (_colunas?: string, opcoes?: { head?: boolean; count?: string }) => {
      if (opcoes?.head) modo = "contagem";
      if (opcoes?.count) comContagem = true;
      return q;
    },
    insert: (valores: unknown) => {
      registro.operacao = "insert";
      registro.valores = valores;
      return q;
    },
    upsert: (valores: unknown, opcoes?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      registro.operacao = "upsert";
      registro.valores = valores;
      registro.opcoes = opcoes;
      return q;
    },
    update: (valores: unknown) => {
      registro.operacao = "update";
      registro.valores = valores;
      return q;
    },
    delete: () => {
      registro.operacao = "delete";
      return q;
    },
    eq: (col: string, v: unknown) => filtro("eq", col, (x) => x === v),
    neq: (col: string, v: unknown) => filtro("neq", col, (x) => x !== v),
    in: (col: string, vs: unknown[]) => filtro("in", col, (x) => vs.includes(x)),
    is: (col: string, v: unknown) => filtro("is", col, (x) => (x ?? null) === v),
    not: (col: string, _op: string, v: unknown) => filtro("not", col, (x) => (x ?? null) !== v),
    // Como o PostgREST + Postgres: `*` vira `%`; `%` e `_` são curingas; a
    // barra invertida escapa o caractere seguinte; sem diferença de maiúsculas.
    ilike: (col: string, padrao: string) => {
      const regex = padraoDoLike(padrao);
      return filtro("ilike", col, (x) => typeof x === "string" && regex.test(x));
    },
    gte: (col: string, v: string) => filtro("gte", col, (x) => String(x ?? "") >= v),
    gt: (col: string, v: string) => filtro("gt", col, (x) => String(x ?? "") > v),
    lte: (col: string, v: string) => filtro("lte", col, (x) => String(x ?? "") <= v),
    lt: (col: string, v: string) => filtro("lt", col, (x) => String(x ?? "") < v),
    filter: (col: string, op: string, v: string) => {
      if (op !== "in") throw new Error(`bancoFalso: filter(${op}) não implementado`);
      const lista = v.replace(/[()]/g, "").split(",");
      return filtro("filter", col, (x) => lista.includes(String(x)));
    },
    // `or` com a sintaxe do PostgREST não é interpretado: só registrado. Os
    // testes que dependem dele não podem usar este banco.
    or: (expressao: string) => {
      registro.filtros.push(`or:${expressao}`);
      return q;
    },
    order: () => q,
    range: () => q,
    limit: (n: number) => {
      limite = n;
      return q;
    },
    maybeSingle: () => {
      modo = "um";
      return Promise.resolve(executar());
    },
    single: () => {
      modo = "um";
      return Promise.resolve(executar());
    },
    then: <T,>(resolver: (r: ReturnType<typeof executar>) => T, rejeitar?: (e: unknown) => T) =>
      Promise.resolve(executar()).then(resolver, rejeitar),
  };
  return q;
}

export function bancoFalso(tabelas: Record<string, Linha[]> = {}): BancoFalso {
  const banco = { tabelas: structuredClone(tabelas), consultas: [] as Consulta[] };
  return {
    tabelas: banco.tabelas,
    consultas: banco.consultas,
    cliente: {
      from: (tabela: string) => construtor(banco, tabela),
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: null }, error: null }),
        },
      },
      storage: {},
      rpc: async () => ({ data: null, error: null }),
    },
  };
}

/** As leituras de uma tabela que NÃO filtraram pelo grupo. */
export function leiturasSemGrupo(banco: BancoFalso, tabela: string): Consulta[] {
  return banco.consultas.filter(
    (c) => c.tabela === tabela && c.operacao === "select" && !c.filtros.includes("eq:grupo_id") && !c.filtros.includes("in:grupo_id"),
  );
}
