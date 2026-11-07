"use client";

import { CartaoDeAvisos } from "@/components/avisos/CartaoDeAvisos";
import { enviarAvisoDeTesteDaPlataforma } from "./avisosAcoes";

/**
 * Liga os avisos da PLATAFORMA neste aparelho (29/10/2026, 0239): os
 * atendimentos da Astro — pedido de contratação, pedido de suporte, conta
 * nova, suspensa ou atrasada — para quem administra o sistema.
 *
 * Mesmo service worker e mesma inscrição do navegador do corretor (um
 * aparelho pode ser corretor e ADM); muda a rota que guarda e o dono. A
 * lógica é a de `CartaoDeAvisos`.
 */
export function AtivarAvisosDaPlataforma() {
  return (
    <CartaoDeAvisos
      rota="/api/plataforma/notificacoes"
      onde="plataforma"
      titulo="Avisos da Astro no celular"
      convite="Receba uma notificação a cada atendimento da Astro: pedido de contratação, suporte e contas novas, suspensas ou atrasadas."
      rotuloDoBotao="Ligar avisos da Astro neste celular"
      textoLigado="Ligados neste aparelho. Pedido de contratação, pedido de suporte e conta nova, suspensa ou atrasada chegam como notificação."
      dicaDoIphone={
        <>
          No iPhone: toque em Compartilhar → <strong>Adicionar à Tela de Início</strong>, abra a plataforma por esse atalho e ligue aqui.
        </>
      }
      testar={enviarAvisoDeTesteDaPlataforma}
      sempreVisivel
    />
  );
}
