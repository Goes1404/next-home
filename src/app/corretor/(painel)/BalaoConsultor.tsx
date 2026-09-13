"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { moduloAtivo } from "./_componentes/navegacao";
import { useAvisos } from "./_componentes/Avisos";
import { enviarMensagemDoConsultor, type EstadoDoChatConsultor } from "./consultor/acoes";

/*
 * O painel aberto (ChatBase, blocos de resposta) só é baixado no toque na
 * bolha (F4, 13/09/2026). A bolha mora no layout — toda rota do painel a
 * carrega — e até aqui arrastava o chat inteiro para o JavaScript de toda
 * tela, aberta ou não.
 */
const PainelDoConsultor = dynamic(() => import("./PainelDoConsultor").then((m) => m.PainelDoConsultor), {
  ssr: false,
});

/**
 * O consultor a um toque, de qualquer tela do painel.
 *
 * A pergunta que ele responde ("qual imóvel serve para esta pessoa?", "isso
 * fecha?") quase nunca nasce na tela do consultor: nasce olhando a ficha de
 * um lead, a conversa no Live Chat, o cartão do imóvel. Ir até lá custava
 * sair do que se estava fazendo — e num painel usado no celular, sair é não
 * voltar.
 *
 * Não é um chat novo: é OUTRA PORTA para o mesmo consultor. As mesmas Server
 * Actions, a mesma tabela, os mesmos blocos de resposta
 * (`BlocosDaResposta`). A conversa que nasce aqui aparece no histórico da
 * tela cheia, e o rodapé leva para lá com ela já aberta.
 *
 * ## Por que mora no LAYOUT
 *
 * Layout não re-executa ao navegar entre rotas irmãs, então este componente
 * não desmonta: abrir em Pessoas, ir para Imóveis e continuar a conversa
 * funciona sem store, sem URL e sem recarregar nada.
 *
 * ## Por que um PORTAL, e o que isso obriga
 *
 * O painel é `position: fixed`, e o cabeçalho do painel tem
 * `backdrop-filter` — que cria containing block. Um `fixed` nascido ali
 * ficaria preso à barra em vez da viewport; é a armadilha que este projeto
 * já pisou seis vezes. No `document.body` ele é imune.
 *
 * Mas fora da árvore a COR não viaja: `[data-rota="painel"]` redefine a
 * paleta e `[data-modulo]` a cor de acento, por custom property, que só
 * herda pelo DOM. Por isso os dois atributos se repetem na raiz portalada, e
 * o módulo sai de `moduloAtivo(atual)` — a mesma função que pinta o `<main>`,
 * senão os dois podem discordar sobre a cor da mesma rota.
 */

/*
 * Pedidos curtos, para a caixa curta.
 *
 * Os da tela cheia têm até 56 caracteres e ocupam quatro linhas num painel de
 * 380px — aqui eles seriam uma parede de texto em cima da conversa. Mesma
 * função: quem nunca escreveu um pedido não sabe o que cabe, e o cursor
 * piscando não ensina.
 */

const semInscricao = () => () => {};

/** `false` no servidor; `true` depois de hidratar — o portal precisa de `document`. */
function useMontado(): boolean {
  return useSyncExternalStore(semInscricao, () => true, () => false);
}

export function BalaoConsultor() {
  const atual = usePathname();
  const modulo = moduloAtivo(atual);
  const montado = useMontado();
  const { falhar } = useAvisos();

  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<EstadoDoChatConsultor | null>(null);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string } | null>(null);
  const [pensando, setPensando] = useState(false);

  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);

    /*
     * A rolagem do fundo só trava no CELULAR, onde o painel cobre a tela
     * inteira e arrastar por cima dele rolaria a página atrás. No computador
     * ele é uma caixa no canto: travar a página ali tiraria do corretor a
     * possibilidade de rolar a lista que ele está justamente perguntando
     * sobre.
     */
    const celular = window.matchMedia("(max-width: 767px)").matches;
    const overflowAnterior = document.body.style.overflow;
    if (celular) document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      if (celular) document.body.style.overflow = overflowAnterior;
    };
  }, [aberto]);

  /*
   * Na própria tela do consultor o balão não aparece: porta que abre a sala
   * onde você já está é ruído. A comparação é por SEGMENTO, nunca por
   * prefixo de texto — foi `startsWith("/corretor")` engolindo
   * `/corretores` que apagou a onda entre páginas em 10/09.
   */
  const naTelaDoConsultor =
    atual === "/corretor/consultor" || atual.startsWith("/corretor/consultor/");

  const enviar = async (texto: string, escolha?: { perguntaId: string; pergunta: string }) => {
    setPendente({ id: `temp-${Date.now()}`, conteudo: texto });
    setPensando(true);
    // O servidor RECUSAR já tem mensagem própria; sem esta marca o corretor
    // levaria dois avisos pela mesma falha, um deles apontando para a
    // conexão, que estava boa.
    let avisado = false;
    try {
      const r = await enviarMensagemDoConsultor({
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
      });
      if ("erro" in r) {
        falhar(r.erro);
        avisado = true;
        throw new Error(r.erro);
      }
      setEstado(r);
    } catch (erro) {
      // Erro de rede não devolve `{erro}`, devolve exceção — sem este ramo a
      // tela destrava MUDA, que é o pior desfecho: parece que deu certo.
      if (!avisado) falhar("Não consegui enviar. Confira a conexão e tente de novo.");
      // Relança para o `ChatBase` devolver o texto ao campo: quem escreveu
      // três linhas não pode ter de redigitá-las por causa de uma piscada.
      throw erro;
    } finally {
      setPendente(null);
      setPensando(false);
    }
  };

  if (!montado || naTelaDoConsultor) return null;

  const telaCheia = estado
    ? `/corretor/consultor?conversa=${estado.conversa.id}`
    : "/corretor/consultor";

  return createPortal(
    <div
      data-rota="painel"
      data-modulo={modulo ?? undefined}
      // A raiz não intercepta toque: só a bolha e o painel dentro dela.
      className="pointer-events-none fixed inset-0 z-[55]"
    >
      {aberto ? (
        <PainelDoConsultor
          telaCheia={telaCheia}
          fechar={() => setAberto(false)}
          estado={estado}
          pendente={pendente}
          pensando={pensando}
          enviar={enviar}
        />
      ) : (
        /*
         * A bolha some enquanto o painel está aberto — no celular ela ficaria
         * POR CIMA da conversa, e no computador em cima do próprio painel.
         * Quem fecha é o ✕ do cabeçalho.
         *
         * O canto é o mesmo do `BotaoVoltarAoTopo`, que subiu um degrau para
         * dar lugar a ela. A altura dele é fixa, não condicional a esta
         * bolha: dois botões que dançam conforme o outro aparece é pior que
         * um degrau constante.
         */
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir o consultor"
          className="bg-acento text-sobre-cor shadow-painel pointer-events-auto absolute right-4 bottom-[calc(var(--nav-mobile-h)+1rem)] flex size-14 cursor-pointer items-center justify-center rounded-full ring-1 ring-white/20 transition-transform ring-inset hover:-translate-y-0.5 md:right-6 md:bottom-6"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.4-.7L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
          </svg>
        </button>
      )}
    </div>,
    document.body,
  );
}
