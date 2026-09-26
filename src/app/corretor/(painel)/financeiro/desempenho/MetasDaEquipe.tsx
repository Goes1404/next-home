import { createClient } from "@/lib/supabase/server";
import { getVendas } from "@/lib/financeiro/dados";
import { repasseDoPeriodo } from "@/lib/financeiro/extrato";
import { linhasDeMeta } from "@/lib/financeiro/metasDaEquipe";
import { intervaloDo, mesAtual } from "@/lib/financeiro/periodo";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";

/**
 * Meta do mês de cada corretor contra o que já entrou (26/09/2026). Só o
 * gestor vê — a RLS de `metas_corretor` já o deixa ler a equipe inteira.
 * Quem não definiu meta aparece assim, sem barra: meta que o gestor
 * inventasse por ele não seria meta de ninguém.
 */
export async function MetasDaEquipe({ equipe }: { equipe: Array<{ id: string; nome: string }> }) {
  if (equipe.length === 0) return null;
  const hoje = hojeEmSaoPaulo();
  const { inicio, fim } = intervaloDo("mes", hoje);
  const supabase = await createClient();
  const [{ data: metas }, leitura] = await Promise.all([
    supabase.from("metas_corretor").select("corretor_id, meta_comissao").eq("mes", mesAtual(hoje)),
    getVendas({ inicio, fim }),
  ]);
  const vendas = leitura.ok ? leitura.vendas : [];
  const linhas = linhasDeMeta(
    equipe,
    new Map((metas ?? []).map((m) => [m.corretor_id, Number(m.meta_comissao)])),
    (id) => repasseDoPeriodo(id, vendas, inicio, fim),
  );

  return (
    <section className="space-y-2">
      <h2 className="text-fluid-base text-titulo font-medium">Metas do mês</h2>
      <ul className="space-y-2">
        {linhas.map((l) => (
          <li key={l.corretorId} className="cartao p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-fluid-sm text-titulo min-w-0 font-medium break-words">{l.nome}</span>
              <span className="text-fluid-xs text-apoio tabular-nums">
                {l.meta ? `${formatarReais(l.ganho)} de ${formatarReais(l.meta)}` : `${formatarReais(l.ganho)} · sem meta definida`}
              </span>
            </div>
            {l.progresso !== null && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-campo" aria-hidden>
                <div
                  className={`h-full rounded-full ${l.progresso >= 1 ? "bg-ok" : "bg-acento"}`}
                  style={{ width: `${Math.round(l.progresso * 100)}%` }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
