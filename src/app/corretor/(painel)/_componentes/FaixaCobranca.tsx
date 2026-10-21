import { getCorretorLogado } from "@/lib/corretorSessao";
import { avisoDoPainel } from "@/lib/planos/cobranca";
import { lerCobrancaDoGrupo } from "@/lib/planos/cobrancaDoGrupo";

/**
 * A faixa da mensalidade do grupo (fase 2C).
 *
 * - **Pendente** (do dia do vencimento até o 5º dia de atraso): avisa quando
 *   venceu e quando os recursos pagos param.
 * - **Suspenso**: diz o que parou (IA, listas, artes e vídeos) e o que segue
 *   (site, painel e login). O cliente final nunca vê erro: a IA fica calada
 *   e a equipe atende pelas conversas.
 *
 * Aparece para TODOS do grupo: quem atende precisa saber por que a IA calou.
 * Devolve `null` com a cobrança em dia ou isenta, que é quase sempre (mesma
 * régua da `FaixaCotaDaIa`). Classes escritas por extenso: montadas em tempo
 * de execução, o Tailwind não as gera.
 */
export async function FaixaCobranca() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const aviso = avisoDoPainel(await lerCobrancaDoGrupo(corretor.grupoId));
  if (!aviso) return null;

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 pt-4 md:px-8">
      <div
        role="status"
        className={`rounded-2xl border p-4 ${aviso.suspenso ? "border-perigo-linha bg-perigo-lavado" : "border-alerta-linha bg-alerta-lavado"}`}
      >
        <p className="text-fluid-sm text-titulo font-semibold">{aviso.titulo}</p>
        <p className="text-fluid-xs text-corpo mt-1.5 leading-relaxed text-pretty">{aviso.detalhe}</p>
      </div>
    </div>
  );
}
