import type { ItemFilaCampanha } from "./types";

/** Piso e teto do intervalo humanizado entre disparos, em segundos. */
export const INTERVALO_MINIMO_SEGUNDOS = 35;
export const INTERVALO_MAXIMO_SEGUNDOS = 75;

/**
 * Gera mensagens hiper-personalizadas por IA para cada lead da fila de disparo.
 *
 * Duas proteções anti-ban vivem aqui, e as duas precisam ser observáveis:
 * o espaçamento entre disparos e a variação do texto. Quando a variação por
 * IA não roda (sem chave, erro ou timeout), cada item sai marcado com
 * `personalizadoPorIA: false` — a fila não pode fingir que está protegida.
 */
export async function gerarMensagensCampanhaPersonalizadas(params: {
  campanhaId: string;
  leads: { id: string; nome: string; telefone: string; historicoOuInteresse?: string }[];
  mensagemBase: string;
  empreendimentoNome?: string;
  intervaloSegundosMinimo?: number;
}): Promise<ItemFilaCampanha[]> {
  const {
    campanhaId,
    leads,
    mensagemBase,
    empreendimentoNome,
    intervaloSegundosMinimo = INTERVALO_MINIMO_SEGUNDOS,
  } = params;
  const agora = Date.now();

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    console.warn(
      "Campanha sem GEMINI_API_KEY: as mensagens sairão sem variação por IA, aumentando o risco de bloqueio por spam.",
    );
  }

  const itensFila: ItemFilaCampanha[] = [];

  // Acumulador, não `i * delay`: como cada volta sorteia o próprio atraso,
  // multiplicar pelo índice faz o instante de um item ficar ANTES do
  // anterior quando o sorteio cai baixo (ex.: 2º sorteia 75s e 3º sorteia
  // 35s → 150s e 105s). Isso agruparia disparos no mesmo segundo, que é
  // exatamente o padrão que a proteção deveria evitar.
  let deslocamentoSegundos = 0;

  for (const lead of leads) {
    const janela = Math.max(1, INTERVALO_MAXIMO_SEGUNDOS - intervaloSegundosMinimo);
    const atrasoSegundos = intervaloSegundosMinimo + Math.floor(Math.random() * janela);
    const agendadoPara = new Date(agora + deslocamentoSegundos * 1000).toISOString();
    deslocamentoSegundos += atrasoSegundos;

    let textoFinal = mensagemBase
      .replace(/{nome}/gi, lead.nome || "Tudo bem?")
      .replace(/{imovel}/gi, empreendimentoNome || "nossos lançamentos em Alphaville");

    let personalizadoPorIA = false;

    // Se houver Gemini API Key, hiper-personaliza a saudação para que nenhuma mensagem seja idêntica
    if (apiKey && lead.nome) {
      try {
        const promptVariacao = `Você é um redator imobiliário sênior da Next Home.
Reescreva a mensagem abaixo para o cliente "${lead.nome}", mantendo o objetivo de negócio e o tom consultivo e elegante, mas variando a saudação e vocabulário para torná-la 100% natural, humana e única.
Nunca use emojis em excesso. Máximo 2 parágrafos curtos.

Mensagem Original:
${textoFinal}

Mensagem Reescrita (apenas o texto puro da mensagem):`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: promptVariacao }] }],
              generationConfig: { temperature: 0.7 },
            }),
          },
        );

        if (res.ok) {
          const json = await res.json();
          const textoGerado = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textoGerado && textoGerado.trim().length > 15) {
            textoFinal = textoGerado.trim();
            personalizadoPorIA = true;
          }
        }
      } catch (err) {
        console.warn("Fallback para mensagem base na fila:", err);
      }
    }

    itensFila.push({
      id: `fila-${campanhaId}-${lead.id}`,
      campanhaId,
      leadId: lead.id,
      telefone: lead.telefone,
      mensagemPersonalizada: textoFinal,
      personalizadoPorIA,
      status: "pendente",
      agendadoPara,
      enviadoEm: null,
      respostaEm: null,
      erroMotivo: null,
      createdAt: new Date().toISOString(),
    });
  }

  return itensFila;
}
