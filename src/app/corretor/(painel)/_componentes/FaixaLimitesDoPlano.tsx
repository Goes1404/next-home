import { getCorretorLogado } from "@/lib/corretorSessao";
import { lerLimitesDoGrupo } from "@/lib/planos/usoDaIa";
import { RECURSOS, ROTULO_DO_RECURSO, type Recurso } from "@/lib/planos/limitesDoPlano";

/**
 * A faixa dos limites de artes, vídeos e mensagens de lista do plano (limites do plano),
 * irmã da `FaixaCotaDaIa`.
 *
 * - **Acabou**: aparece para todos do grupo. Quem tenta criar precisa saber
 *   por que o botão recusa, e que volta no dia 1º.
 * - **A partir de 80%**: só o gestor vê. Corretor não decide plano nem teto.
 *
 * Devolve `null` no caminho feliz, que é quase sempre (e para a Next Home, que
 * não tem teto). O detalhe com barra mora na Visão geral do gestor. Classes
 * por extenso: montadas em tempo de execução, o Tailwind não as gera.
 */
export async function FaixaLimitesDoPlano() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const ehGestor = corretor.papel === "gestor";

  const limites = await lerLimitesDoGrupo(corretor.grupoId);
  const esgotados = RECURSOS.filter((r) => limites[r].nivel === "esgotada");
  const perto = ehGestor ? RECURSOS.filter((r) => limites[r].nivel === "aviso") : [];
  if (esgotados.length === 0 && perto.length === 0) return null;

  const nomes = (rs: readonly Recurso[]) => rs.map((r) => ROTULO_DO_RECURSO[r].toLowerCase()).join(", ");
  const acabou = esgotados.length > 0;
  const titulo = acabou
    ? `O limite do mês acabou: ${nomes(esgotados)}`
    : `Perto do limite do mês: ${nomes(perto)}`;
  const detalhe = acabou
    ? `Voltam no dia 1º.${ehGestor ? " Para aumentar o limite, fale com o suporte da plataforma." : " Peça ao gestor se precisar de mais."}`
    : "Passou de 80% do que o plano inclui. Veja o uso na Visão geral.";

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 pt-4 md:px-8">
      <div
        role="status"
        className={`flex flex-col gap-1.5 rounded-2xl border p-4 ${
          acabou ? "border-perigo-linha bg-perigo-lavado" : "border-alerta-linha bg-alerta-lavado"
        }`}
      >
        <p className="text-fluid-sm text-titulo font-semibold">{titulo}</p>
        <p className="text-fluid-xs text-corpo leading-relaxed text-pretty">{detalhe}</p>
      </div>
    </div>
  );
}
