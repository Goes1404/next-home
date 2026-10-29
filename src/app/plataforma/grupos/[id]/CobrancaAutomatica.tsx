"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import {
  desligarCobrancaAutomatica,
  ligarCobrancaAutomatica,
  type ResultadoDaCobrancaAutomatica,
} from "../../cobrancaAutomaticaAcoes";

const BOTAO_PRINCIPAL =
  "text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60";
const BOTAO_SECUNDARIO =
  "botao-secundario text-fluid-sm text-titulo flex min-h-11 cursor-pointer items-center rounded-xl px-4 font-medium disabled:opacity-60";

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** `AAAA-MM-DD` → `DD/MM/AAAA`. */
const data = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

/**
 * A cobrança automática do grupo pelo Asaas (29/10/2026, 0241), na tela do
 * grupo da plataforma. Sem as variáveis de ambiente, só diz quais faltam.
 * Ligar cria o cliente e a assinatura mensal (o cliente escolhe Pix, boleto
 * ou cartão na fatura); desligar cancela a assinatura. Os pagamentos chegam
 * pelo webhook e aparecem no histórico da Cobrança, logo abaixo.
 */
export function CobrancaAutomatica({
  grupoId,
  faltando,
  isento,
  assinaturaId,
  fatura,
  mensalidade,
  temDocumento,
}: {
  grupoId: string;
  /** Variáveis de ambiente que faltam; vazio = configurado. */
  faltando: string[];
  /** Plano de preço de custo: nunca cobrado. */
  isento: boolean;
  assinaturaId: string | null;
  /** A fatura em aberto da assinatura, lida no Asaas ao abrir a página. */
  fatura: { url: string; vencimento: string; valor: number } | null;
  mensalidade: number | null;
  temDocumento: boolean;
}) {
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();

  const agir = (acao: () => Promise<ResultadoDaCobrancaAutomatica>, sucesso: string) =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await acao();
        setAviso(r.ok ? { texto: r.aviso ?? sucesso, erro: false } : { texto: r.erro, erro: true });
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-cobranca-automatica">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="titulo-cobranca-automatica" className="text-fluid-sm text-titulo font-bold">
          Cobrança automática (Asaas)
        </h2>
        {faltando.length === 0 && !isento && (
          <span
            className={`text-fluid-xs rounded-full border px-2.5 py-1 ${
              assinaturaId ? "bg-ok-lavado text-ok border-ok-linha" : "bg-campo text-apoio border-linha-forte"
            }`}
          >
            {assinaturaId ? "Ligada" : "Desligada"}
          </span>
        )}
      </div>

      {isento ? (
        <p className="text-fluid-sm text-apoio">Plano de preço de custo: não é cobrado.</p>
      ) : faltando.length > 0 ? (
        <p className="text-fluid-sm text-apoio">
          Não configurada neste ambiente. Falta na Vercel: <span className="text-titulo font-medium">{faltando.join(", ")}</span>.
        </p>
      ) : assinaturaId ? (
        <>
          <p className="text-fluid-sm text-apoio">
            Assinatura mensal no Asaas. O cliente escolhe Pix, boleto ou cartão na fatura, e cada pagamento entra sozinho no
            histórico da Cobrança.
          </p>
          {fatura ? (
            <p className="text-fluid-sm text-titulo">
              Fatura em aberto: {REAIS.format(fatura.valor)}, vence em {data(fatura.vencimento)}.{" "}
              <a href={fatura.url} target="_blank" rel="noopener noreferrer" className="text-acento font-semibold underline">
                Abrir fatura
              </a>
            </p>
          ) : (
            <p className="text-fluid-sm text-apoio">Nenhuma fatura em aberto agora.</p>
          )}
          <div>
            <button
              type="button"
              className={BOTAO_SECUNDARIO}
              disabled={pendente}
              onClick={() => {
                if (!window.confirm("Desligar a cobrança automática? A assinatura será cancelada no Asaas.")) return;
                agir(() => desligarCobrancaAutomatica(grupoId), "Cobrança automática desligada.");
              }}
            >
              {pendente ? "Desligando…" : "Desligar"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-fluid-sm text-apoio">
            Cria o cliente e uma assinatura mensal de{" "}
            <span className="text-titulo">{mensalidade ? REAIS.format(mensalidade) : "(mensalidade não definida)"}</span> no
            Asaas.
            {!temDocumento && " Antes, cadastre o CPF ou CNPJ em Dados do grupo: o Asaas exige."}
          </p>
          <div>
            <button
              type="button"
              className={BOTAO_PRINCIPAL}
              disabled={pendente || !mensalidade || !temDocumento}
              onClick={() => {
                if (
                  !window.confirm(
                    `Ligar a cobrança automática de ${mensalidade ? REAIS.format(mensalidade) : ""} por mês? O Asaas passa a emitir as faturas deste grupo.`,
                  )
                )
                  return;
                agir(() => ligarCobrancaAutomatica(grupoId), "Cobrança automática ligada.");
              }}
            >
              {pendente ? "Ligando…" : "Ligar cobrança automática"}
            </button>
          </div>
        </>
      )}

      {aviso && (
        <p
          role={aviso.erro ? "alert" : "status"}
          className={`text-fluid-sm rounded-xl border px-4 py-3 ${
            aviso.erro ? "border-perigo-linha bg-perigo-lavado text-perigo" : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </section>
  );
}
