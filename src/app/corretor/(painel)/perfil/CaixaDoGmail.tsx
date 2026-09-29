"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { desconectarGmail } from "./gmailAcoes";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";

const MENSAGEM_DA_VOLTA: Record<string, string> = {
  ok: "Gmail conectado. Os e-mails dos portais passam a virar leads sozinhos, em poucos minutos.",
  expirou: "A conexão demorou demais ou veio de outra aba. Tente de novo.",
  recusado: "Você não autorizou no Google. Nada foi conectado.",
  "sem-permissao": "Faltou marcar a permissão de ler e-mails na tela do Google. Tente de novo e deixe a caixa marcada.",
  "nao-configurado": "A conexão com o Google ainda não foi configurada nesta instalação. Fale com o gestor.",
  erro: "O Google não completou a conexão. Tente de novo.",
};

/**
 * Leads do Gmail sem intermediário (0125). O corretor conecta a própria
 * caixa; só e-mails dos portais são lidos, e o lead nasce na carteira dele.
 */
export function CaixaDoGmail({
  conta,
  configurado,
  volta,
}: {
  conta: { email: string; ultimaLeitura: string | null; erro: string | null; lidos: number } | null;
  configurado: boolean;
  volta: string | null;
}) {
  const [msg, setMsg] = useState<string | null>(volta ? (MENSAGEM_DA_VOLTA[volta] ?? null) : null);
  const [pendente, iniciar] = useTransition();
  const desconectar = () =>
    iniciar(async () => {
      try {
        const r = await desconectarGmail();
        setMsg(r.erro ?? r.ok ?? null);
      } catch (e) {
        setMsg(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });

  return (
    <section className="space-y-3">
      <h2 className="text-fluid-base flex items-center gap-2 font-semibold text-titulo">
        <Mail className="h-4 w-4 text-acento" aria-hidden /> Leads dos portais pelo seu Gmail
      </h2>
      {!conta ? (
        <>
          <p className="text-fluid-sm text-apoio">
            Conecte o Gmail que recebe os avisos do ZAP, VivaReal, OLX e Imovelweb. Só os e-mails desses portais são
            lidos; a permissão é só de leitura. Cada lead entra na sua carteira e a assistente faz o primeiro
            contato.
          </p>
          {configurado ? (
            <a href="/api/gmail/conectar" className="inline-flex min-h-11 items-center rounded-full bg-acento px-5 text-sm font-semibold text-sobre-cor">
              Conectar Gmail
            </a>
          ) : (
            <p className="text-fluid-xs text-tenue">Ainda não disponível nesta instalação (falta configurar o Google).</p>
          )}
        </>
      ) : (
        <>
          <p className="text-fluid-sm text-corpo">
            Conectado: <strong className="break-all text-titulo">{conta.email}</strong>
            {conta.lidos > 0 && ` · ${conta.lidos} e-mails lidos`}
          </p>
          {conta.erro ? (
            <p role="alert" className="text-fluid-xs text-perigo">
              A leitura parou ({conta.erro === "invalid_grant" ? "o acesso foi revogado ou venceu" : conta.erro}). Reconecte
              para voltar a receber.
            </p>
          ) : (
            <p className="text-fluid-xs text-apoio">
              {conta.ultimaLeitura
                ? `Última leitura: ${new Date(conta.ultimaLeitura).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
                : "A primeira leitura acontece nos próximos minutos (últimas 48h)."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {conta.erro && configurado && (
              <a href="/api/gmail/conectar" className="inline-flex min-h-11 items-center rounded-full bg-acento px-5 text-sm font-semibold text-sobre-cor">
                Reconectar
              </a>
            )}
            <button
              type="button"
              onClick={desconectar}
              disabled={pendente}
              className="min-h-11 rounded-full border border-linha-forte px-5 text-sm text-titulo disabled:opacity-60"
            >
              Desconectar
            </button>
          </div>
        </>
      )}
      {msg && (
        <p role="status" className="text-fluid-xs text-apoio">
          {msg}
        </p>
      )}
    </section>
  );
}
