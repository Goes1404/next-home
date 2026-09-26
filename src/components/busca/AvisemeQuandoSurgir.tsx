"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { lerAtribuicao, type AtribuicaoMarketing } from "@/lib/marketing/atribuicao";
import { lerFavoritos } from "@/lib/favoritos";

type Props = {
  /** O que o visitante filtrou: vira o pedido do aviso. */
  regiao?: string;
  dormitoriosMin?: number;
  precoMax?: number;
  /** A busca voltou vazia ou quase: o convite fala mais alto. */
  poucosResultados: boolean;
};

const CAMPO =
  "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3 text-titulo placeholder:text-tenue outline-none transition-colors focus:border-brand-400";

/**
 * "Me avise quando surgir" (26/09/2026). Até aqui, quem não achava o imóvel
 * certo ia embora sem deixar nada. O formulário leva os filtros da tela como
 * critério; o lead nasce com região, dormitórios e teto preenchidos, e a
 * assistente o avisa quando entrar um imóvel que combina.
 */
export function AvisemeQuandoSurgir({ regiao, dormitoriosMin, precoMax, poucosResultados }: Props) {
  const [status, setStatus] = useState<"ideal" | "enviando" | "ok" | "erro">("ideal");
  const [erro, setErro] = useState<string | null>(null);
  const montadoEm = useRef<number | null>(null);
  const atribuicao = useRef<AtribuicaoMarketing>({});
  useEffect(() => {
    montadoEm.current = Date.now();
    atribuicao.current = lerAtribuicao(window.location.search);
  }, []);

  const pedido = [
    dormitoriosMin ? `${dormitoriosMin}+ dormitórios` : null,
    regiao ? `em ${regiao}` : null,
    precoMax ? `até R$ ${Math.round(precoMax / 1000).toLocaleString("pt-BR")} mil` : null,
  ].filter(Boolean);

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const dados = new FormData(form);
    setStatus("enviando");
    setErro(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: String(dados.get("nome") ?? ""),
          telefone: String(dados.get("telefone") ?? ""),
          mensagem: pedido.length ? `Quer ser avisado quando surgir: ${pedido.join(", ")}.` : "Quer ser avisado de imóveis novos.",
          origem: "site/me-avise",
          tipo: "comprador",
          alerta: true,
          interesse: { regiao, dormitoriosMin, precoMax },
          favoritos: lerFavoritos(),
          consentimentoLgpd: dados.get("lgpd") === "on",
          empresa: String(dados.get("empresa") ?? ""),
          elapsedMs: montadoEm.current == null ? null : Date.now() - montadoEm.current,
          atribuicao: atribuicao.current,
        }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("erro");
        setErro(corpo.erro ?? "Não foi possível enviar. Tente de novo.");
        return;
      }
      setStatus("ok");
      form.reset();
    } catch {
      setStatus("erro");
      setErro("Sem conexão agora. Tente de novo em instantes.");
    }
  }

  return (
    <section
      aria-labelledby="aviseme-titulo"
      className="mx-auto mt-14 w-full max-w-6xl rounded-3xl border border-linha-forte bg-superficie p-6 shadow-md sm:p-8"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div>
          <p className="text-fluid-xs inline-flex items-center gap-2 font-semibold uppercase tracking-wider text-acento">
            <BellRing className="h-4 w-4" aria-hidden /> Me avise quando surgir
          </p>
          <h2 id="aviseme-titulo" className="text-fluid-2xl mt-2 font-display text-titulo">
            {poucosResultados ? "Não achou o que procura?" : "Quer saber primeiro dos próximos?"}
          </h2>
          <p className="text-fluid-sm mt-2 text-apoio">
            Deixe seu WhatsApp. Quando entrar no catálogo um imóvel que combine, você recebe uma mensagem com
            fotos e a apresentação.
          </p>
          {pedido.length > 0 && (
            <p className="text-fluid-sm mt-3 text-corpo">
              Seu pedido: <strong className="text-titulo">{pedido.join(", ")}</strong>. Para mudar, ajuste os
              filtros acima.
            </p>
          )}
        </div>

        {status === "ok" ? (
          <div role="status" className="rounded-2xl border border-brand-400/40 bg-marca-fundo/30 p-6 text-center">
            <p className="font-display text-lg text-titulo">Pronto, anotado!</p>
            <p className="text-fluid-sm mt-2 text-apoio">
              Quando surgir um imóvel assim, avisamos no seu WhatsApp. Você pode pedir para parar a qualquer momento.
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} className="relative space-y-3">
            <div className="absolute -left-[9999px]" aria-hidden="true">
              <label htmlFor="aviseme-empresa">Deixe em branco</label>
              <input id="aviseme-empresa" name="empresa" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="aviseme-nome" className="text-fluid-sm mb-1.5 block text-apoio">
                  Nome
                </label>
                <input id="aviseme-nome" name="nome" required minLength={2} maxLength={120} autoComplete="name" className={CAMPO} />
              </div>
              <div>
                <label htmlFor="aviseme-telefone" className="text-fluid-sm mb-1.5 block text-apoio">
                  WhatsApp
                </label>
                <input
                  id="aviseme-telefone"
                  name="telefone"
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  className={CAMPO}
                />
              </div>
            </div>
            <label className="flex items-start gap-2.5 text-legenda">
              <input type="checkbox" name="lgpd" required className="mt-1 h-4 w-4 shrink-0 accent-brand-500" />
              <span className="text-fluid-xs">
                Aceito receber mensagens sobre imóveis no WhatsApp, conforme a{" "}
                <Link href="/privacidade" className="text-acento underline underline-offset-4">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>
            {status === "erro" && erro && (
              <p role="alert" className="text-fluid-sm text-perigo">
                {erro}
              </p>
            )}
            <button
              type="submit"
              disabled={status === "enviando"}
              className="botao-vivo min-h-11 w-full rounded-full bg-brand-500 px-7 py-3 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-60"
            >
              {status === "enviando" ? "Enviando…" : "Quero ser avisado"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
