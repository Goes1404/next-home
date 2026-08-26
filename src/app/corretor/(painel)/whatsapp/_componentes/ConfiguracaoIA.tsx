"use client";

import { useState } from "react";
import { Bot, BellOff, Moon, Timer } from "lucide-react";
import { EXPEDIENTE, MINUTOS_COPILOTO, listarPalavrasChave } from "@/lib/whatsapp/modoBot";
import type { ModoBotWhatsapp, TomVozBot } from "@/lib/whatsapp/types";
import { salvarConfiguracaoWhatsapp } from "../acoes";

/**
 * Quem é a IA e quando ela fala (roadmap F4).
 *
 * O caminho comum é uma pergunta só — "quando a IA responde?" — e já vem
 * respondido (24/7). Nome, tom e as duas palavras-chave ficam atrás de
 * "Ajustes avançados": quem nunca abrir isso tem um atendimento funcionando
 * do mesmo jeito, que é a régua do roadmap (avançado escondido, padrão
 * certo).
 */

const MODOS: {
  valor: ModoBotWhatsapp;
  titulo: string;
  descricao: string;
  icone: typeof Bot;
}[] = [
  {
    valor: "24_7",
    titulo: "Sempre ativa (24/7)",
    descricao: "Responde qualquer mensagem, a qualquer hora do dia.",
    icone: Bot,
  },
  {
    valor: "noturno_e_fds",
    titulo: "Noturno e fim de semana",
    descricao: `Só fora do expediente: depois das ${EXPEDIENTE.fimHora}h, antes das ${EXPEDIENTE.inicioHora}h e nos fins de semana.`,
    icone: Moon,
  },
  {
    valor: "co_piloto_3min",
    titulo: `Co-piloto (${MINUTOS_COPILOTO} min)`,
    descricao: `Fica quieta enquanto você responde e assume depois de ${MINUTOS_COPILOTO} minutos sem você falar na conversa.`,
    icone: Timer,
  },
  {
    valor: "desativado",
    titulo: "Desligada",
    descricao: "Nunca responde. As mensagens continuam sendo registradas no painel.",
    icone: BellOff,
  },
];

export type ConfigIA = {
  nomeAssistente: string;
  tomVoz: TomVozBot;
  modoBot: ModoBotWhatsapp;
  palavraChaveAtivacao: string | null;
  palavraChaveTeste: string | null;
};

/** "a", "a" e "b", "a", "b" e "c" — lista em português, com aspas. */
function listarEmTexto(chaves: string[]): string {
  const comAspas = chaves.map((c) => `"${c}"`);
  if (comAspas.length === 1) return comAspas[0];
  return `${comAspas.slice(0, -1).join(", ")} ou ${comAspas[comAspas.length - 1]}`;
}

