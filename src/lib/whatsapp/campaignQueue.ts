import { dentroDaJanela } from "./antiBan";
import type { ItemFilaCampanha } from "./types";

/** Piso e teto do intervalo humanizado entre disparos, em segundos. */
export const INTERVALO_MINIMO_SEGUNDOS = 35;
export const INTERVALO_MAXIMO_SEGUNDOS = 75;

/**
 * Empurra o horário até cair dentro da janela permitida.
 *
 * Uma fila longa começa às 19h e naturalmente atravessaria a madrugada;
 * sem isto, o número mandaria mensagem às 3h — um dos padrões mais
 * característicos de robô que existe.
 */
function proximoHorarioPermitido(instante: Date): Date {
  let candidato = new Date(instante);
  // Avança de 30 em 30 min por até uma semana; passou disso, algo está
  // errado na configuração e é melhor devolver o valor original do que
  // girar para sempre.
  for (let i = 0; i < 336; i++) {
    if (dentroDaJanela(candidato)) return candidato;
    candidato = new Date(candidato.getTime() + 30 * 60_000);
  }
  return instante;
}

/**
 * Aplica os marcadores do template ao lead. Barato, sem rede.
 */
export function aplicarTemplate(params: {
  mensagemBase: string;
  nomeLead: string;
  empreendimentoNome?: string;
}): string {
  return params.mensagemBase
    .replace(/{nome}/gi, params.nomeLead || "Tudo bem?")
    .replace(/{imovel}/gi, params.empreendimentoNome || "nossos lançamentos em Alphaville");
}

/**
 * Reescreve UMA mensagem com o Gemini para que nenhum disparo saia idêntico
 * a outro — a proteção anti-ban de variação de texto.
 *
 * Devolve `personalizadoPorIA: false` (e o texto original intacto) sempre
 * que a variação não acontecer de fato: sem chave, erro de rede, resposta
 * vazia. A fila não pode fingir que está protegida quando não está.
 *
 * Uma chamada por mensagem, chamada no momento do ENVIO e não na criação da
 * campanha. Fazer as N chamadas de uma vez, em série, dentro da server
 * action de criar campanha era o que estourava o tempo da função antes de a
 * fila chegar a ser gravada — campanha com algumas dezenas de leads
 * simplesmente não nascia.
 */
export async function variarMensagemComIA(params: {
  texto: string;
  nomeLead: string;
  timeoutMs?: number;
}): Promise<{ texto: string; personalizadoPorIA: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const semVariacao = { texto: params.texto, personalizadoPorIA: false };

  if (!apiKey || !params.nomeLead) return semVariacao;

  const promptVariacao = `Você é um redator imobiliário sênior da Next Home.
Reescreva a mensagem abaixo para o cliente "${params.nomeLead}", mantendo o objetivo de negócio e o tom consultivo e elegante, mas variando a saudação e vocabulário para torná-la 100% natural, humana e única.
Nunca use emojis em excesso. Máximo 2 parágrafos curtos.

Mensagem Original:
${params.texto}

Mensagem Reescrita (apenas o texto puro da mensagem):`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs ?? 12000);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: promptVariacao }] }],
          generationConfig: { temperature: 0.7 },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);
    if (!res.ok) return semVariacao;

    const json = await res.json();
    const textoGerado = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textoGerado && textoGerado.trim().length > 15) {
      return { texto: textoGerado.trim(), personalizadoPorIA: true };
    }
  } catch (err) {
    console.warn("Variação por IA indisponível; mantendo o texto base:", err);
  }

  return semVariacao;
}

/**
 * Calcula os horários humanizados de uma fila de disparo, sem tocar em rede.
 *
 * A proteção que vive aqui é o espaçamento: 35-75s entre disparos, sempre
 * dentro do horário comercial. É este cálculo que o disparador obedece —
 * ele nunca manda um item antes de `agendadoPara`.
 */
