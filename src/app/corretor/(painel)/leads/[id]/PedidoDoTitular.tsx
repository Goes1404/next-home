"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldX } from "lucide-react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { apagarDadosDoTitular } from "./titularAcoes";

/**
 * "A pessoa pediu para apagar os dados dela" (LGPD art. 18, 0202). Só o
 * gestor vê. Diferente de "Excluir definitivamente": além do lead e da
 * conversa, apaga o que ficaria espalhado (envios antigos, listas de
 * transmissão, anotações, e-mails de portal, documentos e fotos recebidas),
 * leva as outras fichas da mesma pessoa (mesmo telefone ou e-mail) e deixa o
 * pedido registrado sem o nome dela. A venda, se houver, fica (obrigação
 * fiscal), com o nome e o CPF do comprador.
 */
export function PedidoDoTitular({ leadId, nome }: { leadId: string; nome: string }) {
  const router = useRouter();
  const { avisar, falhar } = useAvisos();
  const [aberto, setAberto] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [pendente, iniciar] = useTransition();

  const apagar = () =>
    iniciar(async () => {
      try {
        const r = await apagarDadosDoTitular(leadId);
        if (r.erro) {
          falhar(r.erro);
          return;
        }
        avisar(r.ok ?? "Dados apagados.");
        router.push("/corretor/pessoas");
      } catch (e) {
        falhar(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não deu para completar. Confira a conexão e tente de novo.");
      }
    });

  return (
    <section className="border-linha mt-4 rounded-2xl border border-dashed p-4" aria-labelledby="titulo-titular">
      <h2 id="titulo-titular" className="text-fluid-sm text-apoio font-medium">
        Pedido para apagar os dados (LGPD)
      </h2>
      <p className="text-fluid-xs text-tenue mt-1">
        Use quando a própria pessoa pedir para ter os dados apagados. Some tudo dela do sistema; não tem desfazer.
      </p>

      {!aberto ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="text-fluid-sm border-perigo-linha text-perigo hover:bg-perigo-lavado inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 transition-colors"
          >
            <ShieldX className="h-4 w-4" aria-hidden />
            Registrar pedido de exclusão
          </button>
        </div>
      ) : (
        <div className="border-perigo-linha bg-perigo-lavado mt-3 rounded-xl border p-3">
          <p className="text-fluid-sm text-titulo">
            Apagar todos os dados de {nome}? Vão junto as outras fichas com o mesmo telefone ou e-mail, as conversas, os
            documentos e fotos recebidos, as anotações, os envios de listas e o que a IA anotou. Uma venda registrada
            fica guardada, com o nome e o CPF do comprador, porque a lei fiscal obriga.
          </p>
          <label className="text-fluid-sm text-corpo mt-3 flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
              className="h-5 w-5 shrink-0"
            />
            A pessoa pediu para apagar os dados dela.
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pendente || !confirmado}
              onClick={apagar}
              className="text-fluid-sm bg-perigo text-sobre-cor min-h-11 rounded-xl px-4 font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pendente ? "Apagando…" : "Apagar os dados"}
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={() => {
                setAberto(false);
                setConfirmado(false);
              }}
              className="border-linha-forte text-corpo text-fluid-sm min-h-11 rounded-xl border px-4"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
