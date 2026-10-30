/**
 * Banco falso em memória para os testes do número central. Entende só o que
 * `src/lib/central/` usa do supabase-js: select, eq, in, or (whatsapp.in /
 * whatsapp_lid.eq), is, lt, order, limit, maybeSingle, returns, insert,
 * update, upsert e delete. Não é para código de produção.
 */
export type Linha = Record<string, unknown>;

export function bancoFalso(tabelas: Record<string, Linha[]>) {
  const escritas: { tabela: string; operacao: string; valor: unknown; filtros: string[] }[] = [];

  function consulta(tabela: string) {
    const predicados: ((l: Linha) => boolean)[] = [];
    const filtros: string[] = [];
    let operacao: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let valor: unknown = null;
    let unico = false;
    let limite: number | null = null;
    let erroDeChave = false;

    const linhas = () => (tabelas[tabela] ??= []);
    const executar = () => {
      if (operacao === "insert" || operacao === "upsert") {
        const novas = (Array.isArray(valor) ? valor : [valor]) as Linha[];
        for (const n of novas) {
          const chave = Object.keys(n).find((k) => k === "mensagem_id" || k === "telefone" || k === "corretor_id");
          const existente = chave ? linhas().find((l) => l[chave] === n[chave] && (chave !== "corretor_id" || operacao === "upsert")) : undefined;
          if (existente && operacao === "insert" && chave === "mensagem_id") {
            erroDeChave = true;
            continue;
          }
          if (existente) Object.assign(existente, n);
          else linhas().push({ id: `id-${linhas().length + 1}`, ...n });
        }
        escritas.push({ tabela, operacao, valor, filtros });
        return erroDeChave
          ? { data: null, error: { code: "23505", message: "duplicate key" } }
          : { data: null, error: null };
      }
      const alvo = linhas().filter((l) => predicados.every((p) => p(l)));
      if (operacao === "update") {
        for (const l of alvo) Object.assign(l, valor as Linha);
        escritas.push({ tabela, operacao, valor, filtros });
        return { data: null, error: null };
      }
      if (operacao === "delete") {
        tabelas[tabela] = linhas().filter((l) => !alvo.includes(l));
        escritas.push({ tabela, operacao, valor, filtros });
        return { data: null, error: null };
      }
      const resultado = limite === null ? alvo : alvo.slice(0, limite);
      return { data: unico ? (resultado[0] ?? null) : resultado, error: null };
    };

    const q: Record<string, unknown> = {
      select: () => q,
      returns: () => q,
      order: () => q,
      limit: (n: number) => ((limite = n), q),
      eq: (c: string, v: unknown) => (filtros.push(`eq:${c}`), predicados.push((l) => l[c] === v), q),
      is: (c: string, v: unknown) => (filtros.push(`is:${c}`), predicados.push((l) => (l[c] ?? null) === v), q),
      lt: (c: string, v: string) => (filtros.push(`lt:${c}`), predicados.push((l) => String(l[c] ?? "") < v), q),
      in: (c: string, v: unknown[]) => (filtros.push(`in:${c}`), predicados.push((l) => v.includes(l[c])), q),
      or: (expr: string) => {
        filtros.push(`or:${expr}`);
        const partes = expr.match(/[a-z_]+\.(?:in\.\([^)]*\)|eq\.[^,]+)/g) ?? [];
        predicados.push((l) =>
          partes.some((p) => {
            const [coluna, op, ...resto] = p.split(".");
            const arg = resto.join(".");
            if (op === "in") return arg.replace(/[()]/g, "").split(",").includes(String(l[coluna]));
            return String(l[coluna]) === arg;
          }),
        );
        return q;
      },
      maybeSingle: () => ((unico = true), Promise.resolve(executar())),
      single: () => ((unico = true), Promise.resolve(executar())),
      insert: (v: unknown) => ((operacao = "insert"), (valor = v), q),
      upsert: (v: unknown) => ((operacao = "upsert"), (valor = v), q),
      update: (v: unknown) => ((operacao = "update"), (valor = v), q),
      delete: () => ((operacao = "delete"), q),
      then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, erro),
    };
    return q;
  }

  return { cliente: { from: consulta } as never, tabelas, escritas };
}
