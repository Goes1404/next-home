import { getCorretorLogado } from "@/lib/corretorSessao";
import { lerLimitesDoGrupo } from "@/lib/planos/usoDaIa";
import { UsoDosLimites } from "@/components/planos/UsoDosLimites";

/**
 * Quanto do plano a equipe já usou neste mês: artes, vídeos e mensagens de
 * lista, com barra (limites do plano). Só aparece quando há teto (a Next Home, a preço
 * de custo, não tem). Chamado só pela visão geral do gestor, que já passou por
 * `exigirGestorNaPagina`; o grupo é o dele.
 */
export async function UsoDoPlano() {
  const gestor = await getCorretorLogado();
  if (gestor?.papel !== "gestor") return null;
  const limites = await lerLimitesDoGrupo(gestor.grupoId);
  if (Object.values(limites).every((l) => l.nivel === "sem_teto")) return null;

  return (
    <section className="cartao flex flex-col gap-5 p-5" aria-labelledby="titulo-uso-do-plano">
      <div>
        <h2 id="titulo-uso-do-plano" className="text-fluid-sm text-titulo font-bold">
          Uso do plano neste mês
        </h2>
        <p className="text-fluid-xs text-apoio mt-1">Os números voltam a zero no dia 1º. Avisamos a partir de 80%.</p>
      </div>
      <UsoDosLimites limites={limites} />
    </section>
  );
}
