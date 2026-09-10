"use client";

import type { ContextoDaInteracao } from "@/lib/whatsapp/contextoDaInteracao";

/**
 * "Por que ela disse isso" — o contexto da resposta, embaixo do balão.
 *
 * O 👍/👎 existe desde a 0040 e pede um julgamento que ninguém tem como
 * fazer olhando só o texto: a mesma frase é ótima quando ela sabia o
 * orçamento e péssima quando o cliente já tinha dito a região três vezes.
 *
 * O que aparece aqui é a DECISÃO, não o prompt (ver `contextoDaInteracao.ts`)
 * — e em português de gente, não em nome de campo: quem lê é a corretora, não
 * quem escreveu o planner.
 */

/** O que o planner mandou fazer, dito como alguém diria. */
const NOME_DA_JOGADA: Record<string, string> = {
  responder_dado: "responder o que ele perguntou",
  responder_honesto: "dizer que não tem esse dado",
  perguntar: "avançar o funil",
  convidar_visita: "convidar para conhecer",
  propor_horario: "oferecer horário",
  confirmar_visita: "confirmar a visita",
  agendar: "marcar o horário que ele pediu",
  tratar_objecao: "tratar a objeção",
  indicar_alternativa: "oferecer outra opção",
  deixar_porta_aberta: "deixar a porta aberta",
  encerrar_confirmado: "encerrar — visita já marcada",
  devolver_escolha: "devolver a escolha para ele",
};

const NOME_DO_ASSUNTO: Record<string, string> = {
  regiao: "região",
  estagio: "pronto ou na planta",
  tipologia: "dormitórios",
  capacidade: "renda e financiamento",
};

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function descreverJogada(jogada: ContextoDaInteracao["jogada"]): string {
  const nome = NOME_DA_JOGADA[jogada.tipo] ?? jogada.tipo;
  if (jogada.tipo === "perguntar") {
    return `${nome} — perguntar ${NOME_DO_ASSUNTO[jogada.assunto] ?? jogada.assunto}`;
  }
  if (jogada.tipo === "responder_dado") return `${nome} (${jogada.dado})`;
  if (jogada.tipo === "indicar_alternativa") return `${nome}: ${jogada.nome}`;
  return nome;
}

/** As linhas do dossiê que TÊM valor. Campo vazio não vira linha. */
function oQueEleJaDisse(dossie: ContextoDaInteracao["dossie"]): string[] {
  if (!dossie) return [];
  const linhas: string[] = [];
  if (dossie.regiao) linhas.push(dossie.regiao);
  if (dossie.dormitorios) linhas.push(`${dossie.dormitorios} dorm.`);
  if (dossie.orcamentoMax) linhas.push(`até ${moeda.format(dossie.orcamentoMax)}`);
  if (dossie.rendaMensal) linhas.push(`renda ${moeda.format(dossie.rendaMensal)}`);
  if (dossie.formaPagamento) linhas.push(dossie.formaPagamento);
  return linhas;
}

export function PorQue({ contexto }: { contexto: ContextoDaInteracao | null }) {
  if (!contexto) {
    return (
      <p className="text-wa-meta text-[12px] leading-relaxed">
        Contexto não registrado — esta resposta é anterior a esta versão.
      </p>
    );
  }

  const sabia = oQueEleJaDisse(contexto.dossie);
  const h = contexto.historico;

  return (
    <dl className="text-[12px] leading-relaxed">
      <div className="flex gap-1.5">
        <dt className="text-wa-meta shrink-0">Falando de:</dt>
        <dd className="text-wa-texto min-w-0">
          {contexto.foco ? contexto.foco.nome : "nenhum imóvel — ela estava no catálogo"}
        </dd>
      </div>

      <div className="flex gap-1.5">
        <dt className="text-wa-meta shrink-0">Tentou:</dt>
        <dd className="text-wa-texto min-w-0">{descreverJogada(contexto.jogada)}</dd>
      </div>

      <div className="flex gap-1.5">
        <dt className="text-wa-meta shrink-0">Sabia:</dt>
        <dd className="text-wa-texto min-w-0">
          {sabia.length > 0 ? sabia.join(" · ") : "nada ainda sobre o que ele procura"}
        </dd>
      </div>

      <div className="flex gap-1.5">
        <dt className="text-wa-meta shrink-0">Leu:</dt>
        <dd className="text-wa-texto min-w-0">
          {h.total} {h.total === 1 ? "mensagem" : "mensagens"} · {h.doCliente} dele · {h.doBot} dela
          {h.doCorretor > 0 && ` · ${h.doCorretor} suas`}
          {contexto.fewShot > 0 &&
            ` · ${contexto.fewShot} ${contexto.fewShot === 1 ? "exemplo" : "exemplos"}`}
        </dd>
      </div>

      {/*
        Só aparece quando existe. Número bom não vira linha — repetir "0 sem
        texto" em toda resposta é como um aviso deixa de ser lido, a mesma
        régua do `evolucaoConversa` e da faixa de queda de conexão.
      */}
      {h.emBranco > 0 && (
        <p className="text-alerta mt-1">
          {h.emBranco} {h.emBranco === 1 ? "fala não foi guardada" : "falas não foram guardadas"}{" "}
          (conversa travada na época) — a IA não recebeu {h.emBranco === 1 ? "ela" : "elas"}.
        </p>
      )}
    </dl>
  );
}
