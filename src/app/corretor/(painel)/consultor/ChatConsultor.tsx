"use client";

import { useState } from "react";
import { ChatBase } from "@/app/corretor/(painel)/_componentes/ChatBase";
import { ListaDeConversas } from "@/app/corretor/(painel)/_componentes/ListaDeConversas";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import type { PerguntaDeChat } from "@/app/corretor/(painel)/_componentes/chatTipos";
import type { ConversaDoConsultor } from "@/lib/consultor/contrato";
import { BlocosDaResposta } from "./BlocosDaResposta";
import {
  abrirConversaDoConsultor,
  enviarMensagemDoConsultor,
  excluirConversa,
  type EstadoDoChatConsultor,
} from "./acoes";

/*
 * Os pedidos de verdade, no formato que funciona: quem é o cliente, quanto
 * ganha, o que quer. Até 11/09/2026 o exemplo morava no placeholder — e no
 * celular o campo cortava a frase no meio. Aqui ele cabe inteiro, quebra
 * linha, e um toque manda: ver a IA responder ensina o formato melhor que
 * qualquer instrução.
 */
const SUGESTOES = [
  "Renda de 8 mil, 2 dorm em Barueri: o que serve?",
  "Cliente tem 60 mil de entrada — até quanto ele fecha?",
  "Simula o financiamento do imóvel mais barato do catálogo",
  "Escreve a resposta pro cliente que sumiu depois da visita",
] as const;

/**
 * O consultor imobiliário, em forma de chat.
 *
 * A casca é a mesma do Estúdio (`ChatBase`); o que muda é o que aparece
 * embaixo do balão — cartão de imóvel, quadro de simulação, texto pronto para
 * o cliente, todos em `BlocosDaResposta`, que o balão flutuante
 * (`BalaoConsultor`) também usa. Nenhuma chamada paga sai desta tela: só
 * texto.
 */
export function ChatConsultor({
  conversasIniciais,
  conferidoEm,
  perguntaInicial,
  estadoInicial,
}: {
  conversasIniciais: ConversaDoConsultor[];
  conferidoEm: string;
  /** Veio de outra tela (`?pergunta=`), já no composer e editável. */
  perguntaInicial?: string;
  /**
   * A conversa já aberta, carregada NO SERVIDOR (`?conversa=`).
   *
   * É por aqui que o balão flutuante entrega a conversa à tela cheia. Buscar
   * num efeito faria a tela piscar vazia antes de preencher — e a regra de
   * lint desta base reprova `setState` dentro de efeito, que é como esse
   * defeito costuma aparecer.
   */
  estadoInicial?: EstadoDoChatConsultor;
}) {
  const { falhar } = useAvisos();
  const [conversas, setConversas] = useState(conversasIniciais);
  const [estado, setEstado] = useState<EstadoDoChatConsultor | null>(estadoInicial ?? null);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string } | null>(null);
  const [pensando, setPensando] = useState(false);

  const aplicar = (r: EstadoDoChatConsultor | { erro: string }) => {
    if ("erro" in r) {
      falhar(r.erro);
      return false;
    }
    setEstado(r);
    setConversas((lista) => [r.conversa, ...lista.filter((c) => c.id !== r.conversa.id)]);
    return true;
  };

  const enviar = async (texto: string, escolha?: { perguntaId: string; pergunta: string }) => {
    setPendente({ id: `temp-${Date.now()}`, conteudo: texto });
    setPensando(true);
    try {
      const r = await enviarMensagemDoConsultor({
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
      });
      if (!aplicar(r)) throw new Error("falhou");
    } catch {
      /*
       * Erro de rede não devolve `{erro}`, devolve exceção — sem este ramo a
       * tela destrava MUDA, que é o pior desfecho: parece que deu certo.
       */
      falhar("Não consegui enviar. Confira a conexão e tente de novo.");
    } finally {
      setPendente(null);
      setPensando(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <ListaDeConversas
        conversas={conversas}
        ativa={estado?.conversa.id ?? null}
        onAbrir={(id) => void abrirConversaDoConsultor(id).then(aplicar)}
        onNova={() => setEstado(null)}
        onExcluir={async (id) => {
          const r = await excluirConversa(id);
          if ("erro" in r) {
            falhar(r.erro);
            return;
          }
          setConversas((l) => l.filter((c) => c.id !== id));
          if (estado?.conversa.id === id) setEstado(null);
        }}
      />

      <div className="min-w-0 space-y-2">
        <ChatBase
          mensagens={estado?.mensagens ?? []}
          pendente={pendente}
          pensando={pensando}
          placeholder="O que você precisa?"
          sugestoes={SUGESTOES}
          vazio={
            <>
              <p className="text-titulo font-medium">Pergunte como perguntaria a um gerente experiente.</p>
              <p className="mt-1">
                Ele conhece os imóveis publicados, as regras de crédito (conferidas em {conferidoEm})
                e o que já funcionou nas conversas desta casa.
              </p>
            </>
          }
          textoInicial={perguntaInicial}
          onEnviar={(t) => enviar(t)}
          onEscolher={(p: PerguntaDeChat, escolha) =>
            enviar(escolha, { perguntaId: p.id, pergunta: p.texto })
          }
          renderAbaixo={(m) => <BlocosDaResposta dados={m.dados} />}
        />
        <p className="text-tenue px-1 text-right text-[11px]">
          Estimativas, não proposta oficial · conversar não gasta geração
        </p>
      </div>
    </div>
  );
}
