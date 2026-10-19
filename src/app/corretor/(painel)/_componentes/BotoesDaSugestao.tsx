"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "./Avisos";
import { dispensarSugestao, enviarSugestao } from "./acoesSugestao";

/**
 * Enviar ou dispensar a mensagem que a IA sugeriu (pós-visita e indicação,
 * 0147). Enviar é envio real ao cliente: o primeiro toque arma, o segundo
 * manda, como o excluir.
 */
export function BotoesDaSugestao({ followupId, titulo }: { followupId: string; titulo: string }) {
  const [pendente, iniciar] = useTransition();
  const [armado, setArmado] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);
  const { falhar } = useAvisos();

  if (feito) {
    return (
      <span className="text-fluid-xs text-ok my-2 flex shrink-0 items-center self-center px-2">
        {feito}
      </span>
    );
  }

  function agir(acao: typeof enviarSugestao, rotuloFeito: string) {
    iniciar(async () => {
      try {
        const r = await acao(followupId);
        if (r.erro) {
          falhar(r.erro);
          return;
        }
        setFeito(rotuloFeito);
      } catch {
        falhar("Não deu para concluir. Confira a conexão.");
      }
    });
  }

  return (
    <span className="my-2 flex shrink-0 items-center gap-1.5 self-center">
      <button
        type="button"
        disabled={pendente}
        aria-label={`Enviar a mensagem sugerida: ${titulo}`}
        onClick={() => {
          if (!armado) {
            setArmado(true);
            return;
          }
          setArmado(false);
          agir(enviarSugestao, "enviada ✓");
        }}
        className={`text-fluid-xs flex min-h-11 items-center rounded-full border px-3 font-medium transition-colors disabled:opacity-60 ${
          armado ? "border-acento bg-acento text-sobre-cor" : "border-acento-linha text-acento-suave hover:bg-elevado"
        }`}
      >
        {pendente ? "Enviando…" : armado ? "Confirmar?" : "Enviar"}
      </button>
      <button
        type="button"
        disabled={pendente}
        aria-label={`Dispensar a sugestão: ${titulo}`}
        onClick={() => agir(dispensarSugestao, "dispensada")}
        className="text-fluid-xs text-apoio flex min-h-11 items-center px-3 transition-colors disabled:opacity-60 botao-secundario"
      >
        Dispensar
      </button>
    </span>
  );
}
