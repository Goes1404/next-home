"use client";

import { useState } from "react";
import type { ModoBotWhatsapp, StatusConexaoWhatsapp, TomVozBot } from "@/lib/whatsapp/types";
import { ConfiguracaoIA } from "./_componentes/ConfiguracaoIA";
import { PainelConexao } from "./_componentes/PainelConexao";
import { PlaygroundIA } from "./_componentes/PlaygroundIA";

/**
 * A casca da tela de WhatsApp & IA — três abas, um assunto cada.
 *
 * Antes isto era um único arquivo de 957 linhas com 24 estados e 31 botões:
 * conexão, personalidade da IA, palavras-chave e playground competindo pela
 * mesma tela. Quem abria pela primeira vez não sabia por onde começar
 * (roadmap F4).
 *
 * A ordem das abas é a do uso: conectar acontece uma vez, ajustar de vez em
 * quando, testar sempre que mudar alguma coisa. E há uma dependência real —
 * sem número conectado, a IA não atende ninguém —, por isso a aba de conexão
 * mostra um aviso enquanto o número não está no ar.
 */

interface Props {
  corretorNome: string;
  /** WhatsApp do cadastro, usado só para pré-preencher o campo de pareamento. */
  whatsappCadastro?: string;
  /** Configuração já gravada, quando a instância existe. */
  configInicial?: {
    nomeAssistente: string;
    tomVoz: TomVozBot;
    modoBot: ModoBotWhatsapp;
    statusConexao: StatusConexaoWhatsapp;
    telefoneConectado: string | null;
    /** Frase que, digitada pelo próprio corretor no chat, "liga" a IA na conversa. */
    palavraChaveAtivacao: string | null;
    palavraChaveTeste: string | null;
    palavrasEntradaCliente: string | null;
  } | null;
}

type Aba = "conexao" | "ia" | "teste";

const ABAS: { valor: Aba; label: string }[] = [
  { valor: "conexao", label: "Conexão" },
  { valor: "ia", label: "Sua IA" },
  { valor: "teste", label: "Testar" },
];

export function WhatsappManager({ corretorNome, whatsappCadastro, configInicial }: Props) {
  const conectadoDeInicio = configInicial?.statusConexao === "conectado";

  // Quem nunca conectou cai na aba de conexão; quem já conectou provavelmente
  // veio ajustar ou testar, e a primeira aba deixa de ser o assunto.
  const [aba, setAba] = useState<Aba>(conectadoDeInicio ? "ia" : "conexao");
  const [conectado, setConectado] = useState(conectadoDeInicio);
  const [nomeAssistente, setNomeAssistente] = useState(configInicial?.nomeAssistente ?? "Sofia");

  return (
    <div className="space-y-6">
      <nav aria-label="Seções do WhatsApp">
        <div className="border-linha bg-superficie inline-flex rounded-full border p-1">
          {ABAS.map(({ valor, label }) => (
            <button
              key={valor}
              type="button"
              onClick={() => setAba(valor)}
              aria-current={aba === valor ? "page" : undefined}
              className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm transition-colors ${
                aba === valor ? "bg-acento font-medium text-sobre-cor" : "text-apoio hover:text-titulo"
              }`}
            >
              {label}
              {valor === "conexao" && (
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${conectado ? "bg-ok" : "bg-perigo"}`}
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Sem número conectado, ajustar tom de voz não serve de nada — o aviso
          leva de volta ao que falta em vez de deixar o corretor configurar
          um atendimento que não vai acontecer. */}
      {!conectado && aba !== "conexao" && (
        <p className="text-fluid-xs text-alerta border-alerta-linha bg-alerta-lavado rounded-xl border px-4 py-3">
          Seu número ainda não está conectado — a IA não vai atender ninguém até isso acontecer.{" "}
          <button
            type="button"
            onClick={() => setAba("conexao")}
            className="cursor-pointer font-semibold underline underline-offset-2"
          >
            Conectar agora
          </button>
        </p>
      )}

      {aba === "conexao" && (
        <PainelConexao
          corretorNome={corretorNome}
          whatsappCadastro={whatsappCadastro}
          statusInicial={configInicial?.statusConexao ?? "desconectado"}
          telefoneInicial={configInicial?.telefoneConectado ?? null}
          aoConectar={setConectado}
        />
      )}

      {aba === "ia" && (
        <ConfiguracaoIA
          inicial={
            configInicial
              ? {
                  nomeAssistente: configInicial.nomeAssistente,
                  tomVoz: configInicial.tomVoz,
                  modoBot: configInicial.modoBot,
                  palavraChaveAtivacao: configInicial.palavraChaveAtivacao,
                  palavraChaveTeste: configInicial.palavraChaveTeste,
                  palavrasEntradaCliente: configInicial.palavrasEntradaCliente,
                }
              : null
          }
          aoMudarNome={setNomeAssistente}
        />
      )}

      {aba === "teste" && (
        <PlaygroundIA nomeAssistente={nomeAssistente} corretorNome={corretorNome} />
      )}
    </div>
  );
}
