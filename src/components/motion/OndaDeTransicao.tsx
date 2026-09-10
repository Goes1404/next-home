"use client";

import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const semInscricao = () => () => {};

/** O painel do corretor não ondula. */
const SEM_ONDA = "/corretor";

/** `false` no servidor; `true` depois de hidratar — o portal precisa de `document`. */
function useMontado(): boolean {
  return useSyncExternalStore(semInscricao, () => true, () => false);
}

/**
 * A onda que passa entre uma página e outra.
 *
 * ## O que ela é, honestamente
 *
 * Uma REVELAÇÃO, não uma cortina. Ela dispara quando o caminho muda — ou
 * seja, quando a página nova já está montada — então a onda varre a tela e
 * descobre o conteúdo novo atrás dela, em vez de cobrir o antigo primeiro.
 *
 * Fazer as duas metades exigiria interceptar o clique de todo link do site
 * para animar ANTES de navegar, e aí um caso esquecido (tecla modificadora,
 * `target="_blank"`, âncora, link externo, o do WhatsApp) quebra a navegação
 * inteira. Este componente nunca intercepta nada: se ele falhar, o site
 * continua navegando exatamente como antes. Numa escolha entre "transição
 * perfeita" e "navegação que não quebra", a segunda ganha sempre.
 *
 * De quebra, a onda cobre justamente o instante em que o conteúdo novo
 * ainda não começou as próprias entradas (`Reveal`, `TituloEditorial`) —
 * ela esconde o quadro cru em vez de competir com ele.
 *
 * ## Detalhes
 *
 * - A `key` é o próprio caminho: caminho novo, elemento novo, animação do
 *   começo. Sem isso a segunda navegação não tocaria a animação de novo.
 * - Portal para o `<body>` pelo motivo de sempre nesta base: o elemento é
 *   `fixed`, e `backdrop-filter`/`transform` em qualquer ancestral criaria
 *   containing block e prenderia a onda dentro do painel de vidro.
 * - `z-[45]` fica acima do header (40) e do botão flutuante (30), e abaixo
 *   do menu (50) — que de qualquer forma se fecha ao navegar.
 * - Com movimento reduzido, o interruptor global do `globals.css` encurta a
 *   animação para 0,01ms: ela salta direto para o fim (fora da tela), o
 *   `animationend` dispara na hora e o nó sai. Nada pisca.
 * - Mora no layout RAIZ. Ir da home para o catálogo troca de GRUPO de rota
 *   (`(institucional)` → `(vitrine)`), o layout do grupo é desmontado e um
 *   componente que compara "caminho anterior" renasce sem passado: a
 *   primeira versão vivia nos dois layouts de grupo e não disparou nenhuma
 *   vez nessa travessia. O raiz é o único que sobrevive a tudo.
 * - Ele mesmo se cala no PAINEL: ali a navegação é trabalho repetido dezenas
 *   de vezes por dia, e a cor já muda por módulo. Sair do painel para o site
 *   continua ondulando — aí é uma troca de contexto de verdade.
 */
export function OndaDeTransicao() {
  const montado = useMontado();
  const caminho = usePathname();

  // Derivado na renderização (e não num efeito) para não pagar a cascata de
  // renders que `setState` em efeito provoca — o mesmo padrão do MenuMobile.
  const [anterior, setAnterior] = useState(caminho);
  const [ativa, setAtiva] = useState(false);
  if (caminho !== anterior) {
    setAnterior(caminho);
    setAtiva(true);
  }

  if (!montado || !ativa || caminho.startsWith(SEM_ONDA)) return null;

  return createPortal(
    <div
      key={caminho}
      aria-hidden
      onAnimationEnd={() => setAtiva(false)}
      className="onda-transicao pointer-events-none fixed inset-x-0 top-0 z-[45] h-[200svh]"
    >
      {/*
        Uma FIGURA só, com as duas bordas onduladas, em vez de um bloco
        reto com dois SVGs colados nas pontas: assim o degradê atravessa a
        peça inteira sem emenda — duas peças teriam que casar o degradê na
        junta, e não casam quando a tela muda de proporção.

        `preserveAspectRatio="none"` porque isto é uma cortina, não um
        desenho: ela deve esticar para a tela, e a onda fica mais aberta no
        computador e mais fechada no celular, que é o desejado.
      */}
      <svg
        viewBox="0 0 1440 1000"
        preserveAspectRatio="none"
        className="h-full w-full"
        focusable="false"
      >
        <defs>
          <linearGradient id="onda-marca" x1="0" y1="0" x2="1" y2="1">
            {/* As duas cores do logotipo, nesta ordem: o teal abre, o azul
                fecha. Tinta fixa, não token de tema — a onda é um momento de
                marca em tela cheia, como a vinheta de abertura, e tem de ser
                a mesma peça no tema claro e no escuro. */}
            <stop offset="0%" stopColor="var(--color-brand-600)" />
            <stop offset="55%" stopColor="var(--color-brand-800)" />
            <stop offset="100%" stopColor="var(--color-azure-600)" />
          </linearGradient>
        </defs>
        <path
          fill="url(#onda-marca)"
          d="M0,120 C240,10 480,230 720,120 C960,10 1200,230 1440,120 L1440,880 C1200,990 960,770 720,880 C480,990 240,770 0,880 Z"
        />
      </svg>
    </div>,
    document.body,
  );
}
