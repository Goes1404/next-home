"use client";

import { site } from "@/lib/site";
import { useState } from "react";
import { Bot, BellOff, Moon } from "lucide-react";
import { EXPEDIENTE, listarPalavrasChave } from "@/lib/whatsapp/modoBot";
import { problemaDaPalavraChave } from "@/lib/whatsapp/palavraChaveDiscreta";
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
    descricao: "Responde a qualquer hora. Quando você fala numa conversa, ela sai dali e só volta com a palavra-chave ou \"IA assume agora\".",
    icone: Bot,
  },
  {
    valor: "noturno_e_fds",
    titulo: "Noturno e fim de semana",
    descricao: "Só fora do seu expediente (escolhido abaixo): à noite, de madrugada e nos fins de semana.",
    icone: Moon,
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
  palavrasEntradaCliente: string | null;
  expedienteInicio: number;
  expedienteFim: number;
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
  const [nomeAssistente, setNomeAssistente] = useState(inicial?.nomeAssistente ?? site.assistente);
  const [tomVoz, setTomVoz] = useState<TomVozBot>(inicial?.tomVoz ?? "consultivo_alto_padrao");
  const [palavraChaveAtivacao, setPalavraChaveAtivacao] = useState(
    inicial?.palavraChaveAtivacao ?? "",
  );
  const [palavraChaveTeste, setPalavraChaveTeste] = useState(inicial?.palavraChaveTeste ?? "");
  const [expedienteInicio, setExpedienteInicio] = useState(inicial?.expedienteInicio ?? EXPEDIENTE.inicioHora);
  const [expedienteFim, setExpedienteFim] = useState(inicial?.expedienteFim ?? EXPEDIENTE.fimHora);
  const [palavrasEntradaCliente, setPalavrasEntradaCliente] = useState(
    inicial?.palavrasEntradaCliente ?? "",
  );

  // A tela mostra as chaves que VALEM, pela mesma função que o webhook usa:
  // se ela descarta "ok" por ser curta, o corretor precisa ver isso aqui, e
  // não descobrir no atendimento que a palavra não liga nada.
  const chavesAtivacao = listarPalavrasChave(palavraChaveAtivacao);
  const chavesTeste = listarPalavrasChave(palavraChaveTeste);
  const chavesEntrada = listarPalavrasChave(palavrasEntradaCliente);
  // A mesma régua do servidor (regra N8): a tela avisa antes de salvar, e
  // avisa também sobre a palavra antiga que continua valendo mas é óbvia.
  const avisosAtivacao = chavesAtivacao.map(problemaDaPalavraChave).filter(Boolean);
  const avisosTeste = chavesTeste.map(problemaDaPalavraChave).filter(Boolean);

  // Abre sozinho quando já existe algo configurado: ajuste invisível em
  // vigor é a mesma armadilha do filtro escondido da lista de leads.
  const temAvancado = Boolean(
    inicial?.palavraChaveAtivacao ||
      inicial?.palavraChaveTeste ||
      inicial?.palavrasEntradaCliente ||
      (inicial?.nomeAssistente && inicial.nomeAssistente !== site.assistente),
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
      palavrasEntradaCliente,
      expedienteInicio,
      expedienteFim,
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

      {/* Um expediente só (0148): vale para o modo "fora do expediente" e
          limita a janela em que as listas de transmissão e o lembrete de
          visita saem — dentro da janela segura de 9h às 20h59. */}
      <fieldset className="border-linha space-y-2 rounded-2xl border p-4">
        <legend className="text-fluid-sm text-titulo px-1 font-medium">Seu expediente</legend>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-fluid-xs text-apoio" htmlFor="expediente-inicio">
            Das
          </label>
          <select
            id="expediente-inicio"
            value={expedienteInicio}
            onChange={(e) => setExpedienteInicio(Number(e.target.value))}
            className="text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 cursor-pointer rounded-xl border px-3"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
          <label className="text-fluid-xs text-apoio" htmlFor="expediente-fim">
            às
          </label>
          <select
            id="expediente-fim"
            value={expedienteFim}
            onChange={(e) => setExpedienteFim(Number(e.target.value))}
            className="text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 cursor-pointer rounded-xl border px-3"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
        <p className="text-fluid-xs text-apoio leading-snug">
          No modo &ldquo;Noturno e fim de semana&rdquo;, a IA fica quieta nesse horário de segunda a
          sexta. As listas de transmissão e o lembrete de visita só saem dentro dele, e nunca antes
          das 9h, depois das 20h59 ou aos domingos.
        </p>
      </fieldset>

      <button
        type="button"
        onClick={() => setMostrarAvancado((m) => !m)}
        aria-expanded={mostrarAvancado}
        className="text-fluid-sm text-apoio hover:text-titulo min-h-11 cursor-pointer transition-colors"
      >
        {mostrarAvancado ? "− Ocultar ajustes avançados" : "+ Ajustes avançados"}
      </button>

      {mostrarAvancado && (
        <div className="cartao space-y-5 p-5">
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
              placeholder="ex: vou te passar os detalhes.."
              className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 focus:outline-none"
            />
            <p className="text-fluid-xs text-apoio leading-snug">
              {chavesAtivacao.length > 0
                ? `Digitar ${listarEmTexto(chavesAtivacao)} no próprio chat do WhatsApp entrega a conversa para a IA. Se o número ainda não está no seu CRM, ele é cadastrado na hora, com o histórico do chat quando for possível trazer.`
                : "Cadastre uma frase para entregar a conversa à IA digitando no próprio chat. Se o número ainda não estiver no seu CRM, ele é cadastrado na hora. O botão \"IA assume agora\" das Conversas também libera."}
            </p>
            <p className="text-fluid-xs text-tenue leading-snug">
              O cliente lê essa mensagem, então a palavra precisa ser discreta e algo que você não diz
              por acaso: um sinal no fim de uma frase (&ldquo;vou te passar os detalhes..&rdquo;), uma
              expressão rara mas natural, ou um emoji que você não costuma mandar. Pelo menos 6
              caracteres. Separe por vírgula para cadastrar mais de uma.
            </p>
            {avisosAtivacao.map((aviso) => (
              <p key={aviso} className="text-fluid-xs text-alerta leading-snug">
                {aviso} Troque antes que ela dispare por engano.
              </p>
            ))}
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
            {avisosTeste.map((aviso) => (
              <p key={aviso} className="text-fluid-xs text-alerta leading-snug">
                {aviso}
              </p>
            ))}
          </div>

          {/* A porta de entrada do CLIENTE (0056). Fica DEPOIS das duas do
              corretor de propósito: é a única que afrouxa a trava, e quem
              a liga precisa ler o aviso embaixo. */}
          <div className="border-linha space-y-1.5 border-t pt-4">
            <label className="text-fluid-xs text-apoio block" htmlFor="palavras-entrada">
              Frases que o CLIENTE escreve e ligam a IA (opcional)
            </label>
            <input
              id="palavras-entrada"
              type="text"
              value={palavrasEntradaCliente}
              onChange={(e) => setPalavrasEntradaCliente(e.target.value)}
              placeholder="ex: vim pelo anúncio"
              className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 focus:outline-none"
            />
            <p className="text-fluid-xs text-apoio leading-snug">
              {chavesEntrada.length > 0
                ? `Quem escrever ${listarEmTexto(chavesEntrada)} é atendido na hora, sem você precisar liberar. Quem escrever qualquer outra coisa continua esperando você.`
                : "Em branco, todo número desconhecido espera você liberar a conversa. Preencha para que quem vier de um anúncio seja atendido sozinho — útil quando o volume aumenta."}
            </p>
            <p className="text-fluid-xs text-tenue leading-snug">
              Use frases que só quem viu sua divulgação escreveria. Elas afrouxam a trava de
              propósito: quanto mais genérica a frase, mais gente a IA atende sem você saber.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {feedback && <span className="text-fluid-xs text-ok">{feedback}</span>}
        <button
          onClick={salvar}
          disabled={salvando}
          className="bg-acento hover:bg-acento-hover text-fluid-sm flex min-h-12 cursor-pointer items-center rounded-xl px-6 font-medium text-sobre-cor transition-colors disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
