"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { moduloAtivo } from "../_componentes/navegacao";
import { Chat, estadoDa, mesclar, type ConversaResumo, type Estado } from "../conversas/Chat";
import { useConversaAoVivo } from "../conversas/useConversaAoVivo";
import { lerMensagens, marcarConversaLida, type MensagemConversa } from "../conversas/acoes";

/**
 * A conversa sobre a lista de Pessoas, sem sair dela.
 *
 * A lista já era ordenada por última atividade, com prévia e não lidas — o
 * formato do aplicativo que a corretora usa o dia inteiro. Só que tocar numa
 * linha trocava de tela: ela perdia a lista, e voltar custava o botão de
 * voltar. Num painel usado no celular, entre uma conversa e a seguinte, isso
 * é a diferença entre responder cinco pessoas e responder uma.
 *
 * Mora em portal no `<body>` porque o cabeçalho do painel tem
 * `backdrop-filter`, e `backdrop-filter` cria containing block: um
 * `position: fixed` dentro dele fica preso ao vidro em vez da viewport — a
 * armadilha que este projeto já pisou seis vezes.
 *
 * E porque mora fora da árvore, repete `data-rota` e `data-modulo` na própria
 * raiz: a cor viaja por custom property, que só herda pelo DOM. Sem os dois a
 * gaveta nasce com a paleta do SITE e o acento padrão — não quebra nada, ela
 * só mente, que é pior.
 */
export function GavetaConversa({
  conversa,
  podeEnviar,
  aoFechar,
}: {
  conversa: ConversaResumo;
  podeEnviar: boolean;
  aoFechar: () => void;
}) {
  const atual = usePathname();
  const modulo = moduloAtivo(atual);

  const [mensagens, setMensagens] = useState<MensagemConversa[] | null>(null);
  const [estado, setEstado] = useState<Estado>(estadoDa(conversa));
  const [erro, setErro] = useState<string | null>(null);
  const painel = useRef<HTMLElement>(null);

  /*
   * Carga + reconcílio de 15s: o mesmo par da tela de Conversas. O Realtime é
   * o caminho principal; isto é o que traz a avaliação e o vínculo com a
   * telemetria (que o INSERT não carrega) e o que segura a tela se o
   * websocket cair.
   */
  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      const novas = await lerMensagens(conversa.id);
      if (vivo) setMensagens((antes) => mesclar(antes ?? undefined, novas));
    };
    void buscar();
    const timer = setInterval(() => void buscar(), 15_000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [conversa.id]);

  // Chat na tela é chat lido, como no aplicativo.
  useEffect(() => {
    void marcarConversaLida(conversa.id);
  }, [conversa.id]);

  // `useCallback` não é enfeite: sem ele o efeito do hook roda a cada render,
  // e cada render derruba e reassina o canal.
  const aoInserir = useCallback((m: MensagemConversa) => {
    setMensagens((antes) => mesclar(antes ?? undefined, [m]));
  }, []);
  const aoAtualizar = useCallback((m: MensagemConversa) => {
    // Preserva a avaliação local: o UPDATE do banco não a carrega, e sem isto
    // o 👍 que a pessoa acabou de dar sumiria no próximo ack de entrega.
    setMensagens((antes) => antes?.map((x) => (x.id === m.id ? { ...m, avaliacao: x.avaliacao } : x)) ?? antes);
  }, []);
  useConversaAoVivo({ conversaId: conversa.id, aoInserir, aoAtualizar });

  useEffect(() => {
    const alvo = painel.current;
    const focaveis = () =>
      Array.from(
        alvo?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, textarea") ?? [],
      ).filter((el) => el.offsetParent !== null);

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        aoFechar();
        return;
      }
      if (ev.key !== "Tab") return;
      // Armadilha de foco: sem isto o Tab passeia pela lista atrás do
      // escurecido, onde o olho não vê e o dedo não alcança.
      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (ev.shiftKey && document.activeElement === primeiro) {
        ev.preventDefault();
        ultimo.focus();
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    // A lista atrás não rola com a gaveta aberta: arrastar o polegar sobre o
    // escurecido é o gesto de fechar mais comum, e rolar o fundo o quebra.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aoFechar]);

  return createPortal(
    <div
      data-rota="painel"
      data-modulo={modulo ?? undefined}
      className="fixed inset-0 z-60 flex justify-end"
    >
      {/* O véu é botão de verdade: tocar fora fecha, e o leitor de tela
          anuncia a saída em vez de encontrar uma div muda. */}
      <button
        type="button"
        aria-label="Fechar conversa"
        onClick={aoFechar}
        className="absolute inset-0 cursor-pointer bg-black/50"
      />
      <section
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={`Conversa com ${conversa.nome ?? conversa.telefone}`}
        className="bg-wa-lista relative flex h-full w-full flex-col overflow-hidden shadow-2xl md:w-[480px]"
      >
        {erro && (
          <p role="alert" className="bg-perigo-lavado text-perigo text-fluid-xs px-3 py-2">
            {erro}
          </p>
        )}
        <Chat
          conversa={conversa}
          estado={estado}
          mensagens={mensagens}
          podeEnviar={podeEnviar}
          onVoltar={aoFechar}
          onErro={setErro}
          onEstado={setEstado}
          onMesclar={(novas) => setMensagens((antes) => mesclar(antes ?? undefined, novas))}
          onRemover={(mensagemId) =>
            setMensagens((antes) => antes?.filter((m) => m.id !== mensagemId) ?? antes)
          }
        />
      </section>
    </div>,
    document.body,
  );
}
