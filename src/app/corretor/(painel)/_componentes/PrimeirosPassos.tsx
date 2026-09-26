import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { carregarConfiguracao } from "@/lib/crm/configuracaoDoCorretor";
import { configuracaoCompleta, passosDoCorretor, progressoDaConfiguracao } from "@/lib/crm/primeirosPassos";

/**
 * O caminho até a plataforma trabalhar para o corretor (26/09/2026). Fica
 * no Início até tudo estar feito e então SOME — cartão que vive cheio de
 * verde vira paisagem. Cada passo diz por que importa e leva à tela certa.
 */
export async function PrimeirosPassos({ corretorId }: { corretorId: string }) {
  const supabase = await createClient();
  const estado = (await carregarConfiguracao(supabase, [corretorId])).get(corretorId);
  if (!estado || configuracaoCompleta(estado)) return null;

  const passos = passosDoCorretor(estado);
  const { feitos, total } = progressoDaConfiguracao(estado);

  return (
    <section className="cartao p-5 sm:p-6" aria-labelledby="titulo-primeiros-passos">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-primeiros-passos" className="text-fluid-base font-bold text-titulo">
          Deixe a plataforma trabalhando para você
        </h2>
        <span className="text-fluid-xs text-apoio tabular-nums">
          {feitos} de {total} feitos
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-campo" aria-hidden>
        <div className="h-full rounded-full bg-acento" style={{ width: `${(feitos / total) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-2">
        {passos.map((p) => (
          <li key={p.id}>
            {p.feito ? (
              <p className="flex min-h-11 items-center gap-3 text-fluid-sm text-apoio">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-ok-lavado text-ok">
                  ✓
                </span>
                <span className="line-through decoration-apoio/40">{p.titulo}</span>
              </p>
            ) : (
              <Link
                href={p.href}
                className="group flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-vidro-forte"
              >
                <span aria-hidden className="mt-0.5 size-6 shrink-0 rounded-full border-2 border-linha-forte" />
                <span className="min-w-0">
                  <span className="block text-fluid-sm font-semibold text-titulo group-hover:underline">{p.titulo}</span>
                  <span className="block text-fluid-xs text-apoio">{p.porque}</span>
                </span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