export function ConfiguracaoIA({
  inicial,
  aoMudarNome,
}: {
  inicial: ConfigIA | null;
  /** O playground mostra o nome no cabeçalho do chat — mantém os dois em sincronia. */
  aoMudarNome?: (nome: string) => void;
}) {
  const [modoBot, setModoBot] = useState<ModoBotWhatsapp>(inicial?.modoBot ?? "24_7");
  const [nomeAssistente, setNomeAssistente] = useState(inicial?.nomeAssistente ?? "Sofia");
  const [tomVoz, setTomVoz] = useState<TomVozBot>(inicial?.tomVoz ?? "consultivo_alto_padrao");
  const [palavraChaveAtivacao, setPalavraChaveAtivacao] = useState(
    inicial?.palavraChaveAtivacao ?? "",
  );
  const [palavraChaveTeste, setPalavraChaveTeste] = useState(inicial?.palavraChaveTeste ?? "");

  // A tela mostra as chaves que VALEM, pela mesma função que o webhook usa:
  // se ela descarta "ok" por ser curta, o corretor precisa ver isso aqui, e
  // não descobrir no atendimento que a palavra não liga nada.
  const chavesAtivacao = listarPalavrasChave(palavraChaveAtivacao);
  const chavesTeste = listarPalavrasChave(palavraChaveTeste);

  // Abre sozinho quando já existe algo configurado: ajuste invisível em
  // vigor é a mesma armadilha do filtro escondido da lista de leads.
  const temAvancado = Boolean(
    inicial?.palavraChaveAtivacao ||
      inicial?.palavraChaveTeste ||
      (inicial?.nomeAssistente && inicial.nomeAssistente !== "Sofia"),
  );
  const [mostrarAvancado, setMostrarAvancado] = useState(temAvancado);

  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    const resultado = await salvarConfiguracaoWhatsapp({
      nomeAssistente,
      tomVoz,
      modoBot,
      palavraChaveAtivacao,
      palavraChaveTeste,
    });
    setSalvando(false);
    setFeedback(resultado.erro ?? resultado.ok ?? null);
    setTimeout(() => setFeedback(null), 4000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-titulo text-lg">Quando a IA responde?</h2>
        <p className="text-fluid-sm text-apoio mt-1">
          Ela atende o cliente no seu WhatsApp, qualifica e sugere a visita. Você assume a conversa
          quando quiser.
        </p>
      </div>

      {/*
        Cada opção diz o que FAZ, não só como se chama. Os rótulos antes eram
        só título ("Modo Co-Piloto (3 min)") e nenhum descrevia o
        comportamento.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        {MODOS.map((opcao) => {
          const Icone = opcao.icone;
          const ativo = modoBot === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => setModoBot(opcao.valor)}
              aria-pressed={ativo}
              className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors ${
                ativo
                  ? "border-acento-linha bg-acento-lavado"
                  : "border-linha bg-superficie hover:border-linha-forte"
              }`}
            >
              <Icone
                aria-hidden
                className={`mb-1.5 h-5 w-5 ${ativo ? "text-acento-suave" : "text-apoio"}`}
              />
              <p className="text-fluid-sm text-titulo font-medium">{opcao.titulo}</p>
              <p className="text-fluid-xs text-apoio mt-1 leading-snug">{opcao.descricao}</p>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setMostrarAvancado((m) => !m)}
        aria-expanded={mostrarAvancado}
        className="text-fluid-sm text-apoio hover:text-titulo min-h-11 cursor-pointer transition-colors"
      >
        {mostrarAvancado ? "− Ocultar ajustes avançados" : "+ Ajustes avançados"}
      </button>

      {mostrarAvancado && (
        <div className="border-linha bg-superficie space-y-5 rounded-2xl border p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-fluid-xs text-apoio block" htmlFor="nome-assistente">
                Nome da assistente
              </label>
              <input
                id="nome-assistente"
                type="text"
                value={nomeAssistente}
                onChange={(e) => {
                  setNomeAssistente(e.target.value);
                  aoMudarNome?.(e.target.value);
                }}
                className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3.5 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-fluid-xs text-apoio block" htmlFor="tom-voz">
                Tom de voz
              </label>
              <select
                id="tom-voz"
                value={tomVoz}
                onChange={(e) => setTomVoz(e.target.value as TomVozBot)}
                className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full cursor-pointer rounded-xl border px-3.5 focus:outline-none"
              >
                <option value="consultivo_alto_padrao">Consultivo e alto padrão</option>
                <option value="formal_direto">Formal e direto</option>
                <option value="descontraido_acolhedor">Descontraído e acolhedor</option>
              </select>
            </div>
          </div>

          <div className="border-linha space-y-1.5 border-t pt-4">
            <label className="text-fluid-xs text-apoio block" htmlFor="palavra-ativacao">
              Palavras-chave de ativação (opcional)
            </label>
            <input
              id="palavra-ativacao"
              type="text"
              value={palavraChaveAtivacao}
              onChange={(e) => setPalavraChaveAtivacao(e.target.value)}
              placeholder="ex: pode continuar, assume aí, sofia entra"
              className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 focus:outline-none"
            />
            <p className="text-fluid-xs text-apoio leading-snug">
              {chavesAtivacao.length > 0
                ? `A IA fica em silêncio em conversas novas até você digitar ${listarEmTexto(chavesAtivacao)} no próprio chat do WhatsApp — aí ela assume, sem o cliente perceber a troca.`
                : "Em branco, a IA responde normalmente. Se preencher, ela só entra em ação depois que você digitar uma destas frases no chat — útil para atender pessoalmente o início e só depois passar a bola."}
            </p>
            <p className="text-fluid-xs text-tenue leading-snug">
              Separe por vírgula para cadastrar mais de uma — no meio do atendimento ninguém lembra
              da frase exata. Cada uma precisa de pelo menos 3 letras.
            </p>
          </div>

          <div className="border-linha space-y-1.5 border-t pt-4">
            <label className="text-fluid-xs text-apoio block" htmlFor="palavra-teste">
              Palavra-chave de teste (opcional)
            </label>
            <input
              id="palavra-teste"
              type="text"
              value={palavraChaveTeste}
              onChange={(e) => setPalavraChaveTeste(e.target.value)}
              placeholder="ex: modo teste agora"
              className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 focus:outline-none"
            />
            <p className="text-fluid-xs text-apoio leading-snug">
              {chavesTeste.length > 0
                ? `Digitar ${listarEmTexto(chavesTeste)} no chat liga a IA E marca a conversa como teste: ela sai das análises de qualidade e nunca vira exemplo de treinamento.`
                : "Serve para testar sem sujar o aprendizado da IA. Também aceita várias, separadas por vírgula — e precisam ser diferentes das de ativação."}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {feedback && <span className="text-fluid-xs text-ok">{feedback}</span>}
        <button
          onClick={salvar}
          disabled={salvando}
          className="bg-acento hover:bg-acento-hover text-fluid-sm flex min-h-12 cursor-pointer items-center rounded-xl px-6 font-medium text-white transition-colors disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
