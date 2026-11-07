"use client";

import { CartaoDeAvisos } from "@/components/avisos/CartaoDeAvisos";
import { enviarNotificacaoDeTeste } from "./acoesDasNotificacoes";

/**
 * Liga a notificação no celular deste aparelho (0203).
 *
 * O aviso pelo WhatsApp sai do número do próprio corretor para ele mesmo e
 * cai na conversa "Você", sem notificação. Esta é a que chama a atenção:
 * lead novo, cliente esperando, lembretes. Some quando já está ligada.
 * A lógica é a de `CartaoDeAvisos` (a mesma da plataforma).
 */
export function AtivarNotificacoes({ sempreVisivel = false }: { sempreVisivel?: boolean }) {
  return (
    <CartaoDeAvisos
      rota="/api/notificacoes"
      onde="painel"
      titulo="Avisos no celular"
      convite="Receba uma notificação quando chegar lead novo ou um cliente estiver esperando. O aviso pelo WhatsApp cai na sua própria conversa e não toca."
      rotuloDoBotao="Ligar avisos neste celular"
      textoLigado="Ligados neste aparelho. Lead novo, cliente que respondeu, visita daqui a 1 hora, lead parado e senha vencendo chegam como notificação."
      dicaDoIphone={
        <>
          No iPhone: toque em Compartilhar → <strong>Adicionar à Tela de Início</strong>, abra o painel por esse atalho e ligue aqui.
        </>
      }
      testar={enviarNotificacaoDeTeste}
      sempreVisivel={sempreVisivel}
    />
  );
}
