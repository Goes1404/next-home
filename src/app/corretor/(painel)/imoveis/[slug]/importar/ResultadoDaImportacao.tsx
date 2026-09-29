"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export type ResultadoImportacao = {
  /** Quantos itens NOVOS entraram no imóvel (fotos, plantas, vídeos, tours). */
  entraram: number;
  /** Quantos não entraram por erro. Duplicada não é erro: já estava lá. */
  falharam: number;
  /** O detalhe, uma frase por linha: "3 fotos adicionadas.", etc. */
  linhas: string[];
};

/** O título do cartão, e também o texto do aviso flutuante. */
export function tituloDoResultado({ entraram, falharam }: ResultadoImportacao): string {
  const itens = `${entraram} ${entraram === 1 ? "item entrou" : "itens entraram"} no imóvel`;
  if (entraram > 0 && falharam === 0) return `Pronto! ${itens}.`;
  if (entraram > 0) return `${itens}, mas ${falharam} ${falharam === 1 ? "ficou de fora" : "ficaram de fora"}.`;
  if (falharam > 0) return `Nada entrou: ${falharam} ${falharam === 1 ? "item falhou" : "itens falharam"}.`;
  return "Nada novo entrou: o que você marcou já estava no imóvel.";
}

/**
 * O fim de uma importação. Era uma linha de texto miúda embaixo do botão,
 * fácil de perder depois de um envio de um minuto; o corretor não sabia se
 * tinha dado certo. Hoje é um cartão com a cor do desfecho, que rola para a
 * vista e recebe o foco quando aparece, com o caminho para ver o resultado.
 */
export function ResultadoDaImportacao({ resultado, slug }: { resultado: ResultadoImportacao; slug: string }) {
  const cartao = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cartao.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.focus({ preventScroll: true });
  }, [resultado]);

  const tom =
    resultado.entraram > 0 && resultado.falharam === 0 ? "ok" : resultado.entraram > 0 || resultado.falharam > 0 ? "parcial" : "neutro";

  const estilo = {
    ok: { caixa: "border-ok-linha bg-ok-lavado", icone: "bg-ok text-fundo", simbolo: "✓" },
    parcial: { caixa: "border-alerta-linha bg-alerta-lavado", icone: "bg-alerta text-fundo", simbolo: "!" },
    neutro: { caixa: "border-linha bg-elevado", icone: "bg-campo text-apoio", simbolo: "=" },
  }[tom];

  return (
    <div
      ref={cartao}
      tabIndex={-1}
      role="status"
      data-tom={tom}
      className={`surgir flex gap-3 rounded-2xl border-2 p-4 outline-none ${estilo.caixa}`}
    >
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${estilo.icone}`}
      >
        {estilo.simbolo}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-fluid-sm font-bold text-titulo">{tituloDoResultado(resultado)}</p>
        {resultado.linhas.length > 0 ? (
          <ul className="space-y-0.5 text-fluid-xs text-corpo break-words">
            {resultado.linhas.map((linha) => (
              <li key={linha}>{linha}</li>
            ))}
          </ul>
        ) : null}
        {resultado.entraram > 0 ? (
          <Link
            href={`/corretor/imoveis/${slug}`}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-acento px-4 text-fluid-xs font-bold text-sobre-cor"
          >
            Ver no imóvel
          </Link>
        ) : null}
      </div>
    </div>
  );
}
