import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { carregarConfiguracao } from "@/lib/crm/configuracaoDoCorretor";
import { passosDoCorretor, progressoDaConfiguracao } from "@/lib/crm/primeirosPassos";
import { acessoParado, ultimoAcessoLegivel } from "@/lib/admin/prontidao";

/**
 * Quem da equipe está pronto para receber lead (26/09/2026). Chamado só
 * pela visão geral do gestor, que já passou por `exigirGestorNaPagina`: é
 * isso que autoriza a chave de serviço aqui (a agenda e o último login de
 * um colega não são legíveis pela sessão do gestor).
 *
 * A roleta prefere quem tem WhatsApp no ar; corretor sem ele recebe lead
 * que ninguém atende. Esta lista mostra exatamente onde cada um parou.
 */
export async function ProntidaoDaEquipe() {
  const supabase = createServiceClient();
  const { data: equipe } = await supabase
    .from("corretores")
    .select("id, nome, user_id")
    .eq("ativo", true)
    .order("nome", { ascending: true });
  if (!equipe || equipe.length === 0) return null;

  const estados = await carregarConfiguracao(
    supabase,
    equipe.map((c) => c.id),
  );
  const logins = new Map<string, string | null>();
  await Promise.all(
    equipe
      .filter((c) => c.user_id)
      .map(async (c) => {
        const { data } = await supabase.auth.admin.getUserById(c.user_id!);
        logins.set(c.id, data.user?.last_sign_in_at ?? null);
      }),
  );

  return (
    <section className="cartao mt-6 p-5" aria-labelledby="titulo-prontidao">
      <h2 id="titulo-prontidao" className="text-fluid-base font-bold text-titulo">
        Equipe pronta para atender
      </h2>
      <p className="text-fluid-xs text-apoio">
        O que falta em cada corretor para a plataforma trabalhar por ele. Corretor sem WhatsApp conectado não
        recebe atendimento da assistente.
      </p>
      <ul className="mt-4 divide-y divide-linha">
        {equipe.map((c) => {
          const estado = estados.get(c.id);
          const faltam = estado ? passosDoCorretor(estado).filter((p) => !p.feito) : [];
          const progresso = estado ? progressoDaConfiguracao(estado) : { feitos: 0, total: 4 };
          const ultimo = logins.get(c.id) ?? null;
          return (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <Link
                  href={`/corretor/leads?corretor=${c.id}`}
                  className="text-fluid-sm font-semibold text-titulo underline decoration-transparent underline-offset-2 hover:decoration-current break-words"
                >
                  {c.nome}
                </Link>
                <p className="text-fluid-xs text-apoio">
                  {faltam.length === 0 ? "Tudo configurado" : `Falta: ${faltam.map((p) => p.titulo.toLowerCase()).join(" · ")}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-fluid-xs font-semibold text-corpo tabular-nums">
                  {progresso.feitos}/{progresso.total}
                </p>
                <p className={`text-fluid-xs ${acessoParado(ultimo) ? "text-alerta" : "text-apoio"}`}>
                  {ultimoAcessoLegivel(ultimo, Boolean(c.user_id))}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-fluid-xs text-apoio">
        Sem acesso criado?{" "}
        <Link href="/corretor/admin/contas" className="underline underline-offset-2">
          Crie em Contas
        </Link>
        .
      </p>
    </section>
  );
}
