"use client";

import { useState, useTransition } from "react";
import { BadgeCheck } from "lucide-react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  assumirConversaOficial,
  devolverConversaParaIA,
  registrarConsentimentoDeOfertas,
  responderPeloNumeroOficial,
} from "./numeroOficialAcoes";

/**
 * A conversa do lead no número oficial da imobiliária, na ficha (F3). Só o
 * corretor dono chega aqui (`NumeroOficial.tsx` confere). As ações moram em
 * `numeroOficialAcoes.ts`, que confere de novo pela sessão.
 */

export type PainelNaTela = {
  numero: { numero: string | null; nomeExibicao: string | null; ativo: boolean; resposta: "ia" | "mensagem_fixa" | "nenhuma" };
  conversa: null | {
    id: string;
    telefone: string;
    janelaAberta: boolean;
    janelaAte: string | null;
    iaAtiva: boolean;
    assumidaEm: string | null;
    mensagens: { id: string; remetente: "cliente" | "bot" | "corretor" | "sistema"; conteudo: string; status: string | null; em: string }[];
  };
  consentimento: { estado: "concedido" | "revogado" | "sem_registro"; desde: string | null; origem: string | null };
};

const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const QUEM: Record<string, string> = { cliente: "Cliente", bot: "IA", corretor: "Você", sistema: "Lista" };

const ORIGEM: Record<string, string> = {
  painel_corretor: "registrado pelo corretor",
  formulario_site: "no formulário do site",
  botao_parar: "pelo botão “parar” da lista",
  mensagem_parar: "pedindo para parar, por mensagem",
  meta_131050: "a Meta avisou que ele parou de receber marketing",
};

const botao =
  "text-fluid-xs border-linha-forte text-corpo hover:text-titulo inline-flex min-h-10 items-center rounded-xl border px-3 transition-colors disabled:opacity-60";

