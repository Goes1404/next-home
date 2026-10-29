"use client";

import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";

/**
 * O link pronto e as saídas que o corretor usa (26/09/2026; separado em
 * 29/10/2026 para a "vitrine" da ficha usar o mesmo): abrir o WhatsApp do
 * cliente com a mensagem escrita, copiar, ou ver como o cliente vê.
 *
 * NUNCA envia sozinho: o botão abre o WhatsApp do próprio corretor com o
 * texto pronto, e quem aperta "enviar" é ele (regra anti-banimento — envio
 * automático para quem não pediu é o que derruba número).
 */
export function LinkCriadoParaEnviar({
  url,
  mensagem,
  telefone,
}: {
  url: string;
  mensagem: string;
  telefone: string | null;
}) {
  const { avisar, falhar } = useAvisos();
  const digitos = telefone?.replace(/\D/g, "") ?? "";
  const wa = digitos ? `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}` : null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      avisar("Mensagem com o link copiada.");
    } catch {
      falhar("Não consegui copiar — selecione o link e copie à mão.");
    }
  }

  return (
    <div className="rounded-xl border border-acento-linha bg-acento-lavado p-3 space-y-2">
      <p className="text-fluid-xs text-corpo break-words">{mensagem}</p>
      <div className="flex flex-wrap gap-2">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 inline-flex items-center rounded-xl bg-[#25D366] px-4 text-fluid-xs font-bold text-white"
          >
            Enviar no WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={copiar}
          className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo"
        >
          Copiar
        </button>
        <a
          href={`${url}?previa=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 inline-flex items-center rounded-xl px-3 text-fluid-xs text-apoio underline underline-offset-2"
        >
          Ver como o cliente vê
        </a>
      </div>
    </div>
  );
}
