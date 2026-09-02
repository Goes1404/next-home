"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { arquivarLead, excluirLeadDefinitivo, restaurarLead } from "./acoes";

/**
 * Tirar o lead da frente — arquivar (o botão do dia a dia) e excluir (o
 * que não tem volta).
 *
 * Os dois moram longe do resto da ficha, no fim e discretos, pela mesma
 * régua do painel de campanhas: botão destrutivo no mesmo nível do resto é
 * convite ao clique errado.
 *
 * A exclusão exige DOIS passos deliberados — o lead precisa estar
 * arquivado, e ainda assim há uma confirmação que diz por escrito o que
 * será apagado junto (dossiê da IA, tarefas e linha do tempo). Não é
 * excesso de zelo: o banco apaga essas três por CASCADE, e ninguém
 * lembraria disso na hora do clique.
 */
export function ArquivarLead({
  leadId,
  arquivado,
  nome,
}: {
  leadId: string;
  arquivado: boolean;
  nome: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const { avisar, falhar } = useAvisos();

  const executar = (fn: () => Promise<{ ok?: string; erro?: string }>, saindo = false) =>
    iniciar(async () => {
      try {
        const r = await fn();
        if (r.erro) {
          // Era anunciado como `role="status"`, que o leitor de tela guarda
          // para a próxima pausa. Falha ao EXCLUIR um lead merece
          // interromper, e é o que `falhar` faz.
          falhar(r.erro);
          return;
        }
        avisar(r.ok ?? "Pronto");
        // Saindo da ficha, o aviso viaja junto: a região vive no shell do
        // painel, não nesta tela — antes, a confirmação de exclusão sumia com
        // a própria página que a mostrava.
        if (saindo) router.push("/corretor/pessoas");
        else router.refresh();
      } catch {
        falhar("Não deu para completar. Confira a conexão e tente de novo.");
      }
    });

  return (
    <section className="border-linha mt-8 rounded-2xl border border-dashed p-4">
      <h2 className="text-fluid-sm text-apoio font-medium">
        {arquivado ? "Este lead está arquivado" : "Tirar este lead da lista"}
      </h2>
      <p className="text-fluid-xs text-tenue mt-1">
        {arquivado
          ? "Ele não aparece nas listas, no funil nem nas contagens. Dá para restaurar a qualquer momento."
          : "Arquivar tira o lead das listas e do funil sem apagar nada — dá para restaurar depois."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {arquivado ? (
          <>
            <button
              type="button"
              disabled={pendente}
              onClick={() => executar(() => restaurarLead(leadId))}
              className="border-linha-forte text-corpo hover:border-acento-linha text-fluid-sm inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 transition-colors disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Restaurar
            </button>
            {!confirmando ? (
              <button
                type="button"
                disabled={pendente}
                onClick={() => setConfirmando(true)}
                className="text-fluid-sm inline-flex min-h-11 items-center gap-2 rounded-xl border-perigo-linha text-perigo hover:bg-perigo-lavado border px-4 transition-colors disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Excluir definitivamente
              </button>
            ) : (
              <div className="border-perigo-linha bg-perigo-lavado w-full rounded-xl border p-3">
                <p className="text-fluid-sm text-titulo">
                  Excluir {nome} de vez? Isso apaga junto o que a IA anotou sobre ele, as tarefas e a linha do
                  tempo dele. Não tem desfazer.
                </p>
                <p className="text-fluid-xs text-apoio mt-1">
                  A conversa no WhatsApp não é apagada — ela fica sem lead. Se a pessoa escrever de
                  novo, um lead novo é criado.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => executar(() => excluirLeadDefinitivo(leadId), true)}
                    className="text-fluid-sm min-h-11 bg-perigo text-sobre-cor rounded-xl px-4 font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {pendente ? "Excluindo…" : "Sim, excluir para sempre"}
                  </button>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => setConfirmando(false)}
                    className="border-linha-forte text-corpo text-fluid-sm min-h-11 rounded-xl border px-4"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={pendente}
            onClick={() => executar(() => arquivarLead(leadId), true)}
            className="border-linha-forte text-corpo hover:border-acento-linha text-fluid-sm inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 transition-colors disabled:opacity-60"
          >
            <Archive className="h-4 w-4" aria-hidden />
            {pendente ? "Arquivando…" : "Arquivar lead"}
          </button>
        )}
      </div>

    </section>
  );
}