export function montarFilaCampanha(params: {
  campanhaId: string;
  leads: { id: string; nome: string; telefone: string }[];
  mensagemBase: string;
  empreendimentoNome?: string;
  intervaloSegundosMinimo?: number;
}): ItemFilaCampanha[] {
  const { campanhaId, leads, mensagemBase, empreendimentoNome } = params;
  const intervaloSegundosMinimo = params.intervaloSegundosMinimo ?? INTERVALO_MINIMO_SEGUNDOS;
  const agora = Date.now();

  const itens: ItemFilaCampanha[] = [];

  // Acumulador, não `i * delay`: como cada volta sorteia o próprio atraso,
  // multiplicar pelo índice faz o instante de um item ficar ANTES do
  // anterior quando o sorteio cai baixo (ex.: 2º sorteia 75s e 3º sorteia
  // 35s → 150s e 105s). Isso agruparia disparos no mesmo segundo, que é
  // exatamente o padrão que a proteção deveria evitar.
  let deslocamentoSegundos = 0;
  // Último instante agendado: o guarda de monotonicidade. Empurrar dois
  // itens para a próxima janela pode INVERTER a ordem — quem cruza uma
  // fronteira de hora ganha um degrau de 30 min a menos no
  // `proximoHorarioPermitido` e cai ANTES do item anterior (flagrado pelo
  // teste rodando de madrugada). Nenhum item pode agendar antes do
  // anterior + intervalo humanizado.
  let anteriorMs = 0;

  for (const lead of leads) {
    const janela = Math.max(1, INTERVALO_MAXIMO_SEGUNDOS - intervaloSegundosMinimo);
    const atrasoSegundos = intervaloSegundosMinimo + Math.floor(Math.random() * janela);

    // Empurra para dentro do horário comercial antes de gravar: uma fila
    // longa iniciada no fim da tarde escorregaria para a madrugada.
    const bruto = new Date(agora + deslocamentoSegundos * 1000);
    let agendado = proximoHorarioPermitido(bruto);
    if (anteriorMs > 0 && agendado.getTime() < anteriorMs + atrasoSegundos * 1000) {
      agendado = proximoHorarioPermitido(new Date(anteriorMs + atrasoSegundos * 1000));
    }
    anteriorMs = agendado.getTime();
    const agendadoPara = agendado.toISOString();
    deslocamentoSegundos += atrasoSegundos;

    itens.push({
      id: `fila-${campanhaId}-${lead.id}`,
      campanhaId,
      leadId: lead.id,
      telefone: lead.telefone,
      mensagemPersonalizada: aplicarTemplate({
        mensagemBase,
        nomeLead: lead.nome,
        empreendimentoNome,
      }),
      // A variação por IA acontece no envio (ver `variarMensagemComIA`).
      // Nasce false porque, neste instante, ela de fato ainda não ocorreu.
      personalizadoPorIA: false,
      status: "pendente",
      agendadoPara,
      enviadoEm: null,
      respostaEm: null,
      erroMotivo: null,
      createdAt: new Date().toISOString(),
    });
  }

  return itens;
}

/**
 * Monta a fila JÁ com a variação por IA aplicada em todos os itens.
 *
 * Continua existindo para o preview do painel, que roda sobre uma amostra
 * de 3 leads e precisa mostrar ao corretor o texto exato que sairia. Para a
 * fila de verdade use `montarFilaCampanha` + `variarMensagemComIA` no
 * envio: N chamadas de IA na criação da campanha não cabem no tempo de uma
 * server action, nem em paralelo (a cota do Gemini rejeita a rajada).
 */
export async function gerarMensagensCampanhaPersonalizadas(params: {
  campanhaId: string;
  leads: { id: string; nome: string; telefone: string; historicoOuInteresse?: string }[];
  mensagemBase: string;
  empreendimentoNome?: string;
  intervaloSegundosMinimo?: number;
}): Promise<ItemFilaCampanha[]> {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_AI_API_KEY) {
    console.warn(
      "Campanha sem GEMINI_API_KEY: as mensagens sairão sem variação por IA, aumentando o risco de bloqueio por spam.",
    );
  }

  const itens = montarFilaCampanha(params);

  return Promise.all(
    itens.map(async (item, indice) => {
      const variacao = await variarMensagemComIA({
        texto: item.mensagemPersonalizada,
        nomeLead: params.leads[indice]?.nome ?? "",
      });
      return {
        ...item,
        mensagemPersonalizada: variacao.texto,
        personalizadoPorIA: variacao.personalizadoPorIA,
      };
    }),
  );
}
