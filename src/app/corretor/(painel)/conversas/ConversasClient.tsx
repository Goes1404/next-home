"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  avaliarUltimaResposta,
  lerMensagens,
  retomarBotNaConversa,
  silenciarBotNaConversa,
  type MensagemConversa,
} from "./acoes";

export type ConversaResumo = {
  id: string;
  telefone: string;
  nome: string | null;
  botAtivo: boolean;
  pausadoAte: string | null;
  ultimaMensagem: string | null;
  ultimaInteracaoEm: string;
  temLead: boolean;
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** "5511991234567" → "(11) 99123-4567", que é como o corretor reconhece o cliente. */
function telefoneLegivel(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return e164;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

type Estado = "ativa" | "pausada_humano" | "desligada";

function estadoDa(conversa: ConversaResumo): Estado {
  if (!conversa.botAtivo) return "desligada";
  const pausada = conversa.pausadoAte && new Date(conversa.pausadoAte).getTime() > Date.now();
  return pausada ? "pausada_humano" : "ativa";
}

const SELO: Record<Estado, { texto: string; classe: string }> = {
  ativa: { texto: "IA atendendo", classe: "border-ok-linha bg-ok-lavado text-ok" },
  pausada_humano: {
    texto: "IA em pausa",
    classe: "border-alerta-linha bg-alerta-lavado text-alerta",
  },
  desligada: { texto: "IA desligada", classe: "border-linha bg-vidro-forte text-apoio" },
};

export function ConversasClient({ conversas }: { conversas: ConversaResumo[] }) {
  const [erro, setErro] = useState<string | null>(null);

  if (conversas.length === 0) {
    return (
      <div className="border-linha bg-superficie shadow-painel mt-8 rounded-2xl border p-6">
        <p className="text-fluid-sm text-corpo">
          Nenhuma conversa ainda. Assim que alguém escrever para o número conectado, ela aparece
          aqui — e você vê na hora se a IA respondeu ou ficou de fora.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-3">
      {erro && (
        <p role="alert" className="text-fluid-sm text-perigo">
          {erro}
        </p>
      )}

      {conversas.map((conversa) => (
        <CartaoConversa key={conversa.id} conversa={conversa} onErro={setErro} />
      ))}
    </div>
  );
}

function CartaoConversa({
  conversa,
  onErro,
}: {
  conversa: ConversaResumo;
  onErro: (e: string | null) => void;
}) {
  const [estado, setEstado] = useState<Estado>(estadoDa(conversa));
  const [mensagens, setMensagens] = useState<MensagemConversa[] | null>(null);
  const [aberta, setAberta] = useState(false);
  const [pendente, iniciar] = useTransition();

  const selo = SELO[estado];

  function alternarBot() {
    onErro(null);
    // O estado muda antes da resposta; se o servidor recusar, volta ao que
    // era. Sem isso o corretor clica de novo achando que não pegou.
    const anterior = estado;
    const proximo: Estado = estado === "ativa" ? "desligada" : "ativa";
    setEstado(proximo);

    iniciar(async () => {
      const resultado =
        proximo === "ativa"
          ? await retomarBotNaConversa(conversa.id)
          : await silenciarBotNaConversa(conversa.id);

      if (resultado.erro) {
        setEstado(anterior);
        onErro(resultado.erro);
      }
    });
  }

  function verConversa() {
    setAberta((v) => !v);
    if (mensagens) return;
    iniciar(async () => setMensagens(await lerMensagens(conversa.id)));
  }

  // Loop de melhoria: "ruim" vira caso de teste do eval da IA (ver
  // avaliarUltimaResposta). O aviso curto confirma que o clique valeu.
  const [avaliacaoFeita, setAvaliacaoFeita] = useState<string | null>(null);
  function avaliar(nota: "boa" | "ruim") {
    onErro(null);
    iniciar(async () => {
      const resultado = await avaliarUltimaResposta(conversa.id, nota);
      if (resultado.erro) onErro(resultado.erro);
      else setAvaliacaoFeita(resultado.ok ?? "Registrado.");
    });
  }

  return (
    <article className="border-linha bg-superficie shadow-painel rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-titulo text-lg">
            {conversa.nome || telefoneLegivel(conversa.telefone)}
          </p>
          <p className="text-fluid-xs text-tenue mt-0.5">
            {conversa.nome ? `${telefoneLegivel(conversa.telefone)} · ` : ""}
            {dataHora.format(new Date(conversa.ultimaInteracaoEm))}
            {!conversa.temLead && " · sem ficha no funil"}
          </p>
        </div>

        <span
          className={cn("text-fluid-xs h-fit rounded-full border px-2.5 py-1 font-medium", selo.classe)}
        >
          {selo.texto}
        </span>
      </div>

      {conversa.ultimaMensagem && (
        <p className="text-fluid-sm bg-elevado border-linha text-corpo mt-3 line-clamp-2 rounded-xl border px-4 py-3">
          {conversa.ultimaMensagem}
        </p>
      )}

      {estado === "pausada_humano" && conversa.pausadoAte && (
        <p className="text-fluid-xs text-apoio mt-2">
          Você respondeu por aqui, então a IA se calou até{" "}
          {dataHora.format(new Date(conversa.pausadoAte))}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={alternarBot}
          disabled={pendente}
          className={cn(
            "flex min-h-11 cursor-pointer items-center rounded-full px-5 text-sm font-medium transition-colors disabled:opacity-60",
            estado === "ativa"
              ? "border-linha-forte text-corpo hover:bg-vidro border"
              : "bg-acento hover:bg-acento-hover text-white",
          )}
        >
          {estado === "ativa" ? "Desligar IA aqui" : "Reativar IA agora"}
        </button>

        {avaliacaoFeita ? (
          <span className="text-fluid-xs text-ok px-2">{avaliacaoFeita}</span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => avaliar("boa")}
              disabled={pendente}
              title="A última resposta da IA foi boa"
              className="border-linha text-apoio hover:text-ok flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm transition-colors disabled:opacity-60"
            >
              👍 IA
            </button>
            <button
              type="button"
              onClick={() => avaliar("ruim")}
              disabled={pendente}
              title="A última resposta da IA foi ruim — vira caso de teste"
              className="border-linha text-apoio hover:text-perigo flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm transition-colors disabled:opacity-60"
            >
              👎 IA
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={verConversa}
          disabled={pendente}
          className="border-linha text-apoio hover:text-titulo flex min-h-11 cursor-pointer items-center rounded-full border px-5 text-sm transition-colors disabled:opacity-60"
        >
          {aberta ? "Fechar conversa" : "Ver conversa"}
        </button>
      </div>

      {aberta && (
        <div className="border-linha mt-4 space-y-2 border-t pt-4">
          {mensagens === null ? (
            <p className="text-fluid-xs text-tenue">Carregando…</p>
          ) : mensagens.length === 0 ? (
            <p className="text-fluid-xs text-tenue">Sem mensagens registradas.</p>
          ) : (
            mensagens.map((m) => <Balao key={m.id} mensagem={m} />)
          )}
        </div>
      )}
    </article>
  );
}

const AUTOR: Record<MensagemConversa["remetente"], { rotulo: string; classe: string }> = {
  cliente: { rotulo: "Cliente", classe: "bg-elevado border-linha text-corpo" },
  bot: { rotulo: "IA", classe: "bg-acento-lavado border-acento-linha text-corpo ml-auto" },
  corretor: { rotulo: "Você", classe: "bg-vidro-forte border-linha text-corpo ml-auto" },
};

function Balao({ mensagem }: { mensagem: MensagemConversa }) {
  const autor = AUTOR[mensagem.remetente];

  return (
    <div className={cn("max-w-[85%] rounded-2xl border px-4 py-2.5", autor.classe)}>
      <p className="text-tenue text-[11px] font-medium tracking-wide uppercase">
        {autor.rotulo} · {dataHora.format(new Date(mensagem.criadoEm))}
      </p>
      <p className="text-fluid-sm mt-0.5 whitespace-pre-line">{mensagem.conteudo}</p>
    </div>
  );
}
