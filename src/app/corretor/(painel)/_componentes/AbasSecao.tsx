import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Abas de uma seção do painel — telas irmãs que dividem um assunto.
 *
 * É o mecanismo que permite o menu ter cinco destinos em vez de treze: o que
 * é parente vira aba, não item de menu. Cada aba continua sendo uma ROTA
 * própria (link de verdade, endereço próprio, botão de voltar funcionando),
 * então nenhum link salvo quebra e o servidor renderiza só o que a aba pede.
 *
 * O contador existe para as abas em que "quantos" é a informação que decide
 * se vale abrir — respostas sem revisão, mensagens na fila. Zero não é
 * mostrado: um contador que vive em zero ensina a ignorar o contador.
 */

export type AbaSecao = {
  href: string;
  label: string;
  /** Aparece como pílula ao lado do rótulo. Ignorado quando 0. */
  contador?: number;
  /** Bolinha de estado, para abas que representam algo ligado/desligado. */
  ponto?: "ok" | "alerta" | "perigo";
};

const COR_PONTO = {
  ok: "bg-ok",
  alerta: "bg-alerta",
  perigo: "bg-perigo",
} as const;

export function AbasSecao({
  abas,
  ativa,
  rotulo,
}: {
  abas: AbaSecao[];
  /** `href` da aba atual. */
  ativa: string;
  /** Nome da seção, para leitor de tela. */
  rotulo: string;
}) {
  return (
    <nav aria-label={rotulo} className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="border-linha bg-superficie inline-flex rounded-full border p-1">
        {abas.map((aba) => {
          const atual = aba.href === ativa;
          return (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={atual ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm whitespace-nowrap transition-colors",
                atual ? "bg-acento font-medium text-white" : "text-apoio hover:text-titulo",
              )}
            >
              {aba.ponto && (
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", COR_PONTO[aba.ponto])} />
              )}
              {aba.label}
              {aba.contador !== undefined && aba.contador > 0 && (
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                    atual ? "bg-white/25 text-white" : "bg-acento-lavado text-acento-suave",
                  )}
                >
                  {aba.contador}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
