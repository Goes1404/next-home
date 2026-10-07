"use client";

import { useState } from "react";
import { ChatBase } from "@/app/corretor/(painel)/_componentes/ChatBase";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import type { MensagemDeChat } from "@/app/corretor/(painel)/_componentes/chatTipos";
import { SUGESTOES_FINANCEIRO } from "@/lib/financeiro/assistenteFinanceiro";
import { perguntarAoFinanceiro, type MensagemFinanceira } from "./acoes";

/**
 * A conversa do dono com o assistente financeiro. Vive só na tela: a pergunta
 * de dinheiro da empresa não precisa ficar guardada, e recarregar começa de
 * novo com os números do momento.
 */
export function ChatFinanceiro() {
  const { falhar } = useAvisos();
  const [mensagens, setMensagens] = useState<MensagemDeChat[]>([]);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string } | null>(null);
  const [pensando, setPensando] = useState(false);

  const enviar = async (texto: string) => {
    const agora = new Date().toISOString();
    const historico: MensagemFinanceira[] = mensagens.map((m) => ({ papel: m.papel === "ia" ? "ia" : "dono", texto: m.conteudo }));
    setPendente({ id: `temp-${agora}`, conteudo: texto });
    setPensando(true);
    try {
      const r = await perguntarAoFinanceiro(historico, texto);
      if (r.erro || !r.resposta) {
        falhar(r.erro ?? "O assistente não respondeu agora.");
        return;
      }
      const resposta = r.resposta;
      setMensagens((l) => [
        ...l,
        { id: `d-${agora}`, papel: "corretor", conteudo: texto, dados: null, createdAt: agora },
        { id: `i-${agora}`, papel: "ia", conteudo: resposta, dados: null, createdAt: new Date().toISOString() },
      ]);
    } catch {
      // Erro de rede vira exceção, não `{erro}`: sem este ramo a tela destrava muda.
      falhar("Não consegui perguntar. Confira a conexão e tente de novo.");
    } finally {
      setPendente(null);
      setPensando(false);
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      <ChatBase
        mensagens={mensagens}
        pendente={pendente}
        pensando={pensando}
        placeholder="Pergunte do caixa"
        sugestoes={SUGESTOES_FINANCEIRO}
        vazio={
          <>
            <p className="text-titulo font-medium">Pergunte sobre o dinheiro da imobiliária.</p>
            <p className="mt-1">
              Ele lê o caixa, as comissões, o resultado dos últimos meses e os impostos estimados. Não faz conta nova:
              só responde com os números que estão no sistema.
            </p>
          </>
        }
        onEnviar={enviar}
        onEscolher={(_p, escolha) => enviar(escolha)}
      />
      <p className="text-tenue px-1 text-right text-[11px]">A conversa não fica guardada · valores fora do sistema são cortados</p>
    </div>
  );
}
