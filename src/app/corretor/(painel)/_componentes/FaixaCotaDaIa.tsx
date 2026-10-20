import Link from "next/link";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { lerCotaDaIa } from "@/lib/planos/usoDaIa";

/**
 * A faixa da cota de respostas da IA do grupo (fase 2B).
 *
 * - **Esgotada**: aparece para todos do grupo. O corretor precisa saber que
 *   a IA parou e que agora quem responde é ele — sem isso, o cliente fica
 *   esperando uma resposta que ninguém vai dar.
 * - **A partir de 80%**: só o gestor vê. Corretor não decide plano nem teto;
 *   aviso que ele não pode resolver vira paisagem.
 *
 * Devolve `null` no caminho feliz, que é quase sempre (mesma régua da
 * `FaixaConexao`). Classes escritas por extenso: montadas em tempo de
 * execução, o Tailwind não as gera.
 */
export async function FaixaCotaDaIa() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const ehGestor = corretor.papel === "gestor";

  const cota = await lerCotaDaIa(corretor.grupoId);
  if (cota.nivel === "sem_teto" || cota.nivel === "livre") return null;
  if (cota.nivel === "aviso" && !ehGestor) return null;

  const numero = new Intl.NumberFormat("pt-BR");
  const usadas = numero.format(cota.respostas);
  const teto = numero.format(cota.teto ?? 0);
  const esgotada = cota.nivel === "esgotada";

  const titulo = esgotada
    ? "As respostas da IA deste mês acabaram"
    : `A IA já usou ${cota.percentual}% das respostas deste mês`;
  const detalhe = esgotada
    ? `Foram ${usadas} de ${teto}. A IA parou de responder os clientes: responda você pelas conversas. Nenhuma mensagem se perdeu. A IA volta no dia 1º.${
        ehGestor ? " Para aumentar o limite, fale com o suporte da plataforma." : ""
      }`
    : `Foram ${usadas} de ${teto}. Quando acabar, a IA para de responder e a equipe atende pelas conversas até o dia 1º.`;

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 pt-4 md:px-8">
      <div
        role="status"
        className={`flex flex-col gap-3.5 rounded-2xl border p-4 ${
          esgotada ? "border-perigo-linha bg-perigo-lavado" : "border-alerta-linha bg-alerta-lavado"
        }`}
      >
        <div className="min-w-0">
          <p className="text-fluid-sm text-titulo font-semibold">{titulo}</p>
          <p className="text-fluid-xs text-corpo mt-1.5 leading-relaxed text-pretty">{detalhe}</p>
        </div>
        {esgotada && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/corretor/pessoas"
              className="botao-secundario text-fluid-sm text-titulo inline-flex min-h-11 items-center justify-center rounded-full px-5 font-medium"
            >
              Abrir as conversas
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
