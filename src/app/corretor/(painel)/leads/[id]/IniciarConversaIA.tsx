"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { iniciarConversaPelaIA } from "../../conversas/acoesIA";

/**
 * O botão "Iniciar conversa com IA" da ficha do lead (05/09/2026).
 *
 * Um clique: a IA abre (ou assume) a conversa deste lead no WhatsApp e
 * manda a primeira mensagem — apresentação curta gerada pelo mesmo agente
 * do atendimento. Nasceu junto com a inversão da trava: agora que número
 * desconhecido nunca é atendido sozinho, este é o gesto que põe a IA para
 * trabalhar um lead da carteira sem depender de palavra-chave.
 *
 * O clique é uma ação de ENVIO real — por isso pede confirmação em dois
 * toques (mesmo padrão de excluir): o primeiro arma, o segundo dispara.
 */
export function IniciarConversaIA({ leadId, temTelefone }: { leadId: string; temTelefone: boolean }) {
  const router = useRouter();
  const [armado, setArmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  if (!temTelefone) return null;

  function clicar() {
    setErro(null);
    if (!armado) {
      setArmado(true);
      return;
    }
    setArmado(false);
    iniciar(async () => {
      const r = await iniciarConversaPelaIA(leadId);
      if (r.erro) setErro(r.erro);
      else {
        setFeito(r.ok ?? "A IA iniciou a conversa.");
        router.refresh();
      }
    });
  }

  if (feito) {
    return (
      <span className="text-fluid-sm inline-flex items-center gap-2 rounded-full border border-acento-linha bg-acento-lavado px-4 py-2 font-medium text-acento-suave">
        <Sparkles className="h-4 w-4" /> {feito}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={clicar}
        disabled={ocupado}
        className={`text-fluid-sm inline-flex items-center gap-2 rounded-full border px-4 py-2 font-medium transition-colors disabled:opacity-60 ${
          armado
            ? "border-acento bg-acento text-fundo"
            : "border-acento-linha bg-acento-lavado text-acento-suave hover:opacity-85"
        }`}
      >
        <Sparkles className="h-4 w-4" />
        {ocupado ? "IA escrevendo…" : armado ? "Confirmar envio?" : "Iniciar conversa com IA"}
      </button>
      {erro && <span className="text-fluid-xs text-corpo-suave">{erro}</span>}
    </span>
  );
}
