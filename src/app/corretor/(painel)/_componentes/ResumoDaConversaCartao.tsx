"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import type { EstadoDoResumo } from "@/lib/crm/resumoDaConversaServidor";
import { pedirResumoDaConversa } from "./acoesResumoDaConversa";
import { NotaDoLeadChip } from "./NotaDoLeadChip";

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** O que dizer quando o pedido não gerou resumo novo. */
const AVISO: Partial<Record<NonNullable<EstadoDoResumo["decisao"]>, string>> = {
  espera: "Chegaram mensagens novas; o resumo é refeito em alguns minutos.",
  sem_cota: "A cota de IA da conta acabou neste mês: o resumo volta quando ela renovar.",
  teto_do_dia: "O limite diário de resumos da conta foi atingido. Volta amanhã.",
  falhou: "Não consegui gerar o resumo agora. Tente de novo em instantes.",
};

/**
 * "Resumo da conversa" + "Próximo passo sugerido" (IA no atendimento,
 * 30/10/2026), na ficha do lead e no perfil aberto de dentro da conversa.
 *
 * A primeira pintura usa o cache do lead (zero chamada). Se chegou mensagem
 * desde o último resumo, o cartão pede um novo sozinho — a regra do servidor
 * (`decidirResumo`) segura o custo: no máximo um a cada 10 min por lead,
 * teto diário por conta e a cota do mês. "Atualizar" força, com intervalo
 * de 1 min. Nada aqui manda mensagem para o cliente.
 */
export function ResumoDaConversaCartao({ leadId, inicial }: { leadId: string; inicial: EstadoDoResumo }) {
  const [estado, setEstado] = useState<EstadoDoResumo>(inicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pedindo, iniciar] = useTransition();
  const pediuSozinho = useRef(false);

  function pedir(forcar: boolean) {
    iniciar(async () => {
      const r = await pedirResumoDaConversa(leadId, forcar);
      if ("erro" in r) {
        setAviso(r.erro);
        return;
      }
      setEstado(r);
      setAviso(
        r.decisao && r.decisao !== "gerar"
          ? (AVISO[r.decisao] ?? (forcar && r.decisao === "em_dia" ? "O resumo já está em dia com a conversa." : null))
          : null,
      );
    });
  }

  useEffect(() => {
    if (!inicial.desatualizado || pediuSozinho.current) return;
    pediuSozinho.current = true;
    pedir(false);
    // Só na montagem: o pedido automático é um por abertura do cartão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { resumo } = estado;
  const linhas: { rotulo: string; valor: string }[] = resumo
    ? [
        { rotulo: "Quer", valor: resumo.quer },
        ...(resumo.objecoes ? [{ rotulo: "Dúvidas", valor: resumo.objecoes }] : []),
        ...(resumo.combinado ? [{ rotulo: "Combinado", valor: resumo.combinado }] : []),
      ]
    : [];

  return (
    <section className="cartao overflow-hidden text-left" aria-busy={pedindo}>
      <div className="border-linha flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-titulo text-sm font-semibold">Resumo da conversa</h2>
          <NotaDoLeadChip nota={estado.nota} />
        </div>
        <div className="flex items-center gap-2">
          {estado.geradoEm && (
            <span className="text-tenue text-xs">
              {pedindo ? "atualizando…" : `atualizado ${quando.format(new Date(estado.geradoEm))}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => pedir(true)}
            disabled={pedindo}
            className="text-apoio hover:text-titulo border-linha-forte inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-60"
          >
            <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${pedindo ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {estado.nota?.motivo && <p className="text-apoio px-4 pt-3 text-xs">{estado.nota.motivo}</p>}

      {resumo ? (
        <>
          <dl className="divide-linha divide-y">
            {linhas.map((l) => (
              <div key={l.rotulo} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <dt className="text-tenue w-20 shrink-0">{l.rotulo}</dt>
                <dd className="text-corpo min-w-0 break-words">{l.valor}</dd>
              </div>
            ))}
          </dl>
          <div className="border-acento-linha bg-acento-lavado mx-4 mt-1 mb-4 rounded-xl border px-3.5 py-2.5">
            <p className="text-acento-suave text-[11px] font-semibold tracking-wide uppercase">Próximo passo sugerido</p>
            <p className="text-titulo mt-0.5 text-sm font-medium break-words">{resumo.proximoPasso}</p>
          </div>
        </>
      ) : (
        <p className="text-apoio px-4 py-3 text-sm">
          {pedindo ? "Lendo a conversa…" : "Ainda não há conversa suficiente para resumir."}
        </p>
      )}

      {aviso && (
        <p role="status" className="text-tenue border-linha border-t px-4 py-2 text-xs">
          {aviso}
        </p>
      )}
    </section>
  );
}
