import Link from "next/link";
import { carregarAvisoDaConexao } from "@/lib/whatsapp/avisoDeQueda";
import type { GravidadeAviso } from "@/lib/whatsapp/saudeDaConexao";

/**
 * A faixa que diz que o número saiu do ar.
 *
 * Fica no layout do painel, acima de tudo, porque enquanto ela existe nada
 * mais no painel está acontecendo de verdade: sem número no ar não há
 * conversa, dossiê, follow-up nem lembrete de visita. Em 28/08/2026 o
 * número ficou TRÊS DIAS fora sem que nada avisasse (roadmap, H0.0).
 *
 * ## Por que ela não aparece quase nunca
 *
 * `carregarAvisoDaConexao` devolve `null` no caminho feliz, e aí não se
 * desenha nada. Aviso que aparece o tempo todo deixa de ser lido — é a
 * mesma lição que reescreveu a régua do `evolucaoConversa`, onde uma nota
 * chegava a quase toda mensagem e ninguém abria mais.
 *
 * ## Uma cor por gravidade
 *
 * Perigo = parou e só o corretor resolve. Alerta = o sistema se protegeu e
 * volta sozinho. Info = está funcionando, só não agora. Duas gravidades com
 * a mesma cor não são distinguíveis de relance, que é a única razão de
 * existir cor de status (a lição da régua de etapas do funil).
 *
 * As classes são escritas por extenso de propósito: o Tailwind lê o código
 * como texto, e `bg-${x}-lavado` montado em tempo de execução não gera
 * classe nenhuma — o aviso sairia sem cor exatamente no dia em que importa.
 */

const ESTILO: Record<GravidadeAviso, { caixa: string; icone: string; botao: string }> = {
  perigo: {
    caixa: "border-perigo-linha bg-perigo-lavado",
    icone: "text-perigo",
    botao: "bg-perigo text-fundo hover:opacity-90",
  },
  alerta: {
    caixa: "border-alerta-linha bg-alerta-lavado",
    icone: "text-alerta",
    botao: "bg-alerta text-fundo hover:opacity-90",
  },
  info: {
    caixa: "border-info-linha bg-info-lavado",
    icone: "text-info",
    botao: "bg-info text-fundo hover:opacity-90",
  },
};

/** Triângulo de atenção (mesmo traço do lucide usado no resto do painel). */
function IconeAtencao({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export async function FaixaConexao({ corretorId }: { corretorId: string }) {
  const aviso = await carregarAvisoDaConexao(corretorId);
  if (!aviso) return null;

  const estilo = ESTILO[aviso.gravidade];

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 pt-4 md:px-8">
      <div
        // `role="status"` e não `alert`: leitor de tela deve anunciar sem
        // interromper o que a pessoa estiver fazendo.
        role="status"
        className={`flex flex-col gap-3.5 rounded-2xl border p-4 ${estilo.caixa}`}
      >
        <div className="flex items-start gap-2.5">
          <IconeAtencao className={`mt-0.5 h-4 w-4 shrink-0 ${estilo.icone}`} />
          <div className="min-w-0">
            <p className="text-fluid-sm text-titulo font-semibold">{aviso.titulo}</p>
            <p className="text-fluid-xs text-corpo mt-1.5 leading-relaxed text-pretty">
              {aviso.detalhe}
            </p>
          </div>
        </div>

        {aviso.acao && (
          <div className="flex flex-wrap gap-2">
            {/* Altura mínima de 44px: é o alvo de toque do celular, que é
                onde o corretor trabalha. */}
            <Link
              href="/corretor/whatsapp"
              className={`text-fluid-sm inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold transition-opacity ${estilo.botao}`}
            >
              {aviso.acao}
            </Link>
            <Link
              href="/corretor/campanhas"
              className={`text-fluid-sm text-corpo inline-flex min-h-11 items-center justify-center rounded-full border px-4 font-medium transition-opacity hover:opacity-80 ${estilo.caixa.split(" ")[0]}`}
            >
              Ver o que parou
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