export function PainelDoNumeroOficial({ leadId, nome, painel }: { leadId: string; nome: string; painel: PainelNaTela }) {
  const [texto, setTexto] = useState("");
  const [avisar, setAvisar] = useState(true);
  const [enviando, iniciar] = useTransition();
  const { avisar: avisarNaTela, falhar } = useAvisos();
  const { conversa, consentimento, numero } = painel;
  const primeiroNome = nome.split(" ")[0] || nome;

  function rodar(acao: () => Promise<{ ok: string; link?: string } | { erro: string }>, aoConseguir?: () => void) {
    iniciar(async () => {
      const r = await acao();
      if ("erro" in r) {
        falhar(r.erro);
        return;
      }
      avisarNaTela(r.ok);
      aoConseguir?.();
      if (r.link) window.open(r.link, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <section
      id="numero-oficial"
      className="scroll-mt-24 rounded-2xl border border-linha bg-elevado p-4 sm:p-5"
      aria-labelledby="numero-oficial-titulo"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-acento-lavado text-acento-suave">
          <BadgeCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="numero-oficial-titulo" className="text-fluid-base font-medium text-titulo">
            Número oficial da imobiliária
          </h2>
          <p className="text-fluid-xs mt-1 text-tenue">
            {[numero.nomeExibicao, numero.numero ? `+${numero.numero}` : null, numero.ativo ? null : "pausado"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {/* Ofertas pelo WhatsApp: é o que deixa o lead entrar na lista oficial. */}
      <div className="mt-4 rounded-xl border border-linha p-3">
        <p className="text-fluid-sm text-titulo">
          Ofertas pelo WhatsApp:{" "}
          {consentimento.estado === "concedido" ? (
            <strong className="text-ok">autorizadas</strong>
          ) : consentimento.estado === "revogado" ? (
            <strong className="text-perigo">não quer receber</strong>
          ) : (
            <strong className="text-apoio">sem autorização registrada</strong>
          )}
        </p>
        {consentimento.desde && (
          <p className="text-fluid-xs mt-0.5 text-tenue">
            Desde {quando.format(new Date(consentimento.desde))}
            {consentimento.origem && `, ${ORIGEM[consentimento.origem] ?? consentimento.origem}`}.
          </p>
        )}
        <p className="text-fluid-xs mt-1 text-tenue">
          Só entra na lista pelo número oficial quem autorizou. Registre só o que {primeiroNome} disse a você.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {consentimento.estado !== "concedido" && (
            <button
              type="button"
              disabled={enviando}
              onClick={() => rodar(() => registrarConsentimentoDeOfertas(leadId, true))}
              className={botao}
            >
              {primeiroNome} autorizou ofertas
            </button>
          )}
          {consentimento.estado !== "revogado" && (
            <button
              type="button"
              disabled={enviando}
              onClick={() => rodar(() => registrarConsentimentoDeOfertas(leadId, false))}
              className={`${botao} hover:text-perigo`}
            >
              Não quer ofertas
            </button>
          )}
        </div>
      </div>

      {!conversa ? (
        <p className="text-fluid-xs mt-4 text-tenue">
          {primeiroNome} ainda não respondeu ao número oficial. Quando responder a uma lista, a conversa aparece aqui e você é
          avisado no celular.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-fluid-xs text-apoio">
            {conversa.janelaAberta && conversa.janelaAte
              ? `Janela aberta até ${quando.format(new Date(conversa.janelaAte))}: dá para responder por aqui.`
              : "Passaram 24 h desde a última mensagem do cliente: pelo número oficial agora só sai modelo aprovado."}
            {" "}
            {conversa.assumidaEm
              ? `Você assumiu em ${quando.format(new Date(conversa.assumidaEm))}.`
              : conversa.iaAtiva && numero.resposta === "ia"
                ? "A IA está respondendo até você assumir."
                : "Ninguém responde por lá sem você."}
          </p>

          <ol className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {conversa.mensagens.map((m) => (
              <li
                key={m.id}
                className={`text-fluid-sm max-w-[85%] rounded-xl px-3 py-2 whitespace-pre-wrap break-words ${
                  m.remetente === "cliente" ? "bg-vidro text-corpo" : "ml-auto bg-acento-lavado text-titulo"
                }`}
              >
                <span className="text-tenue block text-[11px]">
                  {QUEM[m.remetente] ?? m.remetente} · {quando.format(new Date(m.em))}
                  {m.status === "falhou" && " · não entregue"}
                  {m.status === "lida" && " · lida"}
                </span>
                {m.conteudo}
              </li>
            ))}
          </ol>

          {conversa.janelaAberta && numero.ativo && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                rodar(() => responderPeloNumeroOficial(leadId, conversa.id, texto), () => setTexto(""));
              }}
            >
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                maxLength={4096}
                placeholder={`Responder ${primeiroNome} pelo número oficial`}
                className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento w-full rounded-xl border px-3 py-2 focus:outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-fluid-xs text-tenue">Ao responder por aqui, a IA para nesta conversa.</p>
                <button
                  type="submit"
                  disabled={enviando || !texto.trim()}
                  className="bg-acento hover:bg-acento-hover text-fluid-xs text-sobre-cor min-h-10 rounded-xl px-4 font-medium disabled:opacity-60"
                >
                  {enviando ? "Enviando…" : "Enviar pelo número oficial"}
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {conversa.assumidaEm ? (
              <a
                href={`https://wa.me/${conversa.telefone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-acento hover:bg-acento-hover text-fluid-xs text-sobre-cor inline-flex min-h-10 items-center rounded-xl px-4 font-medium"
              >
                Abrir no meu WhatsApp
              </a>
            ) : (
              <button
                type="button"
                disabled={enviando}
                onClick={() => rodar(() => assumirConversaOficial(leadId, conversa.id, avisar && conversa.janelaAberta && numero.ativo))}
                className="bg-acento hover:bg-acento-hover text-fluid-xs text-sobre-cor min-h-10 rounded-xl px-4 font-medium disabled:opacity-60"
              >
                Assumir pelo meu WhatsApp
              </button>
            )}
            {!conversa.assumidaEm && conversa.janelaAberta && numero.ativo && (
              <label className="text-fluid-xs text-apoio inline-flex min-h-10 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={avisar}
                  onChange={(e) => setAvisar(e.target.checked)}
                  className="accent-acento h-4 w-4"
                />
                Avisar {primeiroNome} pelo número oficial antes
              </label>
            )}
            {conversa.assumidaEm && numero.resposta === "ia" && (
              <button
                type="button"
                disabled={enviando}
                onClick={() => rodar(() => devolverConversaParaIA(leadId, conversa.id))}
                className={botao}
              >
                Devolver para a IA
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
