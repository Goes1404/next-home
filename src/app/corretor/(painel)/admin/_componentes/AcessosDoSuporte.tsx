import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Acessos do suporte da Astro" na visão geral do gestor (0243, 29/10/2026):
 * a transparência da visão de suporte da plataforma. Cada vez que alguém da
 * Astro abre a visão de suporte desta conta, a linha aparece aqui, com a data
 * e o motivo. Quem abriu aparece como "Equipe Astro" (o e-mail do
 * administrador não sai da plataforma).
 *
 * `acessos_de_suporte` só tem grant para a chave de serviço (0243): a leitura
 * é por ela, filtrando o grupo do GESTOR DA SESSÃO (`getCorretorLogado`,
 * antes da chave). Chamado só pela visão geral, que já passou por
 * `exigirGestorNaPagina`.
 */

const LIMITE = 10;
const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export type AcessoVisto = { id: string; criadoEm: string; motivo: string | null };

/** Os acessos do grupo do gestor da sessão, mais novos primeiro; `null` para quem não é gestor. */
export async function lerAcessosDoSuporte(): Promise<AcessoVisto[] | null> {
  const gestor = await getCorretorLogado();
  if (gestor?.papel !== "gestor") return null;
  const { data, error } = await createServiceClient()
    .from("acessos_de_suporte")
    .select("id, criado_em, motivo")
    .eq("grupo_alvo_id", gestor.grupoId)
    .order("criado_em", { ascending: false })
    .limit(LIMITE);
  if (error) {
    console.error(`[painel] acessos do suporte não lidos: ${error.message}`);
    return null;
  }
  return (data ?? []).map((a) => ({ id: a.id, criadoEm: a.criado_em, motivo: a.motivo }));
}

export async function AcessosDoSuporte() {
  const acessos = await lerAcessosDoSuporte();
  if (acessos === null) return null;
  return (
    <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-acessos-do-suporte">
      <div>
        <h2 id="titulo-acessos-do-suporte" className="text-fluid-base text-titulo font-bold">
          Acessos do suporte da Astro
        </h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Quando o suporte da Astro abre a visão de suporte da sua conta, fica registrado aqui. Ela mostra só números e
          configurações: nenhuma conversa, anotação nem dado dos seus clientes.
        </p>
      </div>
      {acessos.length === 0 ? (
        <p className="text-fluid-sm text-apoio">Nenhum acesso registrado.</p>
      ) : (
        <ul className="divide-linha divide-y">
          {acessos.map((a) => (
            <li key={a.id} className="text-fluid-sm flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <span className="text-titulo">
                Equipe Astro
                {a.motivo && <span className="text-apoio"> · {a.motivo}</span>}
              </span>
              <span className="text-fluid-xs text-apoio tabular-nums">{DATA_E_HORA.format(new Date(a.criadoEm))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
