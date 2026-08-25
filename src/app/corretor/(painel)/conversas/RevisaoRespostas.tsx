"use client";

import { useState } from "react";
import { avaliarInteracao } from "./acoes";

/*
 * Fila de revisão das respostas da IA.
 *
 * O botão 👍/👎 existia desde a 0029 e coletou ZERO rótulos. Um dos motivos
 * era este: a avaliação morava enterrada dentro de cada conversa — revisar
 * 10 respostas exigia abrir 10 conversas — e nada avisava o que faltava
 * revisar. Esta fila inverte o fluxo: as respostas não avaliadas vêm até o
 * corretor, com o contexto mínimo (a fala do cliente + a resposta), e cada
 * uma sai da lista com um clique.
 */

export type ItemRevisao = {
  interacaoId: string;
  clienteNome: string;
  falaCliente: string | null;
  respostaBot: string;
  criadoEm: string;
  /**
   * O que o MUNDO disse sobre esta resposta — o cliente repetiu a pergunta,
   * pediu para falar com gente, ou o corretor entrou corrigindo. Vazio na
   * maioria: silêncio do mundo é o desfecho mais comum.
   */
  sinais?: string[];
  /**
   * O texto que o corretor digitou logo depois, quando ele entrou
   * corrigindo. Não é só a nota — é a resposta certa.
   */
  correcaoDoCorretor?: string | null;
};

/** Como cada sinal se lê para quem abre a tela. */
const FRASE_DO_SINAL: Record<string, string> = {
  corretor_corrigiu: "você entrou corrigindo",
  cliente_repetiu_a_pergunta: "o cliente teve de repetir a pergunta",
  cliente_pediu_humano: "o cliente pediu para falar com gente",
  cliente_sumiu: "o cliente não respondeu mais",
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function RevisaoRespostas({ itens }: { itens: ItemRevisao[] }) {
  const [pendentes, setPendentes] = useState(itens);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  if (pendentes.length === 0) return null;

  function avaliar(item: ItemRevisao, nota: "boa" | "ruim") {
    setErro(null);
    setSalvando(item.interacaoId);
    void avaliarInteracao(item.interacaoId, nota).then((resultado) => {
      setSalvando(null);
      if (resultado.erro) setErro(resultado.erro);
      else setPendentes((atuais) => atuais.filter((p) => p.interacaoId !== item.interacaoId));
    });
  }

  return (
    <section className="border-alerta-linha bg-alerta-lavado mt-8 rounded-2xl border p-5">
      <h2 className="font-display text-titulo text-fluid-lg">
        {pendentes.length === 1
          ? "1 resposta da IA sem revisão"
          : `${pendentes.length} respostas da IA sem revisão`}
      </h2>
      <p className="text-fluid-xs text-apoio mt-1">
        As que já têm sinal de problema vêm primeiro — o cliente repetiu a pergunta, pediu para
        falar com gente, ou você entrou corrigindo. Cada 👎 vira caso de teste do próximo ajuste.
      </p>

      {erro && (
        <p role="alert" className="text-fluid-sm text-perigo mt-3">
          {erro}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {pendentes.map((item) => (
          <li key={item.interacaoId} className="border-linha bg-superficie rounded-xl border p-4">
            <p className="text-tenue text-[11px] font-medium tracking-wide uppercase">
              {item.clienteNome} · {dataHora.format(new Date(item.criadoEm))}
            </p>

            {item.sinais && item.sinais.length > 0 && (
              <p className="text-fluid-xs text-alerta mt-2 font-medium">
                ⚠ {item.sinais.map((s) => FRASE_DO_SINAL[s] ?? s).join(" · ")}
              </p>
            )}

            {item.falaCliente && (
              <p className="text-fluid-xs text-apoio mt-2 line-clamp-2">
                Cliente: “{item.falaCliente}”
              </p>
            )}

            <p className="text-fluid-sm text-corpo mt-2 line-clamp-4 whitespace-pre-line">
              {item.respostaBot}
            </p>

            {item.correcaoDoCorretor && (
              <p className="border-linha text-fluid-xs text-apoio mt-2 border-l-2 pl-3 line-clamp-3">
                Você respondeu: “{item.correcaoDoCorretor}”
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => avaliar(item, "boa")}
                disabled={salvando === item.interacaoId}
                className="border-linha text-apoio hover:text-ok flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors disabled:opacity-60"
              >
                👍 Boa
              </button>
              <button
                type="button"
                onClick={() => avaliar(item, "ruim")}
                disabled={salvando === item.interacaoId}
                className="border-linha text-apoio hover:text-perigo flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors disabled:opacity-60"
              >
                👎 Ruim — vira caso de teste
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
