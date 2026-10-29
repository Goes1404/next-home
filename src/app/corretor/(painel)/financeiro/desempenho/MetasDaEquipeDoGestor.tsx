import { lerMetasDoMes } from "@/lib/financeiro/metasDaEquipeDados";
import { mesAtual, nomeDoMes } from "@/lib/financeiro/periodo";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { DefinirMetasDaEquipe } from "./DefinirMetasDaEquipe";

/**
 * As metas do mês da equipe (0246) para o gestor definir: lê as do mês atual
 * e do seguinte e entrega ao formulário. Sem a 0246 no banco, some.
 */
export async function MetasDaEquipeDoGestor({
  grupoId,
  equipe,
}: {
  grupoId: string;
  equipe: { id: string; nome: string }[];
}) {
  if (equipe.length === 0) return null;
  const atual = mesAtual(hojeEmSaoPaulo());
  const [a, m] = atual.split("-").map(Number);
  const seguinte = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  const [doAtual, doSeguinte] = await Promise.all([lerMetasDoMes(grupoId, atual), lerMetasDoMes(grupoId, seguinte)]);
  if (!doAtual || !doSeguinte) return null;

  return (
    <DefinirMetasDaEquipe
      equipe={equipe}
      meses={[
        { chave: atual, rotulo: nomeDoMes(atual), metas: Object.fromEntries(doAtual) },
        { chave: seguinte, rotulo: nomeDoMes(seguinte), metas: Object.fromEntries(doSeguinte) },
      ]}
    />
  );
}
